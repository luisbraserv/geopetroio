package com.braserv.core.interno;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.braserv.core.comum.exception.ResourceNotFoundException;
import com.braserv.core.identidade.servico.ServicoClienteService;
import com.braserv.core.identidade.token.TokenDeServico;
import com.braserv.core.unidade.adapter.out.persistence.entity.UnidadeEntity;
import com.braserv.core.unidade.application.service.UnidadeService;
import com.braserv.core.unidade.domain.StatusUnidade;
import com.braserv.core.unidade.domain.TipoUnidade;
import com.braserv.core.usuario.application.port.out.UsuarioRepositoryPort;
import com.braserv.core.usuario.domain.model.Role;
import com.braserv.core.usuario.domain.model.StatusUsuario;
import com.braserv.core.usuario.domain.model.Usuario;
import com.braserv.core.usuario.domain.model.UsuarioCliente;

import io.swagger.v3.oas.annotations.Hidden;

/**
 * Rotas internas do Braserv-Core — contrato em {@code specs/SDD/software/apis/braserv-core.md}.
 *
 * <p>Fora do Swagger publico ({@code @Hidden}): quem as consome e outro sistema, pelo contrato, e
 * nao uma pessoa pela documentacao.
 */
@Hidden
@RestController
@RequestMapping("/internal/v1")
public class InternoController {

	private final ServicoClienteService servicos;
	private final TokenDeServico tokenDeServico;
	private final UsuarioRepositoryPort usuarios;
	private final UnidadeService unidades;

	public InternoController(ServicoClienteService servicos, TokenDeServico tokenDeServico,
			UsuarioRepositoryPort usuarios, UnidadeService unidades) {
		this.servicos = servicos;
		this.tokenDeServico = tokenDeServico;
		this.usuarios = usuarios;
		this.unidades = unidades;
	}

	/** Contrato §3. Credencial invalida e cliente desativado respondem igual: 401, sem dizer qual. */
	@PostMapping("/auth/token")
	public ResponseEntity<?> token(@RequestBody PedidoDeToken pedido) {
		return servicos.autenticar(pedido.clienteId(), pedido.segredo())
				.<ResponseEntity<?>>map(cliente -> {
					var emitido = tokenDeServico.emitir(cliente.getId(), cliente.getEscopos());
					return ResponseEntity.ok(new TokenResponse(emitido.token(), emitido.expiraEm(), emitido.escopos()));
				})
				.orElseGet(() -> ResponseEntity.status(HttpStatus.UNAUTHORIZED)
						.body(new Erro("Credencial de servico invalida.")));
	}

	/** Contrato §4.1 — RN-062, RN-107, RN-047, RN-048, RN-086, RN-099 nos consumidores. */
	@GetMapping("/usuarios/{username}/acesso")
	public AcessoResponse acesso(@PathVariable String username) {
		Usuario usuario = usuarios.buscarPorUsername(username)
				.orElseThrow(() -> new ResourceNotFoundException("Usuario nao encontrado."));
		boolean cliente = usuario instanceof UsuarioCliente;
		List<Long> unidadeIds = usuario instanceof UsuarioCliente c ? c.getUnidadeIds() : List.of();
		Set<String> roles = new TreeSet<>();
		usuario.getRoles().stream().map(Role::name).forEach(roles::add);
		return new AcessoResponse(usuario.getUsername(), cliente ? "CLIENTE" : "INTERNO",
				usuario.getStatus() == StatusUsuario.ATIVO, roles, unidadeIds);
	}

	/** Contrato §4.2 — todas, ativas e inativas, sem paginacao. */
	@GetMapping("/unidades")
	public List<UnidadeInterna> unidades() {
		return unidades.listar(null, null, null, null).stream().map(UnidadeInterna::de).toList();
	}

	/** Contrato §4.2 — consultado sem cache antes de gravar dado que referencia a unidade. */
	@GetMapping("/unidades/{id}")
	public UnidadeInterna unidade(@PathVariable Long id) {
		return UnidadeInterna.de(unidades.buscar(id));
	}

	public record PedidoDeToken(String clienteId, String segredo) {
		@Override
		public String toString() {
			return "PedidoDeToken[clienteId=" + clienteId + ", segredo=<omitido>]";
		}
	}

	public record TokenResponse(String token, Instant expiraEm, Set<String> escopos) {
		@Override
		public String toString() {
			return "TokenResponse[expiraEm=" + expiraEm + ", escopos=" + escopos + "]";
		}
	}

	public record Erro(String mensagem) {
	}

	public record AcessoResponse(String username, String tipo, boolean ativo, Set<String> roles, List<Long> unidadeIds) {
	}

	public record UnidadeInterna(Long id, String nome, String apelido, TipoUnidade tipo, StatusUnidade status,
			Long setorId) {
		static UnidadeInterna de(UnidadeEntity u) {
			return new UnidadeInterna(u.getId(), u.getNome(), u.getApelido(), u.getTipo(), u.getStatus(),
					u.getSetor().getId());
		}
	}
}
