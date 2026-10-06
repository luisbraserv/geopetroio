package com.braserv.core.identidade.servico;

import java.time.Instant;
import java.util.List;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

/** Tela de ADMIN dos sistemas autorizados a chamar o core — D-3. */
@RestController
@RequestMapping("/api/servicos-clientes")
@Tag(name = "Sistemas autorizados", description = "Credenciais dos sistemas que chamam as rotas internas do core")
@SecurityRequirement(name = "bearerAuth")
public class ServicoClienteController {

	private static final String AVISO = "Copie o segredo agora: ele nao sera exibido de novo.";

	private final ServicoClienteService service;

	public ServicoClienteController(ServicoClienteService service) {
		this.service = service;
	}

	@GetMapping
	@Operation(summary = "Listar sistemas autorizados")
	public List<ServicoClienteResponse> listar() {
		return service.listar().stream().map(ServicoClienteResponse::de).toList();
	}

	@PostMapping
	@Operation(summary = "Autorizar um sistema", description = "Gera o segredo e o devolve uma unica vez.")
	public ResponseEntity<SegredoResponse> criar(@RequestBody ServicoClienteRequest request) {
		var gerado = service.criar(request.id(), request.nome(), request.escopos());
		return ResponseEntity.status(HttpStatus.CREATED).body(SegredoResponse.de(gerado));
	}

	@PostMapping("/{id}/segredo")
	@Operation(summary = "Gerar segredo novo", description = "O segredo anterior para de valer imediatamente.")
	public SegredoResponse gerarSegredo(@PathVariable String id) {
		return SegredoResponse.de(service.gerarNovoSegredo(id));
	}

	@PatchMapping("/{id}/desativar")
	@Operation(summary = "Desativar sistema", description = "Recusa tokens novos na hora; os emitidos valem ate expirar (15 min).")
	public ResponseEntity<Void> desativar(@PathVariable String id) {
		service.desativar(id);
		return ResponseEntity.noContent().build();
	}

	@PatchMapping("/{id}/ativar")
	@Operation(summary = "Reativar sistema")
	public ResponseEntity<Void> ativar(@PathVariable String id) {
		service.ativar(id);
		return ResponseEntity.noContent().build();
	}

	public record ServicoClienteRequest(String id, String nome, Set<String> escopos) {
	}

	public record ServicoClienteResponse(String id, String nome, Set<String> escopos, boolean ativo,
			Instant criadoEm, Instant ultimoUsoEm) {
		static ServicoClienteResponse de(ServicoClienteEntity c) {
			return new ServicoClienteResponse(c.getId(), c.getNome(), c.getEscopos(), c.isAtivo(), c.getCriadoEm(),
					c.getUltimoUsoEm());
		}
	}

	/** O segredo nao aparece em {@code toString}: a resposta pode acabar num log de depuracao. */
	public record SegredoResponse(String id, String segredo, String aviso) {
		static SegredoResponse de(ServicoClienteService.SegredoGerado gerado) {
			return new SegredoResponse(gerado.cliente().getId(), gerado.segredo(), AVISO);
		}

		@Override
		public String toString() {
			return "SegredoResponse[id=" + id + ", segredo=<omitido>]";
		}
	}
}
