package com.geopetro.desktop.alarmes;

import java.awt.Toolkit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * O aviso audível do alarme na estação.
 *
 * <h2>Por que o beep do sistema, e não um arquivo de som</h2>
 * Um som próprio exigiria um recurso de áudio no pacote, o `javafx.media` no runtime e uma decisão
 * sobre volume que ninguém tomou. O beep do sistema já existe, não adiciona dependência e cumpre o
 * que a spec pede: <b>chamar quem está ao lado do equipamento</b>.
 *
 * <p>⚠️ <b>Limites conhecidos, e são reais.</b> O volume é o do sistema operacional — uma estação
 * com o som desligado não avisa nada, e a tela continua sendo o único sinal. Não há repetição
 * enquanto o alarme durar: toca uma vez a cada agravamento. Um alarme de sala de controle faria
 * diferente, e isso é uma escolha de escopo, não um esquecimento.
 *
 * <p>Falha ao emitir vira log e segue: ficar sem som é ruim, derrubar o ciclo de leitura por causa
 * do som seria pior.
 */
@Component
public class SinalSonoro {

	private static final Logger logger = LoggerFactory.getLogger(SinalSonoro.class);

	private volatile boolean avisouDaFalha;

	public void alertar() {
		try {
			Toolkit.getDefaultToolkit().beep();
		} catch (RuntimeException | Error e) {
			// Uma linha por execucao: um ciclo por segundo transformaria a falha num dilúvio de log.
			if (!avisouDaFalha) {
				avisouDaFalha = true;
				logger.warn("Sem aviso sonoro nesta estacao; o destaque na tela segue funcionando.", e);
			}
		}
	}
}
