package com.geopetro.monitoramento;

import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Optional;

import org.springframework.stereotype.Component;

import com.geopetro.core.port.VinculoCadastroPort;
import com.geopetro.monitoramento.dto.ExistenciaSerieDTO;
import com.geopetro.unidadesonda.repository.UnidadeSondaJpaRepository;

/**
 * O historico de telemetria impede a exclusao da Unidade/Sonda — RN-072.
 *
 * <p>Este e o unico implementador de {@link VinculoCadastroPort} que <b>nao</b> consulta o banco
 * relacional: a serie vive no InfluxDB, dentro de outro servico, e o Geopetro-Backend so sabe dela
 * perguntando. Mora no modulo {@code app} porque e onde o {@link MonitoramentoClient} existe.
 *
 * <p>A consulta e por <b>nome</b>, nao por id: o nome da Unidade/Sonda e a chave de integracao com a
 * telemetria (RN-018). Por isso o adaptador precisa traduzir id em nome antes de perguntar.
 *
 * <p><b>Usa o repositorio, nao o {@code UnidadeSondaService}</b>, de proposito: o servico depende da
 * guarda de exclusao, a guarda depende deste adaptador, e injetar o servico aqui fecharia um ciclo
 * que o Spring recusa a subir.
 */
@Component
public class TelemetriaVinculoAdapter implements VinculoCadastroPort {

	/**
	 * Em UTC, e nao no fuso da maquina, por duas razoes: o contrato de telemetria e UTC ponta a
	 * ponta, e a mensagem precisa ser a mesma em qualquer servidor. No fuso local, um ponto gravado
	 * a meia-noite UTC apareceria como o dia anterior — a recusa passaria a depender de onde a
	 * aplicacao esta rodando.
	 */
	private static final DateTimeFormatter DATA = DateTimeFormatter.ofPattern("dd/MM/yyyy")
			.withZone(ZoneOffset.UTC);

	private final MonitoramentoClient client;
	private final UnidadeSondaJpaRepository repository;

	public TelemetriaVinculoAdapter(MonitoramentoClient client, UnidadeSondaJpaRepository repository) {
		this.client = client;
		this.repository = repository;
	}

	@Override
	public Cadastro cadastro() {
		return Cadastro.UNIDADE_SONDA;
	}

	/**
	 * <b>Indisponibilidade bloqueia a exclusao.</b> Isto inverte de proposito a degradacao graciosa
	 * que vale para a consulta de serie: la, falhar devolvendo vazio custa uma tela sem grafico;
	 * aqui, assumir "nao tem historico" porque ninguem respondeu apaga um cadastro que nao podia ser
	 * apagado. So um dos dois erros tem volta.
	 */
	@Override
	public Optional<String> descreverVinculo(Long unidadeSondaId) {
		// Cadastro ausente nao e problema deste adaptador: quem chama ja falha com 404 antes.
		String nome = repository.findById(unidadeSondaId)
				.map(unidade -> unidade.getNome())
				.orElse(null);
		if (nome == null) {
			return Optional.empty();
		}

		Optional<ExistenciaSerieDTO> resposta = client.consultarExistencia(nome);
		if (resposta.isEmpty()) {
			return Optional.of("nao foi possivel confirmar o historico de telemetria "
					+ "(servico indisponivel); tente novamente");
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
