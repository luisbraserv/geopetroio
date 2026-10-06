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
		if (setorIds != null && !setorIds.isEmpty()) {
			return repository.findBySetorIdInOrderByNomeAsc(setorIds);
		}
		if (setorId != null) {
			return repository.findBySetorIdOrderByNomeAsc(setorId);
		}
		if (regionalId != null) {
			return repository.findBySetor_RegionalIdOrderByNomeAsc(regionalId);
		}
		return repository.findAll();
	}

	@Transactional(readOnly = true)
	public Page<UnidadeEntity> listar(String busca, Pageable pageable) {
		if (busca == null || busca.isBlank()) {
			return repository.findAll(pageable);
		}
		String termo = busca.trim();
		return repository.findByNomeContainingIgnoreCaseOrApelidoContainingIgnoreCase(termo, termo, pageable);
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

	@Transactional
	public void excluir(Long id) {
		UnidadeEntity unidade = buscar(id);
		guarda.garantirSemVinculo(Cadastro.UNIDADE, id, "a unidade");
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
