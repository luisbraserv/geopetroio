package com.geopetro.security.adapter.in.web;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.geopetro.security.adapter.in.web.request.AutenticacaoRequest;
import com.geopetro.security.adapter.in.web.response.AutenticacaoResponse;
import com.geopetro.security.application.AutenticacaoUseCase;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/auth")
@Tag(name = "Autenticação", description = "Login e geração de token JWT")
public class AutenticacaoController {

	private final AutenticacaoUseCase autenticacaoUseCase;

	public AutenticacaoController(AutenticacaoUseCase autenticacaoUseCase) {
		this.autenticacaoUseCase = autenticacaoUseCase;
	}

	@PostMapping("/login")
	@Operation(summary = "Autenticar usuário", description = "Valida username e password e retorna um token JWT com os dados do usuário autenticado.")
	public ResponseEntity<AutenticacaoResponse> login(@RequestBody AutenticacaoRequest request) {
		return ResponseEntity.ok(autenticacaoUseCase.autenticar(request));
	}
}
