package com.geopetro.desktop.telemetria;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.lang.reflect.Field;
import java.util.List;
import java.util.concurrent.BlockingQueue;

import org.junit.jupiter.api.Test;

import com.geopetro.desktop.configuracoes.AppSettings;

/**
 * O interruptor da telemetria MQTT — {@code configuracao-da-estacao.md §6}.
 *
 * <p>Desligada, a estação não enfileira leitura nenhuma. O teste olha a fila em vez do broker
 * porque é ali que a decisão acontece: {@code enviarLeitura} nunca publica de forma síncrona — ela
 * enfileira, e o worker publica. Provar que a fila fica vazia prova que nada sai.
 *
 * <p>⚠️ <b>O que este teste protege é a diferença entre desligado e mal configurado.</b> Antes de
 * §6, "desligar" era apagar o endereço do broker, e uma unidade calada de propósito era idêntica a
 * uma que alguém configurou pela metade.
 */
class TelemetriaMqttDesligadaTest {

	private static final List<LeituraPublicada> UMA_LEITURA = List.of(
			new LeituraPublicada("PRESSAO_01", "pressao", "PRESSAO", "bar", "DBW10", 12.5, 4096));

	private AppSettings configurada() {
		AppSettings settings = new AppSettings();
		settings.setIdUnidade("SONDA-01");
		settings.setTelemetriaUrl("tcp://127.0.0.1:1883");
		return settings;
	}

	@SuppressWarnings("unchecked")
	private BlockingQueue<?> fila(TelemetriaMqttService servico) throws Exception {
		Field campo = TelemetriaMqttService.class.getDeclaredField("fila");
		campo.setAccessible(true);
		return (BlockingQueue<Object>) campo.get(servico);
	}

	@Test
	void desligadaNaoEnfileiraNada() throws Exception {
		TelemetriaMqttService servico = new TelemetriaMqttService();
		AppSettings settings = configurada();
		settings.setTelemetriaMqttAtiva(false);
		try {
			servico.enviarLeitura(settings, UMA_LEITURA);

			assertEquals(0, fila(servico).size(),
					"leitura enfileirada com a telemetria desligada: ela sairia no proximo worker");
		} finally {
			servico.encerrar();
		}
	}

	/**
	 * A estação continua configurada e ligada por padrão: sem isto, o teste acima passaria mesmo se
	 * {@code enviarLeitura} tivesse parado de enfileirar por outro motivo.
	 */
	@Test
	void ligadaEnfileiraNormalmente() throws Exception {
		TelemetriaMqttService servico = new TelemetriaMqttService();
		try {
			servico.enviarLeitura(configurada(), UMA_LEITURA);

			assertEquals(1, fila(servico).size());
		} finally {
			servico.encerrar();
		}
	}

	/**
	 * ⚠️ Desligar no meio do expediente esvazia o que estava esperando.
	 *
	 * <p>O que está na fila foi lido <b>antes</b> do desligamento e não deve sair depois dele — e a
	 * conexão com o broker sobe com {@code setAutomaticReconnect(true)}, então deixá-la viva seria
	 * exatamente o gasto que o interruptor existe para evitar. O H2 local mantém o registro completo.
	 */
	@Test
	void desligarLimpaAFilaPendente() throws Exception {
		TelemetriaMqttService servico = new TelemetriaMqttService();
		AppSettings settings = configurada();
		try {
			servico.enviarLeitura(settings, UMA_LEITURA);
			assertEquals(1, fila(servico).size());

			settings.setTelemetriaMqttAtiva(false);
			servico.enviarLeitura(settings, UMA_LEITURA);

			assertEquals(0, fila(servico).size(), "a fila anterior ao desligamento sobreviveu");
		} finally {
			servico.encerrar();
		}
	}
}
