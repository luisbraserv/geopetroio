package com.braservpetroleo.telemetria.geopetroio;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import com.braservpetroleo.telemetria.geopetroio.adapter.in.web.MonitoramentoController;
import com.braservpetroleo.telemetria.geopetroio.application.service.ConsultaSerieService;
import com.braservpetroleo.telemetria.geopetroio.application.service.IngestaoTelemetriaService;
import com.braservpetroleo.telemetria.geopetroio.infrastructure.mqtt.TelemetriaPayloadParser;

/**
 * Smoke test: garante que o contexto sobe com toda a fiacao real (menos o broker).
 *
 * <p>Cobre o erro mais comum em servico com muita configuracao — bean que nao resolve por
 * propriedade ausente ou dependencia ciclica — que nenhum teste unitario pegaria.
 */
@SpringBootTest
@ActiveProfiles("test")
class TelemetriaGeopetroioApplicationTests {

	@Autowired
	private MonitoramentoController controller;

	@Autowired
	private ConsultaSerieService consulta;

	@Autowired
	private IngestaoTelemetriaService ingestao;

	@Autowired
	private TelemetriaPayloadParser parser;

	@Test
	@DisplayName("contexto sobe com os beans essenciais")
	void contextLoads() {
		assertThat(controller).isNotNull();
		assertThat(consulta).isNotNull();
		assertThat(ingestao).isNotNull();
		assertThat(parser).isNotNull();
	}
}
