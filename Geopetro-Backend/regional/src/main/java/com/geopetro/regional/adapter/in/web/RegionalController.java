package com.geopetro.regional.adapter.in.web;

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
import com.geopetro.regional.adapter.in.web.request.RegionalRequest;
import com.geopetro.regional.adapter.in.web.response.RegionalResponse;
import com.geopetro.regional.adapter.out.persistence.entity.RegionalEntity;
import com.geopetro.regional.application.service.RegionalService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/regionais")
@Tag(name = "Regionais")
@SecurityRequirement(name = "bearerAuth")
public class RegionalController {

	private final RegionalService service;

	public RegionalController(RegionalService service) {
		this.service = service;
	}

	@GetMapping
	@Operation(summary = "Listar regionais")
	public List<RegionalResponse> listar() {
		return service.listar().stream().map(RegionalResponse::de).toList();
	}

	@GetMapping("/paginado")
	@Operation(summary = "Listar regionais com paginacao e busca")
	public PaginaResponse<RegionalResponse> listarPaginado(@RequestParam(defaultValue = "0") int pagina,
			@RequestParam(defaultValue = "10") int tamanho, @RequestParam(required = false) String busca) {
		Page<RegionalEntity> page = service.listar(busca, PageRequest.of(pagina, tamanho, Sort.by("nome").ascending()));
		return PaginaResponse.de(page.getContent().stream().map(RegionalResponse::de).toList(), page.getNumber(),
				page.getSize(), page.getTotalElements(), page.getTotalPages(), page.isFirst(), page.isLast());
	}

	@GetMapping("/{id}")
	@Operation(summary = "Buscar regional por id")
	public RegionalResponse buscar(@PathVariable Long id) {
		return RegionalResponse.de(service.buscar(id));
	}

	@PostMapping
	@Operation(summary = "Criar regional")
	public RegionalResponse criar(@RequestBody @Valid RegionalRequest request) {
		return RegionalResponse.de(service.criar(request));
	}

	@PutMapping("/{id}")
	@Operation(summary = "Atualizar regional")
	public RegionalResponse atualizar(@PathVariable Long id, @RequestBody @Valid RegionalRequest request) {
		return RegionalResponse.de(service.atualizar(id, request));
	}

	@DeleteMapping("/{id}")
	@Operation(summary = "Excluir regional")
	public ResponseEntity<Void> excluir(@PathVariable Long id) {
		service.excluir(id);
		return ResponseEntity.noContent().build();
	}
}
