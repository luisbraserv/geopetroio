package com.example.demo.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.example.demo.models.AppSettings;
import com.example.demo.models.CardsDaUnidade;
import com.example.demo.models.CardsDaUnidade.Card;
import com.example.demo.models.CardsDaUnidade.Parametros;
import com.example.demo.models.CardsDaUnidade.Tipo;
import com.example.demo.models.ChaveHidraulicaConfig;
import com.example.demo.models.PesoColunaConfig;
import com.example.demo.models.SensorPressaoConfig;
import com.example.demo.models.TipoMovimento;

/**
 * A calibração por {@code dispositivoId} — o que substitui os slots posicionais.
 *
 * <p>O que se quer provar é que a migração <b>não perde</b> uma calibração medida em campo, e que
 * card sem herança nasce no padrão em vez de herdar a de outro. Um card com a calibração errada
 * converte e devolve um número plausível: é o desfecho mais caro desta base.
 */
class CalibracaoDeCardsTest {

	@TempDir
	Path pasta;

	private CalibracaoDeCards store() {
		return new CalibracaoDeCards(pasta.resolve("calibracao-cards.json"));
	}

	/** As configurações desta estação como estão hoje, com os quatro canais e as três geometrias. */
	private static AppSettings legadoDaSpt144() {
		AppSettings s = new AppSettings();
		s.setSensor01(sensor(400, 1.10));
		s.setSensor02(sensor(400, 1.20));
		s.setSensor03(sensor(400, 1.30));
		s.setSensor04(sensor(250, 1.40));

		PesoColunaConfig peso = new PesoColunaConfig();
		peso.setAreaEfetivaSensorPol2(3.5);
		peso.setBracoSensorPol(12.0);
		peso.setDiametroTamborPol(11.0);
		peso.setDiametroCaboPol(1.125);
		peso.setNumeroLinhas(8);
		peso.setPesoCatarinaLbf(9500);
		peso.setFatorCalibracao(1.02);
		s.setPesoColuna(peso);

		s.setChaveTubos(chave(2.5, 1.25, 3.0, TipoMovimento.AVANCO));
		s.setChaveFlutuante(chave(4.0, 2.0, 5.0, TipoMovimento.RECUO));
		return s;
	}

	private static SensorPressaoConfig sensor(double rangeBar, double sensibilidade) {
		SensorPressaoConfig c = new SensorPressaoConfig();
		c.setRangeBar(rangeBar);
		c.setSensibilidade(sensibilidade);
		return c;
	}

	private static ChaveHidraulicaConfig chave(double pistao, double haste, double braco, TipoMovimento mov) {
		ChaveHidraulicaConfig c = new ChaveHidraulicaConfig();
		c.setDiametroPistaoIn(pistao);
		c.setDiametroHasteIn(haste);
		c.setBracoAlavancaFt(braco);
		c.setTipoMovimento(mov);
		return c;
	}

	private static Card card(String id, Tipo tipo, int byteInicial) {
		return new Card(id, id, tipo, byteInicial, true, true, 0, Parametros.vazio());
	}

	/** O mapeamento real de hoje, já com os ids que o backend gerou. */
	private static CardsDaUnidade documentoDaSpt144() {
		return new CardsDaUnidade(1, 144, 1, null, List.of(
				card("PESO_01", Tipo.PESO, 4),
				card("TORQUE_01", Tipo.TORQUE, 6),
				card("TORQUE_02", Tipo.TORQUE, 8),
				card("PRESSAO_01", Tipo.PRESSAO, 10),
				card("PRESSAO_02", Tipo.PRESSAO, 10),
				card("CONTADOR_STROKE_01", Tipo.CONTADOR_STROKE, 0)),
				"ana", null);
	}

	@Test
	@DisplayName("card sem calibracao vem no padrao, nunca nulo")
	void padraoParaDesconhecido() {
		var calibracao = store().para("TORQUE_09");

		assertNotNull(calibracao);
		assertEquals(1.0, calibracao.sensibilidade());
		assertNotNull(calibracao.peso());
		assertNotNull(calibracao.chave());
	}

	@Test
	@DisplayName("id nulo ou em branco nao quebra")
	void idAusente() {
		assertNotNull(store().para(null));
		assertNotNull(store().para("  "));
	}

	@Test
	@DisplayName("a migracao leva a geometria do peso para o card que le o endereco do peso")
	void migraPeso() {
		var store = store();

		assertEquals(5, store.migrar(documentoDaSpt144(), legadoDaSpt144()),
				"peso, dois torques e duas pressoes herdam; o contador de stroke nao tem o que herdar");

		var peso = store.para("PESO_01");
		assertEquals(3.5, peso.peso().getAreaEfetivaSensorPol2());
		assertEquals(8, peso.peso().getNumeroLinhas());
		assertEquals(1.02, peso.peso().getFatorCalibracao());
		assertEquals(1.10, peso.sensibilidade(), "a sensibilidade vem do sensor01, do mesmo canal");
	}

	@Test
	@DisplayName("os dois torques nao trocam de calibracao entre si")
	void migraTorquesSemTrocar() {
		var store = store();
		store.migrar(documentoDaSpt144(), legadoDaSpt144());

		// DBW6 era a chave de tubos; DBW8 a flutuante. Trocar as duas daria torque plausivel e
		// errado nas duas chaves ao mesmo tempo.
		var tubos = store.para("TORQUE_01");
		assertEquals(2.5, tubos.chave().getDiametroPistaoIn());
		assertEquals(TipoMovimento.AVANCO, tubos.chave().getTipoMovimento());
		assertEquals(1.20, tubos.sensibilidade());

		var flutuante = store.para("TORQUE_02");
		assertEquals(4.0, flutuante.chave().getDiametroPistaoIn());
		assertEquals(TipoMovimento.RECUO, flutuante.chave().getTipoMovimento());
		assertEquals(1.30, flutuante.sensibilidade());
	}

	@Test
	@DisplayName("a heranca e pelo ENDERECO, nao pela ordem dos cards no documento")
	void herancaPorEndereco() {
		// Mesma unidade configurada numa ordem diferente: a flutuante aparece antes da de tubos.
		var forade = new CardsDaUnidade(1, 144, 1, null, List.of(
				card("TORQUE_01", Tipo.TORQUE, 8),
				card("TORQUE_02", Tipo.TORQUE, 6)),
				"ana", null);
		var store = store();

		store.migrar(forade, legadoDaSpt144());

		// Ligar por ordem daria a de tubos ao card que le DBW8. Ligar por endereco acerta.
		assertEquals(4.0, store.para("TORQUE_01").chave().getDiametroPistaoIn(), "DBW8 e a flutuante");
		assertEquals(2.5, store.para("TORQUE_02").chave().getDiametroPistaoIn(), "DBW6 e a de tubos");
	}

	@Test
	@DisplayName("card em endereco novo nao herda calibracao de ninguem")
	void enderecoNovoNaoHerda() {
		var novo = new CardsDaUnidade(1, 144, 1, null, List.of(
				card("TORQUE_03", Tipo.TORQUE, 20)), "ana", null);
		var store = store();

		assertEquals(0, store.migrar(novo, legadoDaSpt144()));

		// Herdar a da flutuante "porque sobrou" era exatamente o defeito da ligacao posicional.
		assertEquals(0.0, store.para("TORQUE_03").chave().getDiametroPistaoIn());
		assertEquals(1.0, store.para("TORQUE_03").sensibilidade());
	}

	@Test
	@DisplayName("os dois cards de pressao do mesmo endereco herdam a mesma sensibilidade")
	void pressoesNoMesmoEndereco() {
		var store = store();
		store.migrar(documentoDaSpt144(), legadoDaSpt144());

		assertEquals(1.40, store.para("PRESSAO_01").sensibilidade());
		assertEquals(1.40, store.para("PRESSAO_02").sensibilidade());
	}

	@Test
	@DisplayName("migrar duas vezes nao sobrescreve o que ja foi ajustado depois")
	void migracaoNaoRepete() {
		var store = store();
		store.migrar(documentoDaSpt144(), legadoDaSpt144());

		// Alguem recalibra o card pela tela, depois da migracao.
		store.gravar("TORQUE_01", store.para("TORQUE_01").comSensibilidade(2.5));

		assertEquals(0, store.migrar(documentoDaSpt144(), legadoDaSpt144()),
				"nada mais a migrar: todos ja tem entrada propria");
		assertEquals(2.5, store.para("TORQUE_01").sensibilidade(), "o ajuste manual sobrevive");
	}

	@Test
	@DisplayName("o que foi gravado sobrevive a um reinicio")
	void persisteEmDisco() {
		var store = store();
		store.gravar("PESO_01", CalibracaoDeCards.Calibracao.padrao().comSensibilidade(1.75));

		// Outra instancia, como depois de fechar e reabrir o app.
		assertEquals(1.75, store().para("PESO_01").sensibilidade());
	}

	@Test
	@DisplayName("a migracao nao mexe no app-settings.json — o original fica para conferencia")
	void naoApagaOLegado() {
		AppSettings legado = legadoDaSpt144();

		store().migrar(documentoDaSpt144(), legado);

		// Uma calibracao medida em campo nao se descarta por conveniencia de codigo: se a migracao
		// errar, o valor original precisa continuar disponivel.
		assertEquals(3.5, legado.getPesoColuna().getAreaEfetivaSensorPol2());
		assertEquals(2.5, legado.getChaveTubos().getDiametroPistaoIn());
		assertEquals(1.40, legado.getSensor04().getSensibilidade());
	}

	@Test
	@DisplayName("arquivo corrompido nao derruba o app: volta ao padrao")
	void arquivoCorrompido() throws Exception {
		Path arquivo = pasta.resolve("calibracao-cards.json");
		Files.writeString(arquivo, "{isto nao e json");

		var calibracao = new CalibracaoDeCards(arquivo).para("PESO_01");

		// Padrao e visivel na tela como "ainda nao calibrado" — melhor que converter com valor
		// duvidoso, que sairia plausivel.
		assertEquals(1.0, calibracao.sensibilidade());
	}

	@Test
	@DisplayName("documento vazio nao migra nada")
	void documentoVazio() {
		assertEquals(0, store().migrar(CardsDaUnidade.vazio(144), legadoDaSpt144()));
		assertEquals(0, store().migrar(null, legadoDaSpt144()));
		assertEquals(0, store().migrar(documentoDaSpt144(), null));
	}

	@Test
	@DisplayName("card desativado tambem migra: reativar nao pode perder a calibracao")
	void cardDesativadoMigra() {
		var comDesativado = new CardsDaUnidade(1, 144, 1, null, List.of(
				new Card("TORQUE_01", "Tubos", Tipo.TORQUE, 6, false, true, 0, Parametros.vazio())),
				"ana", null);
		var store = store();

		assertEquals(1, store.migrar(comDesativado, legadoDaSpt144()));
		assertTrue(store.para("TORQUE_01").chave().getDiametroPistaoIn() > 0);
	}
}
