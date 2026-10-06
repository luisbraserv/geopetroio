package com.braserv.core.setor.adapter.in.web;

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
import com.braserv.core.setor.adapter.in.web.request.SetorRequest;
import com.braserv.core.setor.adapter.in.web.response.SetorResponse;
import com.braserv.core.setor.adapter.out.persistence.entity.SetorEntity;
import com.braserv.core.setor.application.service.SetorService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/setores")
@Tag(name = "Setores")
@SecurityRequirement(name = "bearerAuth")
public class SetorController {

	private final SetorService service;

	public SetorController(SetorService service) {
		this.service = service;
	}

	@GetMapping
	@Operation(summary = "Listar setores")
	public List<SetorResponse> listar(@RequestParam(required = false) Long regionalId) {
		return service.listar(regionalId).stream().map(SetorResponse::de).toList();
	}

	@GetMapping("/paginado")
	@Operation(summary = "Listar setores com paginacao e busca")
	public PaginaResponse<SetorResponse> listarPaginado(@RequestParam(defaultValue = "0") int pagina,
			@RequestParam(defaultValue = "10") int tamanho, @RequestParam(required = false) String busca,
			@RequestParam(required = false) Long regionalId) {
		Page<SetorEntity> page = service.listar(busca, regionalId,
				PageRequest.of(pagina, tamanho, Sort.by("nome").ascending()));
		return PaginaResponse.de(page.getContent().stream().map(SetorResponse::de).toList(), page.getNumber(),
				page.getSize(), page.getTotalElements(), page.getTotalPages(), page.isFirst(), page.isLast());
	}

	@GetMapping("/{id}")
	@Operation(summary = "Buscar setor por id")
	public SetorResponse buscar(@PathVariable Long id) {
		return SetorResponse.de(service.buscar(id));
	}

	@PostMapping
	@Operation(summary = "Criar setor")
	public SetorResponse criar(@RequestBody @Valid SetorRequest request) {
		return SetorResponse.de(service.criar(request));
	}

	@PutMapping("/{id}")
	@Operation(summary = "Atualizar setor")
	public SetorResponse atualizar(@PathVariable Long id, @RequestBody @Valid SetorRequest request) {
		return SetorResponse.de(service.atualizar(id, request));
	}

	@DeleteMapping("/{id}")
	@Operation(summary = "Excluir setor")
	public ResponseEntity<Void> excluir(@PathVariable Long id) {
		service.excluir(id);
		return ResponseEntity.noContent().build();
	}
}
