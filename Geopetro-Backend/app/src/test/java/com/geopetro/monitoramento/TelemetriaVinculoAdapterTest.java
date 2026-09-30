package com.geopetro.monitoramento;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.geopetro.core.port.VinculoCadastroPort.Cadastro;
import com.geopetro.monitoramento.dto.ExistenciaSerieDTO;
import com.geopetro.unidadesonda.adapter.out.persistence.entity.UnidadeSondaEntity;
import com.geopetro.unidadesonda.repository.UnidadeSondaJpaRepository;

/**
 * RN-072 — historico de telemetria conta como vinculo.
 *
 * <p>O caso que mais importa aqui e a <b>indisponibilidade</b>: e a unica situacao do sistema em que
 * "nao sei" precisa ser tratado como "nao pode", porque a alternativa apaga um cadastro que talvez
 * nao pudesse ser apagado — e so um dos dois erros tem volta.
 */
class TelemetriaVinculoAdapterTest {

	private final MonitoramentoClient client = mock(MonitoramentoClient.class);
	private final UnidadeSondaJpaRepository repository = mock(UnidadeSondaJpaRepository.class);

	private final TelemetriaVinculoAdapter adapter = new TelemetriaVinculoAdapter(client, repository);

	private void cadastro(Long id, String nome) {
		UnidadeSondaEntity unidade = new UnidadeSondaEntity();
		unidade.setId(id);
		unidade.setNome(nome);
		when(repository.findById(id)).thenReturn(Optional.of(unidade));
	}

	@Test
	@DisplayName("responde pelo cadastro de Unidade/Sonda")
	void respondePelaUnidadeSonda() {
		assertThat(adapter.cadastro()).isEqualTo(Cadastro.UNIDADE_SONDA);
	}

	@Test
	@DisplayName("sonda sem historico nao impede a exclusao")
	void semHistoricoNaoImpede() {
		cadastro(1L, "SPT-144");
		when(client.consultarExistencia("SPT-144"))
				.thenReturn(Optional.of(new ExistenciaSerieDTO("SPT-144", false, null, null)));

		assertThat(adapter.descreverVinculo(1L)).isEmpty();
	}

	@Test
	@DisplayName("sonda com historico impede, dizendo de quando ate quando")
	void comHistoricoImpedeComDatas() {
		cadastro(1L, "SPT-144");
		when(client.consultarExistencia("SPT-144")).thenReturn(Optional.of(new ExistenciaSerieDTO(
				"SPT-144", true,
				Instant.parse("2026-03-01T00:00:00Z"),
				Instant.parse("2026-09-05T12:00:00Z"))));

		// Datas em UTC, nao no fuso da maquina: 2026-03-01T00:00:00Z vira 28/02 em qualquer fuso
		// negativo, e a mensagem passaria a depender de onde a aplicacao roda.
		assertThat(adapter.descreverVinculo(1L))
				.contains("telemetria de 01/03/2026 a 05/09/2026");
	}

	@Test
	@DisplayName("telemetria indisponivel IMPEDE a exclusao — nao sei vale como nao pode")
	void indisponivelImpede() {
		cadastro(1L, "SPT-144");
		when(client.consultarExistencia("SPT-144")).thenReturn(Optional.empty());

		assertThat(adapter.descreverVinculo(1L))
				.hasValueSatisfying(descricao -> assertThat(descricao)
						.contains("nao foi possivel confirmar")
						.contains("indisponivel"));
	}

	@Test
	@DisplayName("consulta a telemetria pelo nome da sonda, que e a chave de integracao")
	void consultaPeloNome() {
		cadastro(7L, "SPT-201");
		when(client.consultarExistencia("SPT-201"))
				.thenReturn(Optional.of(new ExistenciaSerieDTO("SPT-201", false, null, null)));

		adapter.descreverVinculo(7L);

		verify(client).consultarExistencia("SPT-201");
	}

	@Test
	@DisplayName("cadastro inexistente nao vira impedimento nem consulta a telemetria")
	void cadastroInexistenteNaoConsulta() {
		when(repository.findById(99L)).thenReturn(Optional.empty());

		assertThat(adapter.descreverVinculo(99L)).isEmpty();
		verify(client, never()).consultarExistencia(org.mockito.ArgumentMatchers.anyString());
	}

	@Test
	@DisplayName("historico sem datas ainda impede")
	void historicoSemDatasImpede() {
		cadastro(1L, "SPT-144");
		when(client.consultarExistencia("SPT-144"))
				.thenReturn(Optional.of(new ExistenciaSerieDTO("SPT-144", true, null, null)));

		assertThat(adapter.descreverVinculo(1L)).contains("historico de telemetria gravado");
	}
}
