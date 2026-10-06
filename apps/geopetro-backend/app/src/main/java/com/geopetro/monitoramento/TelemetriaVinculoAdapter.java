package com.geopetro.monitoramento;

import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Optional;

import org.springframework.stereotype.Component;

import com.geopetro.comum.port.AcessoDoUsuarioPort.BraservCoreIndisponivelException;
import com.geopetro.comum.port.CatalogoDeUnidadesPort;
import com.geopetro.monitoramento.dto.ExistenciaSerieDTO;
import com.geopetro.vinculos.VinculoDaUnidade;

/**
 * O historico de telemetria impede a exclusao da Unidade — RN-072.
 *
 * <p>Este e o unico implementador de {@link VinculoDaUnidade} que <b>nao</b> consulta o banco
 * relacional: a serie vive no InfluxDB, dentro de outro servico, e o Geopetro-Backend so sabe dela
 * perguntando. Mora no modulo {@code app} porque e onde o {@link MonitoramentoClient} existe.
 *
 * <p>A consulta e por <b>nome</b>, nao por id: o nome da Unidade e a chave de integracao com a
 * telemetria (RN-018). Por isso o adaptador precisa traduzir id em nome antes de perguntar.
 *
 */
@Component
public class TelemetriaVinculoAdapter implements VinculoDaUnidade {

	/**
	 * Em UTC, e nao no fuso da maquina: o contrato de telemetria e UTC ponta a ponta, e a mensagem
	 * precisa ser a mesma em qualquer servidor.
	 */
	private static final DateTimeFormatter DATA = DateTimeFormatter.ofPattern("dd/MM/yyyy")
			.withZone(ZoneOffset.UTC);

	private final MonitoramentoClient client;
	private final CatalogoDeUnidadesPort unidades;

	public TelemetriaVinculoAdapter(MonitoramentoClient client, CatalogoDeUnidadesPort unidades) {
		this.client = client;
		this.unidades = unidades;
	}

	/**
	 * <b>Indisponibilidade bloqueia a exclusao.</b> Isto inverte de proposito a degradacao graciosa
	 * que vale para a consulta de serie: la, falhar devolvendo vazio custa uma tela sem grafico;
	 * aqui, assumir "nao tem historico" porque ninguem respondeu apaga um cadastro que nao podia ser
	 * apagado. So um dos dois erros tem volta.
	 */
	@Override
	public Optional<String> descrever(long unidadeId) {
		String nome;
		try {
			// A serie e indexada pelo nome (RN-018); o nome vem do core, sem cache.
			nome = unidades.buscarSemCache(unidadeId).map(CatalogoDeUnidadesPort.Unidade::nome).orElse(null);
		} catch (BraservCoreIndisponivelException indisponivel) {
			throw new FonteIndisponivelException("nao foi possivel obter o nome da unidade no Braserv-Core");
		}
		if (nome == null) {
			return Optional.empty();
		}
		Optional<ExistenciaSerieDTO> resposta = client.consultarExistencia(nome);
		if (resposta.isEmpty()) {
			throw new FonteIndisponivelException("a Geopetro-Telemetria nao respondeu");
		}
		ExistenciaSerieDTO existencia = resposta.get();
		if (!existencia.possuiSerie()) {
			return Optional.empty();
		}
		if (existencia.primeiroPonto() == null || existencia.ultimoPonto() == null) {
			return Optional.of("historico de telemetria gravado");
		}
		return Optional.of("telemetria de " + DATA.format(existencia.primeiroPonto())
				+ " a " + DATA.format(existencia.ultimoPonto()));
	}
}
