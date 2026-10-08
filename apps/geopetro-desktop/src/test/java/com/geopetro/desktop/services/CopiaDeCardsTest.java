package com.geopetro.desktop.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.geopetro.desktop.models.CardsDaUnidade;
import com.geopetro.desktop.models.CardsDaUnidade.Card;
import com.geopetro.desktop.models.CardsDaUnidade.Conexao;
import com.geopetro.desktop.models.CardsDaUnidade.Parametros;
import com.geopetro.desktop.models.CardsDaUnidade.Tipo;

/**
 * A cópia de configuração entre unidades — {@code cards-configuraveis.md §10}.
 *
 * <p>É a mitigação de "a frota nasce vazia", e o lugar onde um erro sairia caro e mudo: card copiado
 * errado lê bytes válidos e devolve número plausível.
 */
class CopiaDeCardsTest {

	private static Card card(String id, String nome, Tipo tipo, int byteInicial, boolean ativo, int ordem) {
		return new Card(id, nome, tipo, byteInicial, ativo, true, ordem, Parametros.vazio());
	}

	private static CardsDaUnidade unidade(long id, Conexao conexao, Card... cards) {
		return new CardsDaUnidade(1, id, 3, conexao, List.of(cards), "ana", null);
	}

	private static final Conexao CLP_DA_SPT144 = new Conexao("192.168.0.10", 0, 1, 1, 1000);

	private static CardsDaUnidade origemConfigurada() {
		return unidade(144, CLP_DA_SPT144,
				card("PESO_01", "Peso da Coluna", Tipo.PESO, 4, true, 0),
				card("PRESSAO_01", "Bomba de Lama", Tipo.PRESSAO, 10, true, 1),
				card("CONTADOR_STROKE_01", "Bomba 1", Tipo.CONTADOR_STROKE, 0, true, 2));
	}

	@Test
	@DisplayName("copia os cards ativos para uma unidade vazia")
	void copiaParaUnidadeVazia() {
		var rascunho = CopiaDeCards.copiar(origemConfigurada(), CardsDaUnidade.vazio(145));

		assertEquals(3, rascunho.cards().size());
		assertEquals(List.of("Peso da Coluna", "Bomba de Lama", "Bomba 1"),
				rascunho.cards().stream().map(Card::nome).toList());
		assertEquals(List.of(4, 10, 0), rascunho.cards().stream().map(Card::byteInicial).toList());
		assertEquals(List.of(Tipo.PESO, Tipo.PRESSAO, Tipo.CONTADOR_STROKE),
				rascunho.cards().stream().map(Card::tipo).toList());
	}

	@Test
	@DisplayName("o id nao viaja junto: ele pertence ao historico da unidade de origem")
	void idNaoEhCopiado() {
		var rascunho = CopiaDeCards.copiar(origemConfigurada(), CardsDaUnidade.vazio(145));

		// RN-081: quem numera e o backend, que enxerga os ids ja usados NA UNIDADE DE DESTINO.
		// Carregar "PESO_01" da origem faria duas unidades publicarem sob o mesmo dispositivoId.
		rascunho.cards().forEach(card -> assertNull(card.dispositivoId(),
				"card copiado vai sem id, para o backend numerar"));
		rascunho.cards().forEach(card -> assertTrue(card.novo()));
	}

	@Test
	@DisplayName("⚠️ o IP do CLP NAO e copiado — o resto da conexao sim")
	void ipNaoEhCopiado() {
		var rascunho = CopiaDeCards.copiar(origemConfigurada(), CardsDaUnidade.vazio(145));

		// Copiar o IP apontaria o Desktop da unidade 145 para o CLP da 144: a conexao teria
		// sucesso, os enderecos existiriam, e a 145 publicaria a leitura da 144 sob o proprio
		// nome. Nada acusaria.
		assertEquals("", rascunho.conexao().ip());

		// Rack, slot, DB e intervalo descrevem o modelo de CLP e o mapeamento: e o que se quer
		// repetir entre sondas iguais.
		assertEquals(0, rascunho.conexao().rack());
		assertEquals(1, rascunho.conexao().slot());
		assertEquals(1, rascunho.conexao().dbNumero());
		assertEquals(1000, rascunho.conexao().intervaloLeituraMs());
	}

	@Test
	@DisplayName("o IP que o destino ja tinha e preservado")
	void ipDoDestinoEhPreservado() {
		var destino = unidade(145, new Conexao("192.168.9.99", 0, 1, 1, 500));

		var rascunho = CopiaDeCards.copiar(origemConfigurada(), destino);

		assertEquals("192.168.9.99", rascunho.conexao().ip(), "o CLP do destino continua o do destino");
		assertEquals(1000, rascunho.conexao().intervaloLeituraMs(), "o resto vem da origem");
	}

	@Test
	@DisplayName("copiar sobre cards ativos e recusado: duplicaria as series sem como desfazer")
	void recusaSobreCardsAtivos() {
		var destino = unidade(145, CLP_DA_SPT144,
				card("PESO_01", "Peso", Tipo.PESO, 4, true, 0));

		var erro = assertThrows(CopiaDeCards.CopiaRecusadaException.class,
				() -> CopiaDeCards.copiar(origemConfigurada(), destino));

		assertTrue(erro.getMessage().contains("desativad"),
				"a mensagem tem de dizer a saida: desativar os atuais antes");
	}

	@Test
	@DisplayName("com apenas cards desativados, o destino aceita a copia e os antigos permanecem")
	void copiaSobreCardsDesativados() {
		var destino = unidade(145, null,
				card("PESO_01", "Peso antigo", Tipo.PESO, 4, false, 0),
				card("PRESSAO_01", "Pressao antiga", Tipo.PRESSAO, 6, false, 1));

		var rascunho = CopiaDeCards.copiar(origemConfigurada(), destino);

		// RN-091: os desativados continuam no documento — sumir com eles deixaria a serie no
		// InfluxDB sem nada que a explicasse.
		assertEquals(5, rascunho.cards().size());
		assertEquals(2, rascunho.cards().stream().filter(c -> !c.ativo()).count());
		assertEquals(3, rascunho.cards().stream().filter(Card::ativo).count());
	}

	@Test
	@DisplayName("a ordem continua depois da maior ja usada, sem colidir com card desativado")
	void ordemNaoColide() {
		var destino = unidade(145, null,
				card("PESO_01", "Peso antigo", Tipo.PESO, 4, false, 0),
				card("PRESSAO_01", "Pressao antiga", Tipo.PRESSAO, 6, false, 7));

		var rascunho = CopiaDeCards.copiar(origemConfigurada(), destino);

		// O backend recusa duas posicoes iguais na tela. Um card desativado ocupa ordem tambem.
		var ordens = rascunho.cards().stream().map(Card::ordem).toList();
		assertEquals(ordens.size(), ordens.stream().distinct().count(), "nenhuma ordem repetida");
		assertEquals(List.of(8, 9, 10), ordens.subList(2, 5), "continua a partir da maior, que era 7");
	}

	@Test
	@DisplayName("cards desativados da origem nao sao copiados")
	void naoCopiaDesativadosDaOrigem() {
		var origem = unidade(144, CLP_DA_SPT144,
				card("PESO_01", "Peso", Tipo.PESO, 4, true, 0),
				card("PRESSAO_01", "Sensor que saiu", Tipo.PRESSAO, 10, false, 1));

		var rascunho = CopiaDeCards.copiar(origem, CardsDaUnidade.vazio(145));

		assertEquals(1, rascunho.cards().size());
		assertEquals("Peso", rascunho.cards().get(0).nome());
	}

	@Test
	@DisplayName("os parametros de escala vao junto — e sao o motivo de copiar")
	void parametrosVaoJunto() {
		var tanque = new Parametros(null, null, null, null,
				CardsDaUnidade.FormaTanque.CILINDRICO_VERTICAL, 1.5, 3.0, null, null, 0.2, 2.9, null);
		var origem = unidade(144, CLP_DA_SPT144,
				new Card("NIVEL_TANQUE_01", "Tanque de Lama", Tipo.NIVEL_TANQUE, 12, true, true, 0, tanque));

		var rascunho = CopiaDeCards.copiar(origem, CardsDaUnidade.vazio(145));

		assertEquals(tanque, rascunho.cards().get(0).parametros());
	}

	@Test
	@DisplayName("origem sem card ativo nao serve de modelo")
	void origemVazia() {
		assertThrows(CopiaDeCards.CopiaRecusadaException.class,
				() -> CopiaDeCards.copiar(CardsDaUnidade.vazio(144), CardsDaUnidade.vazio(145)));
	}

	@Test
	@DisplayName("copiar de si mesma e recusado")
	void mesmaUnidade() {
		var erro = assertThrows(CopiaDeCards.CopiaRecusadaException.class,
				() -> CopiaDeCards.copiar(origemConfigurada(), CardsDaUnidade.vazio(144)));

		assertTrue(erro.getMessage().contains("mesma"));
	}

	@Test
	@DisplayName("a origem nao e alterada pela copia")
	void origemImutavel() {
		var origem = origemConfigurada();

		CopiaDeCards.copiar(origem, CardsDaUnidade.vazio(145));

		assertEquals("PESO_01", origem.cards().get(0).dispositivoId());
		assertEquals("192.168.0.10", origem.conexao().ip());
	}

	@Test
	@DisplayName("origem sem conexao gravada cai nos valores padrao, sem quebrar")
	void origemSemConexao() {
		var origem = unidade(144, null, card("PESO_01", "Peso", Tipo.PESO, 4, true, 0));

		var rascunho = CopiaDeCards.copiar(origem, CardsDaUnidade.vazio(145));

		assertNotNull(rascunho.conexao());
		assertEquals("", rascunho.conexao().ip());
		assertEquals(1000, rascunho.conexao().intervaloLeituraMs());
	}

	@Test
	@DisplayName("todo card copiado nasce ativo, mesmo com o destino cheio de desativados")
	void copiadosNascemAtivos() {
		var destino = unidade(145, null, card("PESO_01", "Peso antigo", Tipo.PESO, 4, false, 0));

		var rascunho = CopiaDeCards.copiar(origemConfigurada(), destino);

		assertFalse(rascunho.cards().get(0).ativo(), "o antigo continua desativado");
		rascunho.cards().subList(1, 4).forEach(c -> assertTrue(c.ativo(), "os copiados leem desde ja"));
	}
}
