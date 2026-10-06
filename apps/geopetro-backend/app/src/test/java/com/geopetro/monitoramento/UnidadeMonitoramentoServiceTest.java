package com.geopetro.monitoramento;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.geopetro.comum.exception.ResourceNotFoundException;
import com.geopetro.comum.port.AcessoDoUsuarioPort;
import com.geopetro.comum.port.AcessoDoUsuarioPort.AcessoDoUsuario;
import com.geopetro.comum.port.CatalogoDeUnidadesPort;
import com.geopetro.comum.port.CatalogoDeUnidadesPort.Unidade;
import com.geopetro.monitoramento.dto.MonitoramentoSerieDTO;
import com.geopetro.monitoramento.dto.UnidadeDisponivelDTO;

/** RN-047, RN-048: quanto cada usuario enxerga, com usuario e unidades vindos do Braserv-Core. */
class UnidadeMonitoramentoServiceTest {

	private final CatalogoDeUnidadesPort catalogo = mock(CatalogoDeUnidadesPort.class);
	private final AcessoDoUsuarioPort acessos = mock(AcessoDoUsuarioPort.class);
	private final MonitoramentoClient telemetria = mock(MonitoramentoClient.class);
	private final UnidadeMonitoramentoService service = new UnidadeMonitoramentoService(catalogo, acessos, telemetria);

	private static final Unidade SPT_144 = new Unidade(1L, "SPT-144", "Sonda 144", "SONDA", "ATIVA", 2L);
	private static final Unidade SPT_145 = new Unidade(2L, "SPT-145", null, "SONDA", "ATIVA", 2L);
	private static final Unidade UC_01 = new Unidade(3L, "UC-01", null, "UCAQ", "ATIVA", 2L);
	private static final Unidade BK_21_INATIVA = new Unidade(4L, "BK-21", null, "SONDA", "INATIVA", 2L);

	@BeforeEach
	void setUp() {
		when(catalogo.listar()).thenReturn(List.of(UC_01, SPT_145, SPT_144, BK_21_INATIVA));
		for (Unidade u : List.of(SPT_144, SPT_145, UC_01, BK_21_INATIVA)) {
			when(catalogo.buscar(u.id())).thenReturn(Optional.of(u));
		}
	}

	private void usuario(String username, String tipo, Set<Long> concedidas, String... roles) {
		when(acessos.buscar(username)).thenReturn(Optional.of(new AcessoDoUsuario(username, tipo, true, Set.of(roles), concedidas)));
	}

	private List<String> nomes(String username) {
		return service.listarUnidadesDoUsuario(username).stream().map(UnidadeDisponivelDTO::nome).toList();
	}

	@Test
	@DisplayName("ADMIN enxerga a frota inteira, em ordem de nome, sem as inativas")
	void adminVeTodaFrota() {
		usuario("admin", "INTERNO", Set.of(), "INTERNO", "ADMIN");

		assertThat(nomes("admin")).containsExactly("SPT-144", "SPT-145", "UC-01");
	}

	@Test
	@DisplayName("conta interna com qualquer permissao de monitoramento enxerga a frota inteira")
	void internoComMonitoramentoVeTodaFrota() {
		usuario("op", "INTERNO", Set.of(), "INTERNO", "MONITORAMENTO");
		usuario("real", "INTERNO", Set.of(), "INTERNO", "MONITORAMENTO_REAL");

		assertThat(nomes("op")).hasSize(3);
		assertThat(nomes("real")).hasSize(3);
	}

	@Test
	@DisplayName("CLIENTE enxerga apenas as unidades concedidas")
	void clienteVeApenasConcedidas() {
		usuario("cli", "CLIENTE", Set.of(1L, 3L), "CLIENTE", "MONITORAMENTO");

		assertThat(nomes("cli")).containsExactly("SPT-144", "UC-01");
		assertThat(service.usuarioPossuiAcessoAUnidade("cli", 1L)).isTrue();
		assertThat(service.usuarioPossuiAcessoAUnidade("cli", 2L)).as("fora da concessao").isFalse();
	}

	@Test
	@DisplayName("CLIENTE sem concessao nao enxerga nada, sem erro")
	void clienteSemConcessao() {
		usuario("cli", "CLIENTE", Set.of(), "CLIENTE", "MONITORAMENTO");

		assertThat(nomes("cli")).isEmpty();
	}

	@Test
	@DisplayName("CLIENTE que tambem e ADMIN enxerga a frota inteira")
	void clienteComAdmin() {
		usuario("cli", "CLIENTE", Set.of(1L), "CLIENTE", "ADMIN");

		assertThat(nomes("cli")).hasSize(3);
	}

	@Test
	@DisplayName("so INTERNO, interno de outro modulo ou permissao sem tipo de conta: nada")
	void perfisSemMonitoramento() {
		usuario("interno", "INTERNO", Set.of(), "INTERNO");
		usuario("simulador", "INTERNO", Set.of(), "INTERNO", "SIMULADOR", "CIMENTACAO");
		usuario("solta", "INTERNO", Set.of(), "MONITORAMENTO");

		assertThat(nomes("interno")).isEmpty();
		assertThat(nomes("simulador")).isEmpty();
		assertThat(nomes("solta")).isEmpty();
	}

	@Test
	@DisplayName("RN-116: unidade inativa sai da lista, mas quem tinha acesso ainda consulta o historico")
	void inativaSaiDaListaMasHistoricoContinua() {
		usuario("cli", "CLIENTE", Set.of(4L), "CLIENTE", "MONITORAMENTO");
		var serie = new MonitoramentoSerieDTO("BK-21", "PRESSAO_01", null, List.of());
		when(telemetria.consultarSerie(eq("BK-21"), eq("PRESSAO_01"), any(), any(), any())).thenReturn(Optional.of(serie));

		assertThat(nomes("cli")).isEmpty();
		assertThat(service.consultarSerie("cli", 4L, "PRESSAO_01", null, Instant.EPOCH, Instant.now())).contains(serie);
	}

	@Test
	@DisplayName("a serie e consultada na telemetria pelo NOME da unidade (RN-018)")
	void serieUsaONome() {
		usuario("op", "INTERNO", Set.of(), "INTERNO", "MONITORAMENTO");

		service.consultarSerie("op", 1L, "PRESSAO_01", "vazao", Instant.EPOCH, Instant.now());

		verify(telemetria).consultarSerie(eq("SPT-144"), eq("PRESSAO_01"), eq("vazao"), any(), any());
	}

	@Test
	@DisplayName("sem acesso a unidade, a telemetria nem e consultada")
	void semAcessoNaoConsulta() {
		usuario("cli", "CLIENTE", Set.of(2L), "CLIENTE", "MONITORAMENTO");

		assertThat(service.consultarSerie("cli", 1L, "PRESSAO_01", null, Instant.EPOCH, Instant.now())).isEmpty();
		verify(telemetria, never()).consultarSerie(anyString(), anyString(), any(), any(), any());
	}

	@Test
	@DisplayName("conta desativada no core nao enxerga nada, mesmo sendo ADMIN")
	void contaDesativada() {
		when(acessos.buscar("demitido")).thenReturn(Optional.of(
				new AcessoDoUsuario("demitido", "INTERNO", false, Set.of("INTERNO", "ADMIN"), Set.of())));

		assertThat(nomes("demitido")).isEmpty();
		assertThat(service.usuarioPossuiAcessoAUnidade("demitido", 1L)).isFalse();
	}

	@Test
	@DisplayName("id de unidade inventado nao e autorizado, nem para quem ve a frota inteira")
	void unidadeInexistente() {
		usuario("admin", "INTERNO", Set.of(), "INTERNO", "ADMIN");

		assertThat(service.usuarioPossuiAcessoAUnidade("admin", 99L)).isFalse();
	}

	@Test
	@DisplayName("antes de gravar, a unidade precisa existir no core agora")
	void exigirUnidadeExistente() {
		when(catalogo.buscarSemCache(1L)).thenReturn(Optional.of(SPT_144));
		when(catalogo.buscarSemCache(99L)).thenReturn(Optional.empty());

		service.exigirUnidadeExistente(1L);
		assertThatThrownBy(() -> service.exigirUnidadeExistente(99L)).isInstanceOf(ResourceNotFoundException.class);
	}
}
