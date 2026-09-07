package com.geopetro.usuario.adapter.in.web;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.geopetro.usuario.adapter.in.web.request.AtualizarUsuarioRequest;
import com.geopetro.usuario.adapter.in.web.request.AlterarSenhaRequest;
import com.geopetro.usuario.adapter.in.web.request.CriarUsuarioClienteRequest;
import com.geopetro.usuario.adapter.in.web.request.CriarUsuarioInternoRequest;
import com.geopetro.usuario.application.dto.PaginaOutput;
import com.geopetro.usuario.application.dto.UsuarioOutput;
import com.geopetro.usuario.application.port.in.BuscarUsuarioInputPort;
import com.geopetro.usuario.application.port.in.CriarUsuarioInputPort;
import com.geopetro.usuario.application.usecase.AtivarUsuarioUseCase;
import com.geopetro.usuario.application.usecase.AlterarSenhaUsuarioUseCase;
import com.geopetro.usuario.application.usecase.AtualizarUsuarioUseCase;
import com.geopetro.usuario.application.usecase.DesativarUsuarioUseCase;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/usuarios")
@Tag(name = "Usuários", description = "Cadastro, consulta, atualização e status de usuários")
@SecurityRequirement(name = "bearerAuth")
public class UsuarioController {

	private final CriarUsuarioInputPort criarUsuarioInputPort;
	private final BuscarUsuarioInputPort buscarUsuarioInputPort;
	private final AtivarUsuarioUseCase ativarUsuarioUseCase;
	private final AtualizarUsuarioUseCase atualizarUsuarioUseCase;
	private final AlterarSenhaUsuarioUseCase alterarSenhaUsuarioUseCase;
	private final DesativarUsuarioUseCase desativarUsuarioUseCase;

	public UsuarioController(CriarUsuarioInputPort criarUsuarioInputPort, BuscarUsuarioInputPort buscarUsuarioInputPort,
			AtivarUsuarioUseCase ativarUsuarioUseCase, AtualizarUsuarioUseCase atualizarUsuarioUseCase,
			AlterarSenhaUsuarioUseCase alterarSenhaUsuarioUseCase, DesativarUsuarioUseCase desativarUsuarioUseCase) {
		this.criarUsuarioInputPort = criarUsuarioInputPort;
		this.buscarUsuarioInputPort = buscarUsuarioInputPort;
		this.ativarUsuarioUseCase = ativarUsuarioUseCase;
		this.atualizarUsuarioUseCase = atualizarUsuarioUseCase;
		this.alterarSenhaUsuarioUseCase = alterarSenhaUsuarioUseCase;
		this.desativarUsuarioUseCase = desativarUsuarioUseCase;
	}

	@PostMapping("/clientes")
	@Operation(summary = "Criar usuário cliente", description = "Cria um usuário do tipo cliente com roles adicionais opcionais. A role CLIENTE é aplicada automaticamente.")
	public ResponseEntity<UsuarioOutput> criarCliente(@RequestBody CriarUsuarioClienteRequest request) {
		return ResponseEntity.ok(criarUsuarioInputPort.criarCliente(request.toCommand()));
	}

	@PostMapping("/internos")
	@Operation(summary = "Criar usuário interno", description = "Cria um usuário interno com matrícula, setor e roles adicionais opcionais. A role INTERNO é aplicada automaticamente.")
	public ResponseEntity<UsuarioOutput> criarInterno(@RequestBody CriarUsuarioInternoRequest request) {
		return ResponseEntity.ok(criarUsuarioInputPort.criarInterno(request.toCommand()));
	}

	@GetMapping
	@Operation(summary = "Listar usuários", description = "Lista usuários com paginação.")
	public ResponseEntity<PaginaOutput<UsuarioOutput>> listar(
			@RequestParam(defaultValue = "0") int pagina,
			@RequestParam(defaultValue = "20") int tamanho,
			@RequestParam(required = false) String busca) {
		return ResponseEntity.ok(buscarUsuarioInputPort.listar(pagina, tamanho, busca));
	}

	@GetMapping("/{username}")
	@Operation(summary = "Buscar usuário por username", description = "Retorna os dados completos de um usuário, incluindo campos editáveis de endereço, roles e dados específicos de cliente/interno.")
	public ResponseEntity<UsuarioOutput> buscarPorUsername(@PathVariable String username) {
		return buscarUsuarioInputPort.buscarPorUsername(username)
				.map(ResponseEntity::ok)
				.orElseGet(() -> ResponseEntity.notFound().build());
	}

	@PatchMapping("/me")
	@Operation(summary = "Atualizar usuário autenticado", description = "Atualiza os dados cadastrais do usuário autenticado pelo token JWT.")
	public ResponseEntity<UsuarioOutput> atualizarUsuarioAutenticado(@RequestBody AtualizarUsuarioRequest request,
			Authentication authentication) {
		return ResponseEntity.ok(atualizarUsuarioUseCase.atualizar(authentication.getName(), request.toCommand()));
	}

	@PatchMapping("/{username}")
	@Operation(summary = "Atualizar usuário por username", description = "Atualiza dados cadastrais, endereço, roles e dados específicos de cliente/interno de um usuário informado.")
	public ResponseEntity<UsuarioOutput> atualizar(@PathVariable String username,
			@RequestBody AtualizarUsuarioRequest request) {
		return ResponseEntity.ok(atualizarUsuarioUseCase.atualizar(username, request.toCommand()));
	}

	@PatchMapping("/me/senha")
	@Operation(summary = "Alterar senha do usuario autenticado", description = "Valida a senha atual e altera a senha do usuario autenticado.")
	public ResponseEntity<UsuarioOutput> alterarSenhaUsuarioAutenticado(@RequestBody AlterarSenhaRequest request,
			Authentication authentication) {
		return ResponseEntity.ok(alterarSenhaUsuarioUseCase.alterar(authentication.getName(), request.toCommand()));
	}

	@PatchMapping("/{username}/ativar")
	@Operation(summary = "Ativar usuário", description = "Altera o status do usuário para ATIVO.")
	public ResponseEntity<UsuarioOutput> ativar(@PathVariable String username) {
		return ResponseEntity.ok(ativarUsuarioUseCase.ativar(username));
	}

	@PatchMapping("/{username}/desativar")
	@Operation(summary = "Desativar usuário", description = "Altera o status do usuário para INATIVO.")
	public ResponseEntity<UsuarioOutput> desativar(@PathVariable String username) {
		return ResponseEntity.ok(desativarUsuarioUseCase.desativar(username));
	}
}
