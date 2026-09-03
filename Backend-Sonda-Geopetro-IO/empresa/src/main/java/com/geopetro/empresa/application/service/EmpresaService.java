package com.geopetro.empresa.application.service;

import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.geopetro.empresa.adapter.in.web.request.EmpresaRequest;
import com.geopetro.empresa.adapter.out.persistence.entity.EmpresaEntity;
import com.geopetro.empresa.adapter.out.persistence.repository.EmpresaJpaRepository;
import com.geopetro.core.exception.BusinessException;
import com.geopetro.core.exception.ResourceNotFoundException;

@Service
public class EmpresaService {

	private final EmpresaJpaRepository repository;

	public EmpresaService(EmpresaJpaRepository repository) {
		this.repository = repository;
	}

	@Transactional(readOnly = true)
	public List<EmpresaEntity> listar() {
		return repository.findAll();
	}

	@Transactional(readOnly = true)
	public Page<EmpresaEntity> listar(String busca, Pageable pageable) {
		if (busca == null || busca.isBlank()) {
			return repository.findAll(pageable);
		}
		String termo = busca.trim();
		return repository.findByNomeContainingIgnoreCaseOrCnpjContainingIgnoreCase(termo, termo, pageable);
	}

	@Transactional(readOnly = true)
	public EmpresaEntity buscar(Long id) {
		return repository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Empresa nao encontrada."));
	}

	@Transactional
	public EmpresaEntity criar(EmpresaRequest request) {
		if (request.cnpj() != null && !request.cnpj().isBlank() && repository.existsByCnpj(request.cnpj())) {
			throw new BusinessException("Ja existe uma empresa com esse CNPJ.", HttpStatus.CONFLICT);
		}
		return repository.save(aplicar(new EmpresaEntity(), request));
	}

	@Transactional
	public EmpresaEntity atualizar(Long id, EmpresaRequest request) {
		EmpresaEntity empresa = buscar(id);
		return repository.save(aplicar(empresa, request));
	}

	@Transactional
	public void excluir(Long id) {
		EmpresaEntity empresa = buscar(id);
		repository.delete(empresa);
	}

	private EmpresaEntity aplicar(EmpresaEntity empresa, EmpresaRequest request) {
		empresa.setNome(request.nome());
		empresa.setTelefone(request.telefone());
		empresa.setCnpj(request.cnpj());
		empresa.setEmail(request.email());
		empresa.setCep(request.cep());
		empresa.setLogradouro(request.logradouro());
		empresa.setBairro(request.bairro());
		empresa.setCidade(request.cidade());
		empresa.setEstado(request.estado());
		empresa.setNumero(request.numero());
		empresa.setComplemento(request.complemento());
		return empresa;
	}
}
