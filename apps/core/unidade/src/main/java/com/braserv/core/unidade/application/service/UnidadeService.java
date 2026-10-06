package com.braserv.core.unidade.application.service;

import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.braserv.core.comum.exception.BusinessException;
import com.braserv.core.comum.exception.ResourceNotFoundException;
import com.braserv.core.comum.port.VinculoCadastroPort.Cadastro;
import com.braserv.core.comum.vinculo.GuardaDeExclusao;
import com.braserv.core.setor.adapter.out.persistence.entity.SetorEntity;
import com.braserv.core.setor.adapter.out.persistence.repository.SetorJpaRepository;
import com.braserv.core.unidade.adapter.in.web.request.UnidadeRequest;
import com.braserv.core.unidade.adapter.out.persistence.entity.UnidadeEntity;
import com.braserv.core.unidade.domain.StatusUnidade;
import com.braserv.core.unidade.repository.UnidadeJpaRepository;

@Service
public class UnidadeService {

	private final UnidadeJpaRepository repository;
	private final SetorJpaRepository setorRepository;
	private final GuardaDeExclusao guarda;

	public UnidadeService(UnidadeJpaRepository repository, SetorJpaRepository setorRepository,
			GuardaDeExclusao guarda) {
		this.repository = repository;
		this.setorRepository = setorRepository;
		this.guarda = guarda;
	}

	@Transactional(readOnly = true)
	public List<UnidadeEntity> listar(Long setorId, List<Long> setorIds, Long regionalId) {
		return listar(setorId, setorIds, regionalId, null);
	}

	/** @param status filtro opcional; nulo lista ativas e inativas (RN-116) */
	@Transactional(readOnly = true)
	public List<UnidadeEntity> listar(Long setorId, List<Long> setorIds, Long regionalId, StatusUnidade status) {
		List<UnidadeEntity> unidades;
		if (setorIds != null && !setorIds.isEmpty()) {
			unidades = repository.findBySetorIdInOrderByNomeAsc(setorIds);
		} else if (setorId != null) {
			unidades = repository.findBySetorIdOrderByNomeAsc(setorId);
		} else if (regionalId != null) {
			unidades = repository.findBySetor_RegionalIdOrderByNomeAsc(regionalId);
		} else {
			unidades = repository.findAll();
		}
		// A frota tem dezenas de unidades: filtrar em memoria evita duplicar cada consulta por status.
		return status == null ? unidades : unidades.stream().filter(u -> u.getStatus() == status).toList();
	}

	@Transactional(readOnly = true)
	public Page<UnidadeEntity> listarPagina(String busca, StatusUnidade status, Pageable pageable) {
		String termo = busca == null || busca.isBlank() ? null : busca.trim();
		return repository.buscar(termo, status, pageable);
	}

	@Transactional(readOnly = true)
	public UnidadeEntity buscar(Long id) {
		return repository.findById(id)
				.orElseThrow(() -> new ResourceNotFoundException("Unidade nao encontrada."));
	}

	@Transactional
	public UnidadeEntity criar(UnidadeRequest request) {
		if (repository.existsByNome(request.nome())) {
			throw new BusinessException("Ja existe uma unidade com esse nome.", HttpStatus.CONFLICT);
		}
		return repository.save(aplicar(new UnidadeEntity(), request));
	}

	@Transactional
	public UnidadeEntity atualizar(Long id, UnidadeRequest request) {
		if (repository.existsByNomeAndIdNot(request.nome(), id)) {
			throw new BusinessException("Ja existe uma unidade com esse nome.", HttpStatus.CONFLICT);
		}
		return repository.save(aplicar(buscar(id), request));
	}

	/** Tira a unidade de uso sem apagar nada — RN-116. Idempotente. */
	@Transactional
	public void inativar(Long id) {
		buscar(id).setStatus(StatusUnidade.INATIVA);
	}

	/** Devolve a unidade ao uso; concessoes que ela ja tinha voltam a valer. Idempotente. */
	@Transactional
	public void ativar(Long id) {
		buscar(id).setStatus(StatusUnidade.ATIVA);
	}

	/**
	 * Exclusao fisica so de unidade que nunca foi usada — RN-116.
	 *
	 * <p>A guarda consulta as concessoes a clientes, aqui no core, e o Geopetro-Backend, que responde
	 * por limites, cards, alarmes e telemetria. Sem a confirmacao do backend, a exclusao e recusada.
	 */
	@Transactional
	public void excluir(Long id) {
		UnidadeEntity unidade = buscar(id);
		guarda.garantirSemVinculo(Cadastro.UNIDADE, id, "a unidade " + unidade.getNome(), "Use inativar.");
		repository.delete(unidade);
	}

	private UnidadeEntity aplicar(UnidadeEntity unidade, UnidadeRequest request) {
		SetorEntity setor = setorRepository.findById(request.setorId())
				.orElseThrow(() -> new ResourceNotFoundException("Setor nao encontrado."));
		unidade.setNome(request.nome());
		unidade.setApelido(request.apelido());
		unidade.setTipo(request.tipo());
		unidade.setSetor(setor);
		return unidade;
	}
}
