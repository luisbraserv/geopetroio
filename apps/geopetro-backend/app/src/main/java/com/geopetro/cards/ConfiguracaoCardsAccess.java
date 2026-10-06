package com.geopetro.cards;

import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.geopetro.configuracaosonda.ConfiguracaoSondaAccess;
import com.geopetro.core.exception.BusinessException;
import com.geopetro.security.application.ContaAtivaVerificador;
import com.geopetro.usuario.adapter.out.persistence.repository.UsuarioJpaRepository;
import com.geopetro.usuario.domain.model.Role;

/**
 * Quem lê e quem grava os cards — RN-086.
 *
 * <p><b>Ler e gravar têm regras diferentes</b>, e é essa assimetria que justifica a classe:
 *
 * <table>
 *   <tr><th>Ação</th><th>Quem</th><th>Por quê</th></tr>
 *   <tr><td>Ler</td><td>Quem enxerga a sonda, mais {@code ADMIN} e {@code SUPORTE}</td>
 *       <td>O Front monta as telas a partir dos cards; quem vê a sonda precisa saber o que ela mede</td></tr>
 *   <tr><td>Gravar</td><td>Somente {@code ADMIN} ou {@code SUPORTE}</td>
 *       <td>Configurar decide o que a borda lê. É outra autoridade que ajustar um limite (RN-069)</td></tr>
 * </table>
 *
 * <p>⚠️ {@code SUPORTE} <b>não está</b> em {@code ACESSO_TOTAL} do monitoramento, de propósito: ele
 * configura o sistema, não acompanha operação. Por isso a leitura precisa somá-lo à regra de
 * monitoramento, em vez de reaproveitá-la inteira.
 */
@Service
public class ConfiguracaoCardsAccess {

	/** Perfis que configuram — RN-086. */
	private static final Set<Role> CONFIGURADORES = Set.of(Role.ADMIN, Role.SUPORTE);

	private final ConfiguracaoSondaAccess monitoramento;
	private final ContaAtivaVerificador contas;
	private final UsuarioJpaRepository usuarios;

	public ConfiguracaoCardsAccess(ConfiguracaoSondaAccess monitoramento, ContaAtivaVerificador contas,
			UsuarioJpaRepository usuarios) {
		this.monitoramento = monitoramento;
		this.contas = contas;
		this.usuarios = usuarios;
	}

	public boolean podeLer(String username, long id) {
		return monitoramento.permite(username, id) || podeGravar(username, id);
	}

	public boolean podeGravar(String username, long id) {
		return username != null && id > 0 && contas.ativa(username) && ehConfigurador(username);
	}

	public void exigirLeitura(String username, long id) {
		if (!podeLer(username, id)) {
			throw new BusinessException("Sem acesso aos cards desta Unidade/Sonda.", HttpStatus.FORBIDDEN);
		}
	}

	/**
	 * A mensagem separa "não vejo esta unidade" de "não configuro": quem enxerga a sonda mas não
	 * configura precisa entender que o problema é o perfil, não a unidade.
	 */
	public void exigirEscrita(String username, long id) {
		if (!podeGravar(username, id)) {
			throw new BusinessException("Apenas ADMIN ou SUPORTE configuram os cards.", HttpStatus.FORBIDDEN);
		}
	}

	private boolean ehConfigurador(String username) {
		return usuarios.findById(username)
				.map(usuario -> usuario.getRoles() != null
						&& usuario.getRoles().stream().anyMatch(CONFIGURADORES::contains))
				.orElse(false);
	}
}
