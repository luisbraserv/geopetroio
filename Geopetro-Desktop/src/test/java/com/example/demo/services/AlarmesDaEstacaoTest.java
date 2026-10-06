package com.example.demo.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.example.demo.services.AlarmesDaEstacao.AlarmeLocal;

/**
 * A configuracao de alarme desta estacao — {@code specs/SDD/negocio/requisitos/configuracao-da-estacao.md §3}.
 *
 * <p>O que importa aqui e que ela <b>sobreviva</b>: a sonda pode ficar sem internet por dias, e o
 * alarme local e a unica coisa que chama quem esta ao lado do equipamento.
 */
class AlarmesDaEstacaoTest {

	@TempDir
	Path dir;

	private Path arquivo;
	private AlarmesDaEstacao alarmes;

	@BeforeEach
	void setup() {
		arquivo = dir.resolve("alarmes-locais.json");
		alarmes = new AlarmesDaEstacao(arquivo);
	}

	@Test
	void grandezaSemConfiguracaoDevolveNulo() {
		assertNull(alarmes.para("PRESSAO_01", null));
		assertTrue(alarmes.vigiadas().isEmpty());
	}

	@Test
	@DisplayName("a faixa sobrevive ao reinicio da estacao")
	void aFaixaSobreviveAoReinicio() {
		alarmes.gravar(new AlarmeLocal("PRESSAO_01", null, 10.0, 120.0, true));

		var reiniciada = new AlarmesDaEstacao(arquivo);
		AlarmeLocal lido = reiniciada.para("PRESSAO_01", null);

		assertNotNull(lido);
		assertEquals(10.0, lido.minimo());
		assertEquals(120.0, lido.maximo());
		assertTrue(lido.ativo());
	}

	/**
	 * ⚠️ Desligar guarda a faixa; apagar e outra coisa.
	 *
	 * <p>Quem desliga o alarme para uma manobra especifica precisa encontrar os numeros onde deixou
	 * quando religar — redigitar a faixa a cada manobra e o caminho para ninguem mais religar.
	 */
	@Test
	void desligarNaoPerdeAFaixa() {
		alarmes.gravar(new AlarmeLocal("PRESSAO_01", null, null, 120.0, true));
		alarmes.gravar(new AlarmeLocal("PRESSAO_01", null, null, 120.0, false));

		AlarmeLocal desligado = alarmes.para("PRESSAO_01", null);
		assertEquals(120.0, desligado.maximo(), "a faixa ficou guardada");
		assertFalse(desligado.ativo());
		assertTrue(alarmes.vigiadas().isEmpty(), "mas nao vigia nada enquanto estiver desligado");
	}

	/** Apagar e para quem nao quer mais o alarme ali — e ai a faixa vai junto. */
	@Test
	void removerApagaAFaixa() {
		alarmes.gravar(new AlarmeLocal("PRESSAO_01", null, null, 120.0, true));
		alarmes.remover("PRESSAO_01", null);

		assertNull(alarmes.para("PRESSAO_01", null));
		assertNull(new AlarmesDaEstacao(arquivo).para("PRESSAO_01", null), "e some do disco tambem");
	}

	/**
	 * ⚠️ Ativo sem limiar nenhum nao vigia: e o engano de marcar o sininho e sair sem digitar
	 * numero. Contar como vigilancia deixaria o sininho aceso prometendo o que nao cumpre.
	 */
	@Test
	void ativoSemLimiarNaoEntraNasVigiadas() {
		alarmes.gravar(new AlarmeLocal("PRESSAO_01", null, null, null, true));

		assertNotNull(alarmes.para("PRESSAO_01", null), "a configuracao existe");
		assertTrue(alarmes.vigiadas().isEmpty(), "mas nao vigia coisa alguma");
	}

	/**
	 * ⚠️ Sem faixa, o alarme nasce <b>desligado</b> — e nao ligado sem vigiar nada.
	 *
	 * <p>A janela do sininho garante isto de duas formas: a caixa "Alarme ligado" fica indisponivel
	 * enquanto nao houver limiar, e a gravacao forca {@code ativo=false} se os dois campos vierem
	 * vazios. Este teste fixa a segunda, que e a que protege o disco de um estado que RN-108 nao
	 * admite — inclusive se a UI mudar.
	 */
	@Test
	@DisplayName("gravar sem limiar nenhum guarda o alarme desligado")
	void semLimiarOAlarmeFicaDesligado() {
		alarmes.gravar(new AlarmeLocal("PRESSAO_01", null, null, null, false));

		AlarmeLocal lido = alarmes.para("PRESSAO_01", null);
		assertFalse(lido.ativo());
		assertFalse(lido.vigia());
		assertTrue(alarmes.vigiadas().isEmpty());
	}

	@Test
	void umLimiarSoJaVigia() {
		alarmes.gravar(new AlarmeLocal("PRESSAO_01", null, null, 120.0, true));
		assertEquals(1, alarmes.vigiadas().size());

		alarmes.gravar(new AlarmeLocal("PESO_01", null, 2000.0, null, true));
		assertEquals(2, alarmes.vigiadas().size());
	}

	/**
	 * RN-098: as tres series de um contador compartilham o {@code dispositivoId}. Chavear so por ele
	 * faria a faixa da vazao sobrescrever a do volume acumulado.
	 */
	@Test
	void asSeriesDeUmContadorNaoSeSobrescrevem() {
		alarmes.gravar(new AlarmeLocal("CONTADOR_STROKE_01", "vazao", null, 8.0, true));
		alarmes.gravar(new AlarmeLocal("CONTADOR_STROKE_01", "volumeAcumulado", null, 500.0, true));

		assertEquals(8.0, alarmes.para("CONTADOR_STROKE_01", "vazao").maximo());
		assertEquals(500.0, alarmes.para("CONTADOR_STROKE_01", "volumeAcumulado").maximo());
		assertEquals(2, alarmes.vigiadas().size());
	}

	/** Serie vazia e serie ausente sao a mesma grandeza — card de uma grandeza so. */
	@Test
	void serieVaziaEAusenteSaoAMesmaChave() {
		alarmes.gravar(new AlarmeLocal("PRESSAO_01", "", null, 120.0, true));
		assertNotNull(alarmes.para("PRESSAO_01", null));
	}

	/**
	 * O tempo minimo nao aparece na tela, mas continua valendo — e e ele que impede o bipe por
	 * segundo na fronteira. A faixa entregue ao motor traz o par critico e os tempos padrao.
	 */
	@Test
	void aFaixaEntregueAoMotorTrazOsTemposPadrao() {
		var faixa = new AlarmeLocal("PRESSAO_01", null, 10.0, 120.0, true).comoFaixa();

		assertEquals(120.0, faixa.maximoCritico());
		assertEquals(10.0, faixa.minimoCritico());
		assertNull(faixa.maximoAtencao(), "a tela do sininho oferece um nivel so");
		assertNull(faixa.minimoAtencao());
		assertEquals(AlarmesDaEstacao.SEGUNDOS_PARA_ABRIR, faixa.segundosParaAbrir());
		assertEquals(AlarmesDaEstacao.SEGUNDOS_PARA_FECHAR, faixa.segundosParaFechar());
	}

	/**
	 * ⚠️ Arquivo truncado por queda de energia numa unidade nao pode derrubar a estacao.
	 *
	 * <p>Seguir sem alarme e com o sininho apagado e <b>visivel</b>; apitar por uma faixa que
	 * ninguem escolheu, ou parar de ler o CLP, seriam piores.
	 */
	@Test
	@DisplayName("arquivo corrompido nao derruba nada: segue sem alarme configurado")
	void arquivoCorrompidoSegueSemAlarme() throws Exception {
		Files.createDirectories(dir);
		Files.writeString(arquivo, "{ isto nao e json");

		var resiliente = new AlarmesDaEstacao(arquivo);

		assertNull(resiliente.para("PRESSAO_01", null));
		assertTrue(resiliente.vigiadas().isEmpty());
	}

	/** Gravar por cima de um arquivo ilegivel recompoe a configuracao em vez de travar nela. */
	@Test
	void gravarDepoisDeArquivoCorrompidoVolta() throws Exception {
		Files.writeString(arquivo, "{ isto nao e json");

		var resiliente = new AlarmesDaEstacao(arquivo);
		resiliente.gravar(new AlarmeLocal("PRESSAO_01", null, null, 120.0, true));

		assertEquals(120.0, new AlarmesDaEstacao(arquivo).para("PRESSAO_01", null).maximo());
	}
}
