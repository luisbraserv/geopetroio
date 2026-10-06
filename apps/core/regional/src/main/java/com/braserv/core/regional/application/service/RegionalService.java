package com.braserv.core.regional.application.service;

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
import com.braserv.core.regional.adapter.in.web.request.RegionalRequest;
import com.braserv.core.regional.adapter.out.persistence.entity.RegionalEntity;
import com.braserv.core.regional.adapter.out.persistence.repository.RegionalJpaRepository;

@Service
public class RegionalService {

	private final RegionalJpaRepository repository;
	private final GuardaDeExclusao guarda;

	public RegionalService(RegionalJpaRepository repository, GuardaDeExclusao guarda) {
		this.repository = repository;
		this.guarda = guarda;
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
		guarda.garantirSemVinculo(Cadastro.REGIONAL, id, "a regional");
		repository.deleteById(id);
	}

	private RegionalEntity aplicar(RegionalEntity regional, RegionalRequest request) {
		regional.setNome(request.nome());
		regional.setCentroCusto(request.centroCusto());
		return regional;
	}
}
