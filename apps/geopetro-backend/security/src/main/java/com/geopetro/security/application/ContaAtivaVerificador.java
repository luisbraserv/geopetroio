package com.geopetro.security.application;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.geopetro.comum.port.AcessoDoUsuarioPort;
import com.geopetro.comum.port.AcessoDoUsuarioPort.AcessoDoUsuario;
import com.geopetro.comum.port.AcessoDoUsuarioPort.BraservCoreIndisponivelException;

/**
 * Responde se a conta continua ativa — RN-062, RN-107.
 *
 * <p>O token vale uma hora e nao sabe que o usuario foi desativado no minuto seguinte ao login. O
 * estado atual vem do Braserv-Core, por {@link AcessoDoUsuarioPort}, que guarda a resposta por
 * 10 s: essa e a janela do corte. Com o core fora do ar, o ultimo estado conhecido vale por ate
 * 5 min (D-4); passado isso, a conta e tratada como inativa.
 *
 * <p>Usuario inexistente no core responde {@code false}: username valido no token e ausente no
 * cadastro significa usuario removido, e negar e a leitura segura.
 *
 * <p>Nao ha revogacao de token individual: um token vazado de usuario <i>ativo</i> segue valido
 * ate expirar (SEC-008).
 */
@Component
public class ContaAtivaVerificador {

	private static final Logger log = LoggerFactory.getLogger(ContaAtivaVerificador.class);

	private final AcessoDoUsuarioPort acessos;

	public ContaAtivaVerificador(AcessoDoUsuarioPort acessos) {
		this.acessos = acessos;
	}

	public boolean ativa(String username) {
		if (username == null || username.isBlank()) {
			return false;
		}
		try {
			return acessos.buscar(username).map(AcessoDoUsuario::ativo).orElse(false);
		} catch (BraservCoreIndisponivelException indisponivel) {
			log.warn("Acesso de {} negado: {}", username, indisponivel.getMessage());
			return false;
		}
	}
}
