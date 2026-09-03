package com.geopetro.unidadesonda.application.service;

import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.geopetro.core.exception.BusinessException;
import com.geopetro.core.exception.ResourceNotFoundException;
import com.geopetro.setor.adapter.out.persistence.entity.SetorEntity;
import com.geopetro.setor.adapter.out.persistence.repository.SetorJpaRepository;
import com.geopetro.unidadesonda.adapter.in.web.request.UnidadeSondaRequest;
import com.geopetro.unidadesonda.adapter.out.persistence.entity.UnidadeSondaEntity;
import com.geopetro.unidadesonda.repository.UnidadeSondaJpaRepository;

@Service
public class UnidadeSondaService {

	private final UnidadeSondaJpaRepository repository;
	private final SetorJpaRepository setorRepository;

	public UnidadeSondaService(UnidadeSondaJpaRepository repository, SetorJpaRepository setorRepository) {
		this.repository = repository;
		this.setorRepository = setorRepository;
	}

	@Transactional(readOnly = true)
	public List<UnidadeSondaEntity> listar(Long setorId, List<Long> setorIds, Long regionalId) {
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
	public Page<UnidadeSondaEntity> listar(String busca, Pageable pageable) {
		if (busca == null || busca.isBlank()) {
			return repository.findAll(pageable);
		}
		String termo = busca.trim();
		return repository.findByNomeContainingIgnoreCaseOrApelidoContainingIgnoreCase(termo, termo, pageable);
	}

	@Transactional(readOnly = true)
	public UnidadeSondaEntity buscar(Long id) {
		return repository.findById(id)
				.orElseThrow(() -> new ResourceNotFoundException("Unidade/Sonda nao encontrada."));
	}

	@Transactional
	public UnidadeSondaEntity criar(UnidadeSondaRequest request) {
		if (repository.existsByNome(request.nome())) {
			throw new BusinessException("Ja existe uma unidade/sonda com esse nome.", HttpStatus.CONFLICT);
		}
		return repository.save(aplicar(new UnidadeSondaEntity(), request));
	}

	@Transactional
	public UnidadeSondaEntity atualizar(Long id, UnidadeSondaRequest request) {
		if (repository.existsByNomeAndIdNot(request.nome(), id)) {
			throw new BusinessException("Ja existe uma unidade/sonda com esse nome.", HttpStatus.CONFLICT);
		}
		return repository.save(aplicar(buscar(id), request));
	}

	@Transactional
	public void excluir(Long id) {
		repository.delete(buscar(id));
	}

	private UnidadeSondaEntity aplicar(UnidadeSondaEntity unidade, UnidadeSondaRequest request) {
		SetorEntity setor = setorRepository.findById(request.setorId())
				.orElseThrow(() -> new ResourceNotFoundException("Setor nao encontrado."));
		unidade.setNome(request.nome());
		unidade.setApelido(request.apelido());
		unidade.setSetor(setor);
		return unidade;
	}
}
