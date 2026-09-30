package com.geopetro.core;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import com.geopetro.core.exception.BusinessException;
import com.geopetro.core.port.VinculoCadastroPort;
import com.geopetro.core.port.VinculoCadastroPort.Cadastro;
import com.geopetro.core.vinculo.GuardaDeExclusao;

/**
 * RN-063 — exclusao bloqueada por vinculo, em todos os cadastros.
 *
 * <p>Antes desta guarda, so a Regional bloqueava; Setor, Unidade/Sonda e Empresa quebravam em
 * violacao de FK e devolviam {@code 500} generico.
 */
class GuardaDeExclusaoTest {

	/** Porta de teste: responde por um cadastro e devolve a descricao combinada. */
	private static VinculoCadastroPort porta(Cadastro cadastro, String descricao) {
		return new VinculoCadastroPort() {
			@Override
			public Cadastro cadastro() {
				return cadastro;
			}

			@Override
			public Optional<String> descreverVinculo(Long id) {
				return Optional.ofNullable(descricao);
			}
		};
	}

	@Test
	@DisplayName("sem nenhuma fonte de vinculo, a exclusao passa")
	void semFontesPassa() {
		GuardaDeExclusao guarda = new GuardaDeExclusao(List.of());

		assertThatCode(() -> guarda.garantirSemVinculo(Cadastro.SETOR, 1L, "o setor"))
				.doesNotThrowAnyException();
	}

	@Test
	@DisplayName("fonte que nao encontra vinculo nao impede")
	void fonteSemVinculoNaoImpede() {
		GuardaDeExclusao guarda = new GuardaDeExclusao(List.of(porta(Cadastro.SETOR, null)));

		assertThatCode(() -> guarda.garantirSemVinculo(Cadastro.SETOR, 1L, "o setor"))
				.doesNotThrowAnyException();
	}

	@Test
	@DisplayName("recusa com 409 e diz o que impede")
	void recusaDizendoOQueImpede() {
		GuardaDeExclusao guarda = new GuardaDeExclusao(
				List.of(porta(Cadastro.SETOR, "3 unidades/sondas vinculadas")));

		assertThatThrownBy(() -> guarda.garantirSemVinculo(Cadastro.SETOR, 1L, "o setor"))
				.isInstanceOf(BusinessException.class)
				.hasMessage("Nao e possivel excluir o setor: 3 unidades/sondas vinculadas.")
				.extracting(erro -> ((BusinessException) erro).getStatus())
				.isEqualTo(HttpStatus.CONFLICT);
	}

	@Test
	@DisplayName("reune todos os impedimentos numa recusa so")
	void reuneTodosOsImpedimentos() {
		GuardaDeExclusao guarda = new GuardaDeExclusao(List.of(
				porta(Cadastro.REGIONAL, "2 setores vinculados"),
				porta(Cadastro.REGIONAL, "1 unidade/sonda vinculada")));

		assertThatThrownBy(() -> guarda.garantirSemVinculo(Cadastro.REGIONAL, 1L, "a regional"))
				.isInstanceOf(BusinessException.class)
				.hasMessage("Nao e possivel excluir a regional: "
						+ "2 setores vinculados e 1 unidade/sonda vinculada.");
	}

	@Test
	@DisplayName("uma porta so responde pelo cadastro que declarou")
	void portaNaoVazaParaOutroCadastro() {
		GuardaDeExclusao guarda = new GuardaDeExclusao(
				List.of(porta(Cadastro.EMPRESA, "1 usuario vinculado")));

		// A porta de Empresa nao pode bloquear a exclusao de um Setor.
		assertThatCode(() -> guarda.garantirSemVinculo(Cadastro.SETOR, 1L, "o setor"))
				.doesNotThrowAnyException();

		assertThatThrownBy(() -> guarda.garantirSemVinculo(Cadastro.EMPRESA, 1L, "a empresa"))
				.isInstanceOf(BusinessException.class);
	}

	@Test
	@DisplayName("tres ou mais impedimentos ficam legiveis como frase")
	void tresImpedimentosLegiveis() {
		GuardaDeExclusao guarda = new GuardaDeExclusao(List.of(
				porta(Cadastro.UNIDADE_SONDA, "2 clientes com acesso concedido"),
				porta(Cadastro.UNIDADE_SONDA, "telemetria de 01/03/2026 a 05/09/2026"),
				porta(Cadastro.UNIDADE_SONDA, "1 outro vinculo")));

		assertThatThrownBy(() -> guarda.garantirSemVinculo(Cadastro.UNIDADE_SONDA, 1L, "a unidade/sonda"))
				.hasMessageContaining("2 clientes com acesso concedido, "
						+ "telemetria de 01/03/2026 a 05/09/2026 e 1 outro vinculo");
	}

	@Test
	@DisplayName("lista nula de portas nao quebra a guarda")
	void listaNulaNaoQuebra() {
		assertThat(new GuardaDeExclusao(null)).isNotNull();
		assertThatCode(() -> new GuardaDeExclusao(null).garantirSemVinculo(Cadastro.EMPRESA, 1L, "a empresa"))
				.doesNotThrowAnyException();
	}
}
