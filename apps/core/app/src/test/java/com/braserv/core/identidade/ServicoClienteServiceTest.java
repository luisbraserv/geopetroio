package com.braserv.core.identidade;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.braserv.core.comum.exception.BusinessException;
import com.braserv.core.identidade.adapter.out.BCryptPasswordEncoderAdapter;
import com.braserv.core.identidade.servico.ClienteInicialDoBackend;
import com.braserv.core.identidade.servico.Escopo;
import com.braserv.core.identidade.servico.ServicoClienteEntity;
import com.braserv.core.identidade.servico.ServicoClienteRepository;
import com.braserv.core.identidade.servico.ServicoClienteService;

/** RN-117, D-3: credenciais dos sistemas que chamam o core. */
class ServicoClienteServiceTest {

	private final Map<String, ServicoClienteEntity> banco = new HashMap<>();
	private ServicoClienteService service;

	@BeforeEach
	void setUp() {
		ServicoClienteRepository repository = mock(ServicoClienteRepository.class);
		when(repository.save(any())).thenAnswer(i -> {
			ServicoClienteEntity e = i.getArgument(0);
			banco.put(e.getId(), e);
			return e;
		});
		when(repository.findById(anyString())).thenAnswer(i -> Optional.ofNullable(banco.get(i.<String>getArgument(0))));
		when(repository.existsById(anyString())).thenAnswer(i -> banco.containsKey(i.<String>getArgument(0)));
		service = new ServicoClienteService(repository, new BCryptPasswordEncoderAdapter());
	}

	@Test
	@DisplayName("o segredo gerado autentica, e so o hash fica gravado")
	void segredoGeradoAutentica() {
		var gerado = service.criar("almoxarifado", "Almoxarifado", Set.of(Escopo.UNIDADES_LER));

		assertThat(gerado.segredo()).hasSize(43);
		assertThat(banco.get("almoxarifado").getSegredoHash()).doesNotContain(gerado.segredo()).startsWith("$2");
		assertThat(service.autenticar("almoxarifado", gerado.segredo())).isPresent();
		assertThat(banco.get("almoxarifado").getUltimoUsoEm()).isNotNull();
	}

	@Test
	@DisplayName("segredo errado, id inexistente e cliente desativado respondem igual")
	void falhasNaoSeDistinguem() {
		var gerado = service.criar("almoxarifado", "Almoxarifado", Set.of(Escopo.UNIDADES_LER));

		assertThat(service.autenticar("almoxarifado", "errado")).isEmpty();
		assertThat(service.autenticar("nao-existe", gerado.segredo())).isEmpty();
		service.desativar("almoxarifado");
		assertThat(service.autenticar("almoxarifado", gerado.segredo())).isEmpty();
		service.ativar("almoxarifado");
		assertThat(service.autenticar("almoxarifado", gerado.segredo())).isPresent();
	}

	@Test
	@DisplayName("gerar segredo novo invalida o anterior na hora")
	void segredoNovoInvalidaOAnterior() {
		var primeiro = service.criar("almoxarifado", "Almoxarifado", Set.of(Escopo.UNIDADES_LER));
		var segundo = service.gerarNovoSegredo("almoxarifado");

		assertThat(service.autenticar("almoxarifado", primeiro.segredo())).isEmpty();
		assertThat(service.autenticar("almoxarifado", segundo.segredo())).isPresent();
	}

	@Test
	@DisplayName("nenhum cliente recebe o escopo que so o core usa para perguntar ao backend")
	void escopoDoCoreNaoEConcedivel() {
		assertThatThrownBy(() -> service.criar("intruso", "Intruso", Set.of(Escopo.UNIDADES_VINCULOS)))
				.isInstanceOf(BusinessException.class)
				.hasMessageStartingWith("Escopo nao concedivel: unidades:vinculos.");
		assertThatThrownBy(() -> service.criar("Com Espaco", "X", Set.of(Escopo.UNIDADES_LER)))
				.isInstanceOf(BusinessException.class);
		assertThat(banco).isEmpty();
	}

	@Test
	@DisplayName("primeira subida: cria o geopetro-backend com o segredo do .env, uma vez so")
	void clienteInicialDoBackend() throws Exception {
		String segredo = "s".repeat(40);
		new ClienteInicialDoBackend(service, segredo).run(null);

		assertThat(banco.get("geopetro-backend").getEscopos()).containsExactlyInAnyOrder(Escopo.ACESSO_LER, Escopo.UNIDADES_LER);
		assertThat(service.autenticar("geopetro-backend", segredo)).isPresent();

		// Depois de criado, o segredo e gerido pela tela: a variavel nao o sobrescreve.
		var trocado = service.gerarNovoSegredo("geopetro-backend");
		new ClienteInicialDoBackend(service, "t".repeat(40)).run(null);
		assertThat(service.autenticar("geopetro-backend", trocado.segredo())).isPresent();
	}

	@Test
	@DisplayName("segredo inicial curto e ignorado")
	void segredoInicialCurtoIgnorado() throws Exception {
		new ClienteInicialDoBackend(service, "curto").run(null);
		assertThat(banco).isEmpty();
	}
}
