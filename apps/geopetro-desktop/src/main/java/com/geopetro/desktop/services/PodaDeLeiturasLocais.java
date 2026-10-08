package com.geopetro.desktop.services;

import java.time.LocalDateTime;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.geopetro.desktop.repositories.LeituraLocalRepository;

/**
 * Apaga do H2 local o que passou do prazo de retenção.
 *
 * <h2>⚠️ Por que isto passou a existir agora</h2>
 * A tabela local <b>nunca teve poda</b>. Com uma linha por ciclo eram ~86 mil linhas por dia — ~31
 * milhões por ano — e ninguém tinha reparado, porque a máquina aguenta e o sintoma demora.
 *
 * <p>Uma linha por <b>grandeza</b> multiplica isso por N. Com 8 cards a 1 Hz são ~691 mil linhas por
 * dia. Multiplicar por oito um crescimento que já era ilimitado, numa máquina em sonda, sem nada que
 * apare, seria trocar um problema lento por um rápido.
 *
 * <h2>O que se perde, e o que não</h2>
 * O H2 local serve à <b>tela de gráficos</b> e à <b>carta de operação</b>, que trabalham sobre uma
 * janela de operação — horas ou dias. O histórico longo vive no InfluxDB, com 5 anos de retenção, e
 * chega ao Front pelo REST.
 *
 * <p>⚠️ <b>Mesmo assim isto apaga dado.</b> Uma carta de operação de um poço de seis meses atrás
 * deixa de poder ser gerada nesta estação depois do prazo. O padrão é generoso justamente por isso, e
 * a propriedade existe para quem precisar de mais.
 *
 * <p>Desligue com {@code app.retencao-leituras-dias=0} — a tabela volta a crescer sem limite, que era
 * o comportamento anterior.
 */
@Service
public class PodaDeLeiturasLocais {

	private static final Logger logger = LoggerFactory.getLogger(PodaDeLeiturasLocais.class);

	/** Uma hora. A poda não tem pressa: o que importa é que aconteça. */
	private static final long INTERVALO_MS = 60L * 60L * 1000L;

	private final LeituraLocalRepository repository;
	private final int dias;

	public PodaDeLeiturasLocais(LeituraLocalRepository repository,
			@Value("${app.retencao-leituras-dias:180}") int dias) {
		this.repository = repository;
		this.dias = dias;
	}

	@Scheduled(initialDelay = 60_000, fixedDelay = INTERVALO_MS)
	public void podar() {
		if (dias <= 0) {
			return;
		}
		LocalDateTime limite = LocalDateTime.now().minusDays(dias);
		try {
			long aApagar = repository.countByTimestampLessThan(limite);
			if (aApagar == 0) {
				return;
			}
			int apagadas = repository.apagarAnterioresA(limite);
			// Em INFO de proposito: apagar dado de medicao nunca deve ser silencioso.
			logger.info("Poda do historico local: {} leituras anteriores a {} removidas ({} dias de retencao).",
					apagadas, limite, dias);
		} catch (Exception e) {
			// Falhar a poda nao pode derrubar a leitura do CLP, que e o que a sonda existe para fazer.
			logger.warn("Nao foi possivel podar o historico local: {}", e.getMessage());
		}
	}
}
