package com.geopetro.empresa.adapter.in.web;

import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.geopetro.core.dto.PaginaResponse;
import com.geopetro.empresa.adapter.in.web.request.EmpresaRequest;
import com.geopetro.empresa.adapter.in.web.response.EmpresaResponse;
import com.geopetro.empresa.adapter.out.persistence.entity.EmpresaEntity;
import com.geopetro.empresa.application.service.EmpresaService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/empresas")
@Tag(name = "Empresas")
@SecurityRequirement(name = "bearerAuth")
public class EmpresaController {

	private final EmpresaService service;

	public EmpresaController(EmpresaService service) {
		this.service = service;
	}

	@GetMapping
	@Operation(summary = "Listar empresas")
	public List<EmpresaResponse> listar() {
		return service.listar().stream().map(EmpresaResponse::de).toList();
	}

	@GetMapping("/paginado")
	@Operation(summary = "Listar empresas com paginacao e busca")
	public PaginaResponse<EmpresaResponse> listarPaginado(@RequestParam(defaultValue = "0") int pagina,
			@RequestParam(defaultValue = "10") int tamanho, @RequestParam(required = false) String busca) {
		Page<EmpresaEntity> page = service.listar(busca, PageRequest.of(pagina, tamanho, Sort.by("nome").ascending()));
		return PaginaResponse.de(page.getContent().stream().map(EmpresaResponse::de).toList(), page.getNumber(),
				page.getSize(), page.getTotalElements(), page.getTotalPages(), page.isFirst(), page.isLast());
	}

	@GetMapping("/{id}")
	@Operation(summary = "Buscar empresa por id")
	public EmpresaResponse buscar(@PathVariable Long id) {
		return EmpresaResponse.de(service.buscar(id));
	}

	@PostMapping
	@Operation(summary = "Criar empresa")
	public EmpresaResponse criar(@RequestBody @Valid EmpresaRequest request) {
		return EmpresaResponse.de(service.criar(request));
	}

	@PutMapping("/{id}")
	@Operation(summary = "Atualizar empresa")
	public EmpresaResponse atualizar(@PathVariable Long id, @RequestBody @Valid EmpresaRequest request) {
		return EmpresaResponse.de(service.atualizar(id, request));
	}

	@DeleteMapping("/{id}")
	@Operation(summary = "Excluir empresa")
	public ResponseEntity<Void> excluir(@PathVariable Long id) {
		service.excluir(id);
		return ResponseEntity.noContent().build();
	}
}
