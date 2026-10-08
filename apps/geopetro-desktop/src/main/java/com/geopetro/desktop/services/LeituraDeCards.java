package com.geopetro.desktop.services;

import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.geopetro.desktop.calculos.FlowRateCalculatorService;
import com.geopetro.desktop.calculos.HydraulicTorqueCalculator;
import com.geopetro.desktop.calculos.PesoColunaCalculator;
import com.geopetro.desktop.calculos.StrokeCalculatorService;
import com.geopetro.desktop.conversao.ConversaoPressao;
import com.geopetro.desktop.conversao.ConversaoSinalAnalogico;
import com.geopetro.desktop.conversao.ConversaoTanque;
import com.geopetro.desktop.conversao.ConversaoTemperatura;
import com.geopetro.desktop.conversao.SensorPressaoConfig;
import com.geopetro.desktop.models.CardsDaUnidade.Card;
import com.geopetro.desktop.models.CardsDaUnidade.Parametros;
import com.geopetro.desktop.models.CardsDaUnidade.Tipo;
import com.geopetro.desktop.models.LeituraPublicada;

/**
 * Converte um ciclo de leitura do CLP nas grandezas que os cards declaram.
 *
 * <h2>O que esta classe é</h2>
 * A tradução entre <b>o que se leu</b> (bytes numa faixa do DB) e <b>o que aquilo significa</b>
 * (peso em lbf, torque em lbf·ft, pressão em psi, vazão em bbl/min), dirigida pelo documento de
 * cards em vez de endereços fixos no código.
 *
 * <h2>De onde vem cada parte da conversão</h2>
 * <table>
 *   <tr><th>Parte</th><th>Origem</th><th>Por quê</th></tr>
 *   <tr><td>Endereço e tipo</td><td>Documento de cards</td><td>É o que a configuração decide</td></tr>
 *   <tr><td>{@code rangeSensorBar}</td><td>Documento</td><td>Valor de placa do transmissor</td></tr>
 *   <tr><td>Sensibilidade e geometria</td><td>{@link CalibracaoDeCards}, por {@code dispositivoId}</td>
 *       <td>Medição de campo, feita na unidade</td></tr>
 * </table>
 *
 * <h2>Card inativo não é lido</h2>
 * Desativar para de publicar (RN-091). Um card desativado nem entra na faixa lida — o que também
 * encolhe a leitura quando alguém desativa o card do endereço mais alto.
 *
 * <h2>⚠️ Sem calibração, não há número</h2>
 * Peso e torque sem geometria preenchida devolvem grandeza <b>sem valor</b>, não zero. Zero é um
 * número: entraria no histórico, apareceria no gráfico e passaria por leitura real. A ausência é
 * visível; o zero, não.
 */
@Service
public class LeituraDeCards {

	private static final Logger logger = LoggerFactory.getLogger(LeituraDeCards.class);

	/** Uma grandeza medida por um card neste ciclo. */
	public record Grandeza(
			String dispositivoId,
			/** Rótulo de tela. Fica no Desktop: não entra no contrato de telemetria (RN-097). */
			String nome,
			Tipo tipo,
			/** Discrimina as três séries do contador de stroke; vazio para os demais. */
			String serie,
			/** Onde foi lido neste ciclo, como {@code DBW10}. Vai na mensagem — RN-097. */
			String enderecoDb,
			/** RN-037: visibilidade controla publicação, não gravação. */
			boolean visivel,
			/** {@code null} quando não há como converter — falta calibração ou o tipo ainda não converte. */
			Double valor,
			String unidade,
			/** O que veio do CLP, sempre presente: é ele que revela canal mudo ou escala inesperada. */
			double bruto,
			/** Motivo da ausência de valor, para a tela e para o log. */
			String semValorPorque) {

		public boolean temValor() {
			return valor != null;
		}

		static Grandeza de(Card card, String serie, double valor, String unidade, double bruto) {
			return new Grandeza(card.dispositivoId(), card.nome(), card.tipo(), serie,
					endereco(card), card.visivel(), valor, unidade, bruto, null);
		}

		static Grandeza sem(Card card, String serie, String unidade, double bruto, String porque) {
			return new Grandeza(card.dispositivoId(), card.nome(), card.tipo(), serie,
					endereco(card), card.visivel(), null, unidade, bruto, porque);
		}

		private static String endereco(Card card) {
			return card.tipo().enderecoLegivel(card.byteInicial());
		}
	}

	/** As três séries de um card de stroke — {@code cards-configuraveis.md §3}. */
	public static final String SERIE_STROKE = "stroke";
	public static final String SERIE_VAZAO = "vazao";
	public static final String SERIE_VOLUME = "volumeAcumulado";

	private final CalibracaoDeCards calibracoes;
	private final StrokeCalculatorService strokes;
	private final FlowRateCalculatorService vazoes;

	public LeituraDeCards(CalibracaoDeCards calibracoes, StrokeCalculatorService strokes,
			FlowRateCalculatorService vazoes) {
		this.calibracoes = calibracoes;
		this.strokes = strokes;
		this.vazoes = vazoes;
	}

	/**
	 * O que vai para os canais de telemetria — RN-037, RN-099.
	 *
	 * <p>Duas filtragens, e são regras diferentes:
	 * <ul>
	 *   <li><b>Visível</b>: card ativo mas invisível é lido e gravado localmente, e não publicado.
	 *       Visibilidade controla publicação, não gravação (RN-037).</li>
	 *   <li><b>Com valor</b>: grandeza sem conversão possível não entra. Lacuna no gráfico é
	 *       honesta; zero seria um número, entraria no histórico e passaria por medição real
	 *       (RN-099).</li>
	 * </ul>
	 */
	public static List<LeituraPublicada> paraPublicar(List<Grandeza> grandezas) {
		return grandezas.stream()
				.filter(Grandeza::visivel)
				.filter(Grandeza::temValor)
				.map(g -> new LeituraPublicada(
						g.dispositivoId(),
						// Ausente no JSON para card de uma grandeza so.
						g.serie() == null || g.serie().isBlank() ? null : g.serie(),
						g.tipo().name(),
						g.unidade(),
						g.enderecoDb(),
						g.valor(),
						g.bruto()))
				.toList();
	}

	/** Só os cards ativos: desativado não é lido nem publicado. */
	public static List<Card> ativos(List<Card> cards) {
		return cards == null ? List.of() : cards.stream().filter(Card::ativo).toList();
	}

	/**
	 * A faixa do DB que cobre todos os cards ativos.
	 *
	 * @throws IllegalArgumentException se não houver card ativo — quem chama decide o que fazer,
	 *         e a resposta certa é não ir ao CLP (RN-088)
	 */
	public static BlocoDeLeitura.Faixa faixaDe(List<Card> ativos) {
		int[] enderecos = new int[ativos.size()];
		int[] tamanhos = new int[ativos.size()];
		for (int i = 0; i < ativos.size(); i++) {
			enderecos[i] = ativos.get(i).byteInicial();
			tamanhos[i] = ativos.get(i).tipo().tamanhoEmBytes();
		}
		return BlocoDeLeitura.faixaQueCobre(enderecos, tamanhos);
	}

	public List<Grandeza> converter(List<Card> ativos, BlocoDeLeitura bloco) {
		List<Grandeza> grandezas = new ArrayList<>();
		for (Card card : ativos) {
			switch (card.tipo()) {
				case PESO -> grandezas.add(peso(card, bloco));
				case TORQUE -> grandezas.add(torque(card, bloco));
				case PRESSAO -> grandezas.add(pressao(card, bloco));
				case CONTADOR_STROKE -> grandezas.addAll(stroke(card, bloco));
				case TEMPERATURA -> grandezas.add(temperatura(card, bloco));
				case NIVEL_TANQUE -> grandezas.add(tanque(card, bloco));
			}
		}
		return grandezas;
	}

	// ============================================================ analógicos

	/**
	 * Posição no laço 4-20 mA convertida em psi.
	 *
	 * <p>O valor publicado pelo LOGO! é o laço reescalonado para −250..750 pelo Analog Amplifier —
	 * não é pressão. O range do transmissor traduz essa posição; a sensibilidade é o trim da estação.
	 */
	private double psi(Card card, BlocoDeLeitura bloco) {
		short ax = bloco.word(card.byteInicial());
		if (ConversaoSinalAnalogico.foraDaFaixa(ax)) {
			// Abaixo de -250 e corrente menor que 4 mA: laco aberto, sensor sem alimentacao ou canal
			// nao mapeado. Sinalizar, nao corrigir.
			logger.warn("[PLC] Ax fora de {}..{} no card {} (DBW{}): {}",
					ConversaoSinalAnalogico.AX_MIN, ConversaoSinalAnalogico.AX_MAX,
					card.dispositivoId(), card.byteInicial(), ax);
		}
		SensorPressaoConfig sensor = new SensorPressaoConfig();
		sensor.setRangeBar(rangeSensorBar(card));
		sensor.setSensibilidade(calibracoes.para(card.dispositivoId()).sensibilidade());
		return ConversaoPressao.axParaPsi(ax, sensor);
	}

	private Grandeza pressao(Card card, BlocoDeLeitura bloco) {
		double bruto = bloco.word(card.byteInicial());
		if (rangeSensorBar(card) <= 0) {
			return Grandeza.sem(card, "", "psi", bruto, "card sem range do sensor");
		}
		return Grandeza.de(card, "", psi(card, bloco), "psi", bruto);
	}

	private Grandeza peso(Card card, BlocoDeLeitura bloco) {
		double bruto = bloco.word(card.byteInicial());
		if (rangeSensorBar(card) <= 0) {
			return Grandeza.sem(card, "", "lbf", bruto, "card sem range do sensor");
		}
		var geometria = calibracoes.para(card.dispositivoId()).peso();
		if (geometria == null || !geometria.isConfigurado()) {
			// Zero passaria por leitura real e entraria no historico. A ausencia e visivel.
			return Grandeza.sem(card, "", "lbf", bruto, "calibracao do sargento nao preenchida");
		}
		return Grandeza.de(card, "",
				PesoColunaCalculator.calcular(psi(card, bloco), geometria).pesoColunaLbf(), "lbf", bruto);
	}

	private Grandeza torque(Card card, BlocoDeLeitura bloco) {
		double bruto = bloco.word(card.byteInicial());
		if (rangeSensorBar(card) <= 0) {
			return Grandeza.sem(card, "", "lbf.ft", bruto, "card sem range do sensor");
		}
		var chave = calibracoes.para(card.dispositivoId()).chave();
		if (chave == null || !chave.isConfigurado()) {
			return Grandeza.sem(card, "", "lbf.ft", bruto, "calibracao da chave nao preenchida");
		}
		double efetiva = HydraulicTorqueCalculator.calculateEffectivePressurePsi(psi(card, bloco));
		return Grandeza.de(card, "", HydraulicTorqueCalculator.calculateTorque(
				efetiva,
				chave.getDiametroPistaoIn(),
				chave.getDiametroHasteIn(),
				chave.getBracoAlavancaFt(),
				chave.getTipoMovimento()), "lbf.ft", bruto);
	}

	/**
	 * Temperatura — RN-083. A escala tem mínimo e máximo, não só fundo.
	 *
	 * <p>Não passa por {@link #psi}: um transmissor de temperatura não mede pressão, e a
	 * sensibilidade que ajusta um sensor de pressão não tem significado aqui.
	 */
	private Grandeza temperatura(Card card, BlocoDeLeitura bloco) {
		short ax = bloco.word(card.byteInicial());
		String unidade = ConversaoTemperatura.unidade(card.parametros());
		avisarSeForaDaFaixa(card, ax);

		Double valor = ConversaoTemperatura.valor(ax, card.parametros());
		return valor == null
				? Grandeza.sem(card, "", unidade, ax, "card sem escala de temperatura (minimo e maximo)")
				: Grandeza.de(card, "", valor, unidade, ax);
	}

	/**
	 * Nível do tanque — RN-084, RN-085. O que sai é <b>volume em bbl</b>.
	 *
	 * <p>⚠️ O sensor está no topo e mede <b>distância até a superfície</b>. O nível é o que sobra, e
	 * o volume depende da forma. Ler a distância como se fosse nível daria um tanque que enche
	 * quando esvazia.
	 */
	private Grandeza tanque(Card card, BlocoDeLeitura bloco) {
		short ax = bloco.word(card.byteInicial());
		avisarSeForaDaFaixa(card, ax);

		Double volume = ConversaoTanque.volumeBbl(ax, card.parametros());
		return volume == null
				? Grandeza.sem(card, "", "bbl", ax, "card sem forma, dimensoes ou distancias do tanque")
				: Grandeza.de(card, "", volume, "bbl", ax);
	}

	private void avisarSeForaDaFaixa(Card card, short ax) {
		if (ConversaoSinalAnalogico.foraDaFaixa(ax)) {
			logger.warn("[PLC] Ax fora de {}..{} no card {} (DBW{}): {}",
					ConversaoSinalAnalogico.AX_MIN, ConversaoSinalAnalogico.AX_MAX,
					card.dispositivoId(), card.byteInicial(), ax);
		}
	}

	// ============================================================ contador de stroke

	/**
	 * As três séries do contador — {@code cards-configuraveis.md §3}.
	 *
	 * <p>⚠️ O estado é <b>por card</b>: cada bomba tem seu delta e sua janela de 60 s. Com estado
	 * compartilhado, duas bombas somariam strokes uma da outra e as duas vazões sairiam plausíveis
	 * e erradas.
	 */
	private List<Grandeza> stroke(Card card, BlocoDeLeitura bloco) {
		long cumulativo = bloco.dword(card.byteInicial());
		long atual = strokes.calculateCurrentStroke(card.dispositivoId(), cumulativo);

		double constante = constanteBomba(card);
		if (constante <= 0) {
			return List.of(
					Grandeza.de(card, SERIE_STROKE, (double) atual, "stroke", cumulativo),
					Grandeza.sem(card, SERIE_VAZAO, "bbl/min", cumulativo, "card sem constante da bomba"),
					Grandeza.sem(card, SERIE_VOLUME, "bbl", cumulativo, "card sem constante da bomba"));
		}

		return List.of(
				Grandeza.de(card, SERIE_STROKE, (double) atual, "stroke", cumulativo),
				Grandeza.de(card, SERIE_VAZAO,
						vazoes.calculateBblPerMinute(card.dispositivoId(), atual, constante), "bbl/min", cumulativo),
				// O contador ja e cumulativo: multiplicado pela constante da bomba da quanto aquela
				// bomba bombeou desde o inicio.
				Grandeza.de(card, SERIE_VOLUME, cumulativo * constante, "bbl", cumulativo));
	}

	// ============================================================ parâmetros

	private static double rangeSensorBar(Card card) {
		Parametros p = card.parametros();
		Double range = p == null ? null : p.rangeSensorBar();
		return range == null ? 0 : range;
	}

	private static double constanteBomba(Card card) {
		Parametros p = card.parametros();
		Double constante = p == null ? null : p.constanteBomba();
		return constante == null ? 0 : constante;
	}

}
