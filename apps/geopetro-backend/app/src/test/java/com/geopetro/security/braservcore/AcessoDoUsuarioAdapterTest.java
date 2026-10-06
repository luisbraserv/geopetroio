package com.geopetro.security.braservcore;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.geopetro.comum.port.AcessoDoUsuarioPort.AcessoDoUsuario;
import com.geopetro.comum.port.AcessoDoUsuarioPort.BraservCoreIndisponivelException;

/** Spec braserv-core §6.6: cache de 10 s e, com o core fora do ar, ultimo valor por ate 5 min (D-4). */
class AcessoDoUsuarioAdapterTest {

	/** Relogio que so anda quando o teste manda. */
	static final class RelogioManual extends Clock {
		private Instant agora = Instant.parse("2026-10-06T12:00:00Z");

		void avancar(Duration d) {
			agora = agora.plus(d);
		}

		@Override
		public Instant instant() {
			return agora;
		}

		@Override
		public ZoneId getZone() {
			return ZoneOffset.UTC;
		}

		@Override
		public Clock withZone(ZoneId zone) {
			return this;
		}
	}

	private final BraservCoreHttp core = mock(BraservCoreHttp.class);
	private final RelogioManual relogio = new RelogioManual();
	private final AcessoDoUsuarioAdapter adapter =
			new AcessoDoUsuarioAdapter(core, Duration.ofSeconds(10), Duration.ofMinutes(5), relogio);

	private static Optional<BraservCoreHttp.AcessoResposta> resposta(boolean ativo) {
		return Optional.of(new BraservCoreHttp.AcessoResposta("cli", "CLIENTE", ativo, Set.of("CLIENTE", "MONITORAMENTO"), List.of(7L)));
	}

	@Test
	@DisplayName("converte a resposta do core: tipo, roles e concessoes")
	void converte() {
		when(core.acesso("cli")).thenReturn(resposta(true));

		AcessoDoUsuario acesso = adapter.buscar("cli").orElseThrow();

		assertThat(acesso.cliente()).isTrue();
		assertThat(acesso.ativo()).isTrue();
		assertThat(acesso.roles()).containsExactlyInAnyOrder("CLIENTE", "MONITORAMENTO");
		assertThat(acesso.unidadeIds()).containsExactly(7L);
	}

	@Test
	@DisplayName("dentro de 10 s responde do cache; depois disso pergunta de novo e ve a desativacao")
	void cacheDeDezSegundos() {
		when(core.acesso("cli")).thenReturn(resposta(true), resposta(false));

		assertThat(adapter.buscar("cli").orElseThrow().ativo()).isTrue();
		relogio.avancar(Duration.ofSeconds(9));
		assertThat(adapter.buscar("cli").orElseThrow().ativo()).isTrue();
		verify(core, times(1)).acesso("cli");

		relogio.avancar(Duration.ofSeconds(2));
		assertThat(adapter.buscar("cli").orElseThrow().ativo()).as("desativado no core").isFalse();
		verify(core, times(2)).acesso("cli");
	}

	@Test
	@DisplayName("core fora do ar: o ultimo acesso vale ate 5 min, depois nega")
	void toleranciaDeCincoMinutos() {
		when(core.acesso("cli")).thenReturn(resposta(true)).thenThrow(new IllegalStateException("conexao recusada"));

		adapter.buscar("cli");
		relogio.avancar(Duration.ofMinutes(4));
		assertThat(adapter.buscar("cli").orElseThrow().ativo()).as("reinicio do core nao derruba ninguem").isTrue();

		relogio.avancar(Duration.ofMinutes(2));
		assertThatThrownBy(() -> adapter.buscar("cli")).isInstanceOf(BraservCoreIndisponivelException.class);
	}

	@Test
	@DisplayName("core fora do ar e nenhum acesso anterior: nega")
	void semAcessoAnterior() {
		when(core.acesso("cli")).thenThrow(new IllegalStateException("conexao recusada"));

		assertThatThrownBy(() -> adapter.buscar("cli")).isInstanceOf(BraservCoreIndisponivelException.class);
	}

	@Test
	@DisplayName("usuario inexistente tambem vai para o cache")
	void inexistenteNoCache() {
		when(core.acesso("fantasma")).thenReturn(Optional.empty());

		assertThat(adapter.buscar("fantasma")).isEmpty();
		assertThat(adapter.buscar("fantasma")).isEmpty();
		verify(core, times(1)).acesso("fantasma");
	}

	@Test
	@DisplayName("usuarios diferentes nao compartilham entrada")
	void usuariosNaoSeMisturam() {
		when(core.acesso("cli")).thenReturn(resposta(true));
		when(core.acesso("outro")).thenReturn(Optional.empty());

		assertThat(adapter.buscar("cli")).isPresent();
		assertThat(adapter.buscar("outro")).isEmpty();
	}
}
