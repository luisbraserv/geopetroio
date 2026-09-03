package com.geopetro.regional.application.service;

import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.geopetro.core.exception.BusinessException;
import com.geopetro.core.exception.ResourceNotFoundException;
import com.geopetro.core.port.RegionalConsultaPort;
import com.geopetro.regional.adapter.in.web.request.RegionalRequest;
import com.geopetro.regional.adapter.out.persistence.entity.RegionalEntity;
import com.geopetro.regional.adapter.out.persistence.repository.RegionalJpaRepository;

@Service
public class RegionalService {

	private final RegionalJpaRepository repository;
	private final List<RegionalConsultaPort> vinculoConsultas;

	public RegionalService(RegionalJpaRepository repository, List<RegionalConsultaPort> vinculoConsultas) {
		this.repository = repository;
		this.vinculoConsultas = vinculoConsultas;
	}

	@Transactional(readOnly = true)
	public List<RegionalEntity> listar() {
		return repository.findAll();
	}

	@Transactional(readOnly = true)
	public Page<RegionalEntity> listar(String busca, Pageable pageable) {
		if (busca == null || busca.isBlank()) {
			return repository.findAll(pageable);
		}
		return repository.findByNomeContainingIgnoreCase(busca.trim(), pageable);
	}

	@Transactional(readOnly = true)
	public RegionalEntity buscar(Long id) {
		return repository.findById(id)
				.orElseThrow(() -> new ResourceNotFoundException("Regional nao encontrada."));
	}

	@Transactional
	public RegionalEntity criar(RegionalRequest request) {
		if (repository.existsByNomeIgnoreCase(request.nome())) {
			throw new BusinessException("Ja existe uma regional com esse nome.", HttpStatus.CONFLICT);
		}
		return repository.save(aplicar(new RegionalEntity(), request));
	}

	@Transactional
	public RegionalEntity atualizar(Long id, RegionalRequest request) {
		if (repository.existsByNomeIgnoreCaseAndIdNot(request.nome(), id)) {
			throw new BusinessException("Ja existe uma regional com esse nome.", HttpStatus.CONFLICT);
		}
		return repository.save(aplicar(buscar(id), request));
	}

	@Transactional
	public void excluir(Long id) {
		buscar(id);
		boolean possuiVinculos = vinculoConsultas.stream().anyMatch(c -> c.existeVinculoParaRegional(id));
		if (possuiVinculos) {
			throw new BusinessException(
					"Nao e possivel excluir a regional pois existem setores ou unidades/sondas vinculados.",
					HttpStatus.CONFLICT);
		}
		repository.deleteById(id);
	}

	private RegionalEntity aplicar(RegionalEntity regional, RegionalRequest request) {
		regional.setNome(request.nome());
		regional.setCentroCusto(request.centroCusto());
		return regional;
	}
}
