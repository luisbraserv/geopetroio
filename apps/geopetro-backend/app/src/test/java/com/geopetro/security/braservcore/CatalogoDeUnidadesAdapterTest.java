package com.geopetro.security.braservcore;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.geopetro.comum.port.AcessoDoUsuarioPort.BraservCoreIndisponivelException;

/** Spec braserv-core §7: leitura com cache de 60 s; escrita sem cache. */
class CatalogoDeUnidadesAdapterTest {

	private final BraservCoreHttp core = mock(BraservCoreHttp.class);
	private final AcessoDoUsuarioAdapterTest.RelogioManual relogio = new AcessoDoUsuarioAdapterTest.RelogioManual();
	private final CatalogoDeUnidadesAdapter catalogo = new CatalogoDeUnidadesAdapter(core, Duration.ofSeconds(60), relogio);

	private static BraservCoreHttp.UnidadeResposta unidade(long id, String nome, String status) {
		return new BraservCoreHttp.UnidadeResposta(id, nome, null, "SONDA", status, 2L);
	}

	@Test
	@DisplayName("uma consulta ao core por minuto; busca por id e por nome usam a mesma lista")
	void cacheDeUmMinuto() {
		when(core.unidades()).thenReturn(List.of(unidade(7, "SPT-144", "ATIVA"), unidade(8, "SPT-145", "INATIVA")));

		assertThat(catalogo.buscar(7).orElseThrow().nome()).isEqualTo("SPT-144");
		assertThat(catalogo.buscarPorNome("SPT-145").orElseThrow().ativa()).isFalse();
		assertThat(catalogo.listar()).hasSize(2);
		verify(core, times(1)).unidades();

		relogio.avancar(Duration.ofSeconds(61));
		catalogo.listar();
		verify(core, times(2)).unidades();
	}

	@Test
	@DisplayName("core fora do ar: a leitura segue com a ultima lista")
	void leituraUsaUltimaLista() {
		when(core.unidades()).thenReturn(List.of(unidade(7, "SPT-144", "ATIVA")))
				.thenThrow(new IllegalStateException("conexao recusada"));

		catalogo.listar();
		relogio.avancar(Duration.ofMinutes(10));

		assertThat(catalogo.buscar(7)).isPresent();
	}

	@Test
	@DisplayName("core fora do ar e nenhuma lista anterior: falha")
	void semListaAnterior() {
		when(core.unidades()).thenThrow(new IllegalStateException("conexao recusada"));

		assertThatThrownBy(catalogo::listar).isInstanceOf(BraservCoreIndisponivelException.class);
	}

	@Test
	@DisplayName("escrita pergunta ao core agora, e falha se ele nao responder")
	void semCache() {
		when(core.unidades()).thenReturn(List.of(unidade(7, "SPT-144", "ATIVA")));
		catalogo.listar();
		when(core.unidade(7)).thenReturn(Optional.empty());

		assertThat(catalogo.buscarSemCache(7)).as("excluida ha pouco no core").isEmpty();

		when(core.unidade(7)).thenThrow(new IllegalStateException("conexao recusada"));
		assertThatThrownBy(() -> catalogo.buscarSemCache(7)).isInstanceOf(BraservCoreIndisponivelException.class);
	}
}
