package com.braserv.core.unidade.adapter.in.web;

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

import com.braserv.core.comum.dto.PaginaResponse;
import com.braserv.core.unidade.adapter.in.web.request.UnidadeRequest;
import com.braserv.core.unidade.adapter.in.web.response.UnidadeResponse;
import com.braserv.core.unidade.adapter.out.persistence.entity.UnidadeEntity;
import com.braserv.core.unidade.application.service.UnidadeService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/unidades")
@Tag(name = "Unidades")
@SecurityRequirement(name = "bearerAuth")
public class UnidadeController {

	private final UnidadeService service;

	public UnidadeController(UnidadeService service) {
		this.service = service;
	}

	@GetMapping
	@Operation(summary = "Listar unidades")
	public List<UnidadeResponse> listar(
			@RequestParam(required = false) Long setorId,
			@RequestParam(required = false) List<Long> setorIds,
			@RequestParam(required = false) Long regionalId) {
		return service.listar(setorId, setorIds, regionalId).stream().map(UnidadeResponse::de).toList();
	}

	@GetMapping("/paginado")
	@Operation(summary = "Listar unidades com paginacao e busca")
	public PaginaResponse<UnidadeResponse> listarPaginado(@RequestParam(defaultValue = "0") int pagina,
			@RequestParam(defaultValue = "10") int tamanho, @RequestParam(required = false) String busca) {
		Page<UnidadeEntity> page = service.listar(busca,
				PageRequest.of(pagina, tamanho, Sort.by("nome").ascending()));
		return PaginaResponse.de(page.getContent().stream().map(UnidadeResponse::de).toList(), page.getNumber(),
				page.getSize(), page.getTotalElements(), page.getTotalPages(), page.isFirst(), page.isLast());
	}

	@GetMapping("/{id}")
	@Operation(summary = "Buscar unidade por id")
	public UnidadeResponse buscar(@PathVariable Long id) {
		return UnidadeResponse.de(service.buscar(id));
	}

	@PostMapping
	@Operation(summary = "Criar unidade")
	public UnidadeResponse criar(@RequestBody @Valid UnidadeRequest request) {
		return UnidadeResponse.de(service.criar(request));
	}

	@PutMapping("/{id}")
	@Operation(summary = "Atualizar unidade")
	public UnidadeResponse atualizar(@PathVariable Long id, @RequestBody @Valid UnidadeRequest request) {
		return UnidadeResponse.de(service.atualizar(id, request));
	}

	@DeleteMapping("/{id}")
	@Operation(summary = "Excluir unidade")
	public ResponseEntity<Void> excluir(@PathVariable Long id) {
		service.excluir(id);
		return ResponseEntity.noContent().build();
	}
}
