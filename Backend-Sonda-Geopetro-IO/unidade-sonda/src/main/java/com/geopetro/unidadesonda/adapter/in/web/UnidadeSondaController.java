package com.geopetro.unidadesonda.adapter.in.web;

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
import com.geopetro.unidadesonda.adapter.in.web.request.UnidadeSondaRequest;
import com.geopetro.unidadesonda.adapter.in.web.response.UnidadeSondaResponse;
import com.geopetro.unidadesonda.adapter.out.persistence.entity.UnidadeSondaEntity;
import com.geopetro.unidadesonda.application.service.UnidadeSondaService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/unidades-sondas")
@Tag(name = "Unidades/Sondas")
@SecurityRequirement(name = "bearerAuth")
public class UnidadeSondaController {

	private final UnidadeSondaService service;

	public UnidadeSondaController(UnidadeSondaService service) {
		this.service = service;
	}

	@GetMapping
	@Operation(summary = "Listar unidades/sondas")
	public List<UnidadeSondaResponse> listar(
			@RequestParam(required = false) Long setorId,
			@RequestParam(required = false) List<Long> setorIds,
			@RequestParam(required = false) Long regionalId) {
		return service.listar(setorId, setorIds, regionalId).stream().map(UnidadeSondaResponse::de).toList();
	}

	@GetMapping("/paginado")
	@Operation(summary = "Listar unidades/sondas com paginacao e busca")
	public PaginaResponse<UnidadeSondaResponse> listarPaginado(@RequestParam(defaultValue = "0") int pagina,
			@RequestParam(defaultValue = "10") int tamanho, @RequestParam(required = false) String busca) {
		Page<UnidadeSondaEntity> page = service.listar(busca,
				PageRequest.of(pagina, tamanho, Sort.by("nome").ascending()));
		return PaginaResponse.de(page.getContent().stream().map(UnidadeSondaResponse::de).toList(), page.getNumber(),
				page.getSize(), page.getTotalElements(), page.getTotalPages(), page.isFirst(), page.isLast());
	}

	@GetMapping("/{id}")
	@Operation(summary = "Buscar unidade/sonda por id")
	public UnidadeSondaResponse buscar(@PathVariable Long id) {
		return UnidadeSondaResponse.de(service.buscar(id));
	}

	@PostMapping
	@Operation(summary = "Criar unidade/sonda")
	public UnidadeSondaResponse criar(@RequestBody @Valid UnidadeSondaRequest request) {
		return UnidadeSondaResponse.de(service.criar(request));
	}

	@PutMapping("/{id}")
	@Operation(summary = "Atualizar unidade/sonda")
	public UnidadeSondaResponse atualizar(@PathVariable Long id, @RequestBody @Valid UnidadeSondaRequest request) {
		return UnidadeSondaResponse.de(service.atualizar(id, request));
	}

	@DeleteMapping("/{id}")
	@Operation(summary = "Excluir unidade/sonda")
	public ResponseEntity<Void> excluir(@PathVariable Long id) {
		service.excluir(id);
		return ResponseEntity.noContent().build();
	}
}
