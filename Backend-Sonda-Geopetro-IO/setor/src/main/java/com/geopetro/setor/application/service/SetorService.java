package com.geopetro.setor.application.service;

import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.geopetro.core.exception.ResourceNotFoundException;
import com.geopetro.regional.adapter.out.persistence.entity.RegionalEntity;
import com.geopetro.regional.adapter.out.persistence.repository.RegionalJpaRepository;
import com.geopetro.setor.adapter.in.web.request.SetorRequest;
import com.geopetro.setor.adapter.out.persistence.entity.SetorEntity;
import com.geopetro.setor.adapter.out.persistence.repository.SetorJpaRepository;

@Service
public class SetorService {

	private final SetorJpaRepository repository;
	private final RegionalJpaRepository regionalRepository;

	public SetorService(SetorJpaRepository repository, RegionalJpaRepository regionalRepository) {
		this.repository = repository;
		this.regionalRepository = regionalRepository;
	}

	@Transactional(readOnly = true)
	public List<SetorEntity> listar(Long regionalId) {
		if (regionalId != null) {
			return repository.findByRegionalIdOrderByNomeAsc(regionalId);
		}
		return repository.findAll();
	}

	@Transactional(readOnly = true)
	public Page<SetorEntity> listar(String busca, Long regionalId, Pageable pageable) {
		boolean temBusca = busca != null && !busca.isBlank();
		if (temBusca && regionalId != null) {
			return repository.findByNomeContainingIgnoreCaseAndRegionalId(busca.trim(), regionalId, pageable);
		}
		if (temBusca) {
			return repository.findByNomeContainingIgnoreCase(busca.trim(), pageable);
		}
		if (regionalId != null) {
			return repository.findByRegionalId(regionalId, pageable);
		}
		return repository.findAll(pageable);
	}

	@Transactional(readOnly = true)
	public SetorEntity buscar(Long id) {
		return repository.findById(id)
				.orElseThrow(() -> new ResourceNotFoundException("Setor nao encontrado."));
	}

	@Transactional
	public SetorEntity criar(SetorRequest request) {
		return repository.save(aplicar(new SetorEntity(), request));
	}

	@Transactional
	public SetorEntity atualizar(Long id, SetorRequest request) {
		return repository.save(aplicar(buscar(id), request));
	}

	@Transactional
	public void excluir(Long id) {
		repository.delete(buscar(id));
	}

	private SetorEntity aplicar(SetorEntity setor, SetorRequest request) {
		RegionalEntity regional = regionalRepository.findById(request.regionalId())
				.orElseThrow(() -> new ResourceNotFoundException("Regional nao encontrada."));
		setor.setNome(request.nome());
		setor.setCentroCusto(request.centroCusto());
		setor.setRegional(regional);
		return setor;
	}
}
