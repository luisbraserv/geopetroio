package com.geopetro.desktop.historico;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;


/**
 * A poda do histórico local.
 *
 * <p>⚠️ Ela apaga dado de medição: o que se prova aqui é que só apaga o que passou do prazo, que dá
 * para desligar, e que uma falha dela não derruba a leitura do CLP — que é o que a sonda existe para
 * fazer.
 */
class PodaDeLeiturasLocaisTest {

	@Test
	@DisplayName("apaga o que passou do prazo, e so isso")
	void apagaOQuePassou() {
		var repository = mock(LeituraLocalRepository.class);
		when(repository.countByTimestampLessThan(any())).thenReturn(1_000L);
		when(repository.apagarAnterioresA(any())).thenReturn(1_000);

		new PodaDeLeiturasLocais(repository, 180).podar();

		ArgumentCaptor<LocalDateTime> limite = ArgumentCaptor.forClass(LocalDateTime.class);
		verify(repository).apagarAnterioresA(limite.capture());

		// O limite tem de estar perto de 180 dias atras; a margem cobre o relogio andando no teste.
		LocalDateTime esperado = LocalDateTime.now().minusDays(180);
		org.junit.jupiter.api.Assertions.assertTrue(
				java.time.Duration.between(limite.getValue(), esperado).abs().toMinutes() < 1,
				"limite deveria ser ~180 dias atras, veio " + limite.getValue());
	}

	@Test
	@DisplayName("sem nada a apagar, nao chama o delete")
	void nadaAApagar() {
		var repository = mock(LeituraLocalRepository.class);
		when(repository.countByTimestampLessThan(any())).thenReturn(0L);

		new PodaDeLeiturasLocais(repository, 180).podar();

		// Um DELETE por hora numa tabela grande custa, mesmo apagando zero linhas.
		verify(repository, never()).apagarAnterioresA(any());
	}

	@Test
	@DisplayName("retencao zero desliga a poda: a tabela volta a crescer sem limite")
	void desligada() {
		var repository = mock(LeituraLocalRepository.class);

		new PodaDeLeiturasLocais(repository, 0).podar();

		verify(repository, never()).countByTimestampLessThan(any());
		verify(repository, never()).apagarAnterioresA(any());
	}

	@Test
	@DisplayName("falha da poda nao propaga: a sonda continua medindo")
	void falhaNaoPropaga() {
		var repository = mock(LeituraLocalRepository.class);
		when(repository.countByTimestampLessThan(any())).thenThrow(new RuntimeException("banco travado"));

		// O agendador roda no mesmo processo que le o CLP. Deixar a excecao subir mataria a tarefa
		// agendada, e a poda pararia em silencio ate o proximo reinicio.
		new PodaDeLeiturasLocais(repository, 180).podar();
	}
}
