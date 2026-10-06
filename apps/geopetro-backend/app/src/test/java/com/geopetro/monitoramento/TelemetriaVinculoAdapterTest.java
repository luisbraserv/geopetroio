package com.geopetro.monitoramento;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.geopetro.comum.port.AcessoDoUsuarioPort.BraservCoreIndisponivelException;
import com.geopetro.comum.port.CatalogoDeUnidadesPort;
import com.geopetro.comum.port.CatalogoDeUnidadesPort.Unidade;
import com.geopetro.monitoramento.dto.ExistenciaSerieDTO;
import com.geopetro.vinculos.VinculoDaUnidade.FonteIndisponivelException;

/** RN-072, RN-116: o historico de telemetria conta como uso da unidade. */
class TelemetriaVinculoAdapterTest {

	private final MonitoramentoClient client = mock(MonitoramentoClient.class);
	private final CatalogoDeUnidadesPort catalogo = mock(CatalogoDeUnidadesPort.class);
	private final TelemetriaVinculoAdapter adapter = new TelemetriaVinculoAdapter(client, catalogo);

	private void cadastro(long id, String nome) {
		when(catalogo.buscarSemCache(id)).thenReturn(Optional.of(new Unidade(id, nome, null, "SONDA", "ATIVA", 1L)));
	}

	@Test
	@DisplayName("unidade sem historico: nada impede")
	void semHistorico() {
		cadastro(1L, "SPT-144");
		when(client.consultarExistencia("SPT-144")).thenReturn(Optional.of(new ExistenciaSerieDTO("SPT-144", false, null, null)));

		assertThat(adapter.descrever(1L)).isEmpty();
	}

	@Test
	@DisplayName("unidade com historico: diz de quando ate quando, em UTC")
	void comHistoricoComDatas() {
		cadastro(1L, "SPT-144");
		when(client.consultarExistencia("SPT-144")).thenReturn(Optional.of(new ExistenciaSerieDTO("SPT-144", true,
				Instant.parse("2026-03-01T10:00:00Z"), Instant.parse("2026-09-05T23:59:00Z"))));

		assertThat(adapter.descrever(1L)).contains("telemetria de 01/03/2026 a 05/09/2026");
	}

	@Test
	@DisplayName("historico sem datas ainda conta como uso")
	void historicoSemDatas() {
		cadastro(1L, "SPT-144");
		when(client.consultarExistencia("SPT-144")).thenReturn(Optional.of(new ExistenciaSerieDTO("SPT-144", true, null, null)));

		assertThat(adapter.descrever(1L)).contains("historico de telemetria gravado");
	}

	@Test
	@DisplayName("telemetria indisponivel: falha, em vez de responder 'sem uso'")
	void telemetriaIndisponivel() {
		cadastro(1L, "SPT-144");
		when(client.consultarExistencia("SPT-144")).thenReturn(Optional.empty());

		assertThatThrownBy(() -> adapter.descrever(1L)).isInstanceOf(FonteIndisponivelException.class)
				.hasMessageContaining("Telemetria");
	}

	@Test
	@DisplayName("consulta a telemetria pelo nome que o core informa agora, a chave de integracao (RN-018)")
	void consultaPeloNome() {
		cadastro(7L, "SPT-201");
		when(client.consultarExistencia("SPT-201")).thenReturn(Optional.of(new ExistenciaSerieDTO("SPT-201", false, null, null)));

		adapter.descrever(7L);

		verify(client).consultarExistencia("SPT-201");
	}

	@Test
	@DisplayName("unidade que o core nao conhece: sem uso, e a telemetria nem e consultada")
	void unidadeDesconhecida() {
		when(catalogo.buscarSemCache(99L)).thenReturn(Optional.empty());

		assertThat(adapter.descrever(99L)).isEmpty();
		verify(client, never()).consultarExistencia(anyString());
	}

	@Test
	@DisplayName("core sem resposta para dar o nome: falha")
	void coreIndisponivel() {
		when(catalogo.buscarSemCache(1L)).thenThrow(new BraservCoreIndisponivelException("fora", null));

		assertThatThrownBy(() -> adapter.descrever(1L)).isInstanceOf(FonteIndisponivelException.class);
	}
}
