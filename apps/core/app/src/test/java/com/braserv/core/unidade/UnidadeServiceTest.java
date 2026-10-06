package com.braserv.core.unidade;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.braserv.core.comum.port.VinculoCadastroPort;
import com.braserv.core.unidade.domain.StatusUnidade;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import com.braserv.core.comum.exception.BusinessException;
import com.braserv.core.comum.exception.ResourceNotFoundException;
import com.braserv.core.regional.adapter.out.persistence.entity.RegionalEntity;
import com.braserv.core.setor.adapter.out.persistence.entity.SetorEntity;
import com.braserv.core.setor.adapter.out.persistence.repository.SetorJpaRepository;
import com.braserv.core.unidade.adapter.in.web.request.UnidadeRequest;
import com.braserv.core.unidade.adapter.out.persistence.entity.UnidadeEntity;
import com.braserv.core.comum.vinculo.GuardaDeExclusao;
import com.braserv.core.unidade.application.service.UnidadeService;
import com.braserv.core.unidade.domain.TipoUnidade;
import com.braserv.core.unidade.repository.UnidadeJpaRepository;

@ExtendWith(MockitoExtension.class)
class UnidadeServiceTest {

	@Mock
	private UnidadeJpaRepository repository;

	@Mock
	private SetorJpaRepository setorRepository;

	private UnidadeService service;

	@BeforeEach
	void setUp() {
		service = new UnidadeService(repository, setorRepository, new GuardaDeExclusao(java.util.List.of()));
	}

	@Test
	void deveListarTodasAsUnidades() {
		when(repository.findAll()).thenReturn(List.of(unidade(1L, "Sonda-01"), unidade(2L, "Sonda-02")));

		List<UnidadeEntity> resultado = service.listar(null, null, null);

		assertThat(resultado).hasSize(2);
	}

	@Test
	void deveListarUnidadesPorSetor() {
		when(repository.findBySetorIdOrderByNomeAsc(5L)).thenReturn(List.of(unidade(1L, "Sonda-01")));

		List<UnidadeEntity> resultado = service.listar(5L, null, null);

		verify(repository).findBySetorIdOrderByNomeAsc(5L);
		assertThat(resultado).hasSize(1);
	}

	@Test
	void deveListarUnidadesPorRegional() {
		when(repository.findBySetor_RegionalIdOrderByNomeAsc(10L)).thenReturn(List.of(unidade(1L, "Sonda-01")));

		List<UnidadeEntity> resultado = service.listar(null, null, 10L);

		verify(repository).findBySetor_RegionalIdOrderByNomeAsc(10L);
		assertThat(resultado).hasSize(1);
	}

	@Test
	void deveListarUnidadesPorSetorIds() {
		List<Long> setorIds = List.of(1L, 2L);
		when(repository.findBySetorIdInOrderByNomeAsc(setorIds)).thenReturn(List.of(unidade(1L, "Sonda-01")));

		service.listar(null, setorIds, null);

		verify(repository).findBySetorIdInOrderByNomeAsc(setorIds);
	}

	@Test
	void deveBuscarUnidadeExistente() {
		when(repository.findById(1L)).thenReturn(Optional.of(unidade(1L, "Sonda-01")));

		UnidadeEntity resultado = service.buscar(1L);

		assertThat(resultado.getNome()).isEqualTo("Sonda-01");
	}

	@Test
	void deveLancarExcecaoAoBuscarUnidadeInexistente() {
		when(repository.findById(99L)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.buscar(99L))
				.isInstanceOf(ResourceNotFoundException.class)
				.hasMessageContaining("Unidade nao encontrada");
	}

	@Test
	void deveCriarUnidade() {
		SetorEntity setor = setor(5L, "Operações");
		when(repository.existsByNome("Sonda-01")).thenReturn(false);
		when(setorRepository.findById(5L)).thenReturn(Optional.of(setor));
		when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		UnidadeEntity resultado = service.criar(new UnidadeRequest("Sonda-01", "S01", TipoUnidade.SONDA, 5L));

		assertThat(resultado.getNome()).isEqualTo("Sonda-01");
		assertThat(resultado.getSetor().getId()).isEqualTo(5L);
		assertThat(resultado.getTipo()).isEqualTo(TipoUnidade.SONDA);
	}

	/** RN-065 — o cadastro abriga equipamentos que nao sao sonda de perfuracao. */
	@Test
	void deveGravarTipoDiferenteDeSonda() {
		SetorEntity setor = setor(5L, "Operações");
		when(repository.existsByNome("UCAQ-03")).thenReturn(false);
		when(setorRepository.findById(5L)).thenReturn(Optional.of(setor));
		when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		UnidadeEntity resultado = service
				.criar(new UnidadeRequest("UCAQ-03", null, TipoUnidade.UCAQ, 5L));

		assertThat(resultado.getTipo()).isEqualTo(TipoUnidade.UCAQ);
	}

	/** O tipo e editavel: uma classificacao errada no backfill da migration precisa ter conserto. */
	@Test
	void deveAtualizarOTipoDeUmaUnidadeExistente() {
		UnidadeEntity existente = unidade(1L, "Bombeio-07");
		existente.setTipo(TipoUnidade.SONDA);
		SetorEntity setor = setor(5L, "Operações");
		when(repository.existsByNomeAndIdNot("Bombeio-07", 1L)).thenReturn(false);
		when(repository.findById(1L)).thenReturn(Optional.of(existente));
		when(setorRepository.findById(5L)).thenReturn(Optional.of(setor));
		when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		UnidadeEntity resultado = service.atualizar(1L,
				new UnidadeRequest("Bombeio-07", null, TipoUnidade.UNIDADE_BOMBEIO, 5L));

		assertThat(resultado.getTipo()).isEqualTo(TipoUnidade.UNIDADE_BOMBEIO);
	}

	@Test
	void deveLancarExcecaoAoCriarComNomeDuplicado() {
		when(repository.existsByNome("Sonda-01")).thenReturn(true);

		assertThatThrownBy(() -> service.criar(new UnidadeRequest("Sonda-01", null, TipoUnidade.SONDA, 5L)))
				.isInstanceOf(BusinessException.class)
				.hasMessageContaining("Ja existe uma unidade com esse nome");
	}

	@Test
	void deveLancarExcecaoAoCriarComSetorInexistente() {
		when(repository.existsByNome("Sonda-01")).thenReturn(false);
		when(setorRepository.findById(99L)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.criar(new UnidadeRequest("Sonda-01", null, TipoUnidade.SONDA, 99L)))
				.isInstanceOf(ResourceNotFoundException.class)
				.hasMessageContaining("Setor nao encontrado");
	}

	@Test
	void deveAtualizarUnidade() {
		UnidadeEntity existente = unidade(1L, "Sonda-01");
		SetorEntity setor = setor(5L, "Operações");
		when(repository.existsByNomeAndIdNot("Sonda-01-v2", 1L)).thenReturn(false);
		when(repository.findById(1L)).thenReturn(Optional.of(existente));
		when(setorRepository.findById(5L)).thenReturn(Optional.of(setor));
		when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		UnidadeEntity resultado = service.atualizar(1L, new UnidadeRequest("Sonda-01-v2", "S1", TipoUnidade.SONDA, 5L));

		assertThat(resultado.getNome()).isEqualTo("Sonda-01-v2");
	}

	@Test
	void deveLancarExcecaoAoAtualizarComNomeDuplicado() {
		when(repository.existsByNomeAndIdNot("Sonda-02", 1L)).thenReturn(true);

		assertThatThrownBy(() -> service.atualizar(1L, new UnidadeRequest("Sonda-02", null, TipoUnidade.SONDA, 5L)))
				.isInstanceOf(BusinessException.class);
	}

	@Test
	void deveExcluirUnidade() {
		UnidadeEntity existente = unidade(1L, "Sonda-01");
		when(repository.findById(1L)).thenReturn(Optional.of(existente));

		service.excluir(1L);

		verify(repository).delete(existente);
	}

	/** RN-116: a recusa lista tudo o que impede e orienta a inativar. */
	@Test
	void exclusaoRecusadaOrientaAInativar() {
		VinculoCadastroPort concessoes = porta(Optional.of("1 cliente com acesso concedido"));
		VinculoCadastroPort backend = porta(Optional.of("limites de alarme configurados"));
		service = new UnidadeService(repository, setorRepository, new GuardaDeExclusao(List.of(concessoes, backend)));
		UnidadeEntity existente = unidade(1L, "SPT-144");
		when(repository.findById(1L)).thenReturn(Optional.of(existente));

		assertThatThrownBy(() -> service.excluir(1L))
				.isInstanceOf(BusinessException.class)
				.hasMessage("Nao e possivel excluir a unidade SPT-144: 1 cliente com acesso concedido e "
						+ "limites de alarme configurados. Use inativar.");
		verify(repository, never()).delete(any());
	}

	@Test
	void inativarEReativarSoTrocamOStatus() {
		UnidadeEntity existente = unidade(1L, "SPT-144");
		when(repository.findById(1L)).thenReturn(Optional.of(existente));

		service.inativar(1L);
		assertThat(existente.getStatus()).isEqualTo(StatusUnidade.INATIVA);
		service.inativar(1L);
		assertThat(existente.getStatus()).as("idempotente").isEqualTo(StatusUnidade.INATIVA);

		service.ativar(1L);
		assertThat(existente.getStatus()).isEqualTo(StatusUnidade.ATIVA);
		verify(repository, never()).delete(any());
	}

	@Test
	void unidadeNasceAtiva() {
		assertThat(new UnidadeEntity().getStatus()).isEqualTo(StatusUnidade.ATIVA);
	}

	@Test
	void listarFiltraPorStatus() {
		UnidadeEntity ativa = unidade(1L, "SPT-144");
		UnidadeEntity inativa = unidade(2L, "SPT-145");
		inativa.setStatus(StatusUnidade.INATIVA);
		when(repository.findAll()).thenReturn(List.of(ativa, inativa));

		assertThat(service.listar(null, null, null, StatusUnidade.ATIVA)).containsExactly(ativa);
		assertThat(service.listar(null, null, null, StatusUnidade.INATIVA)).containsExactly(inativa);
		assertThat(service.listar(null, null, null, null)).containsExactly(ativa, inativa);
	}

	private static VinculoCadastroPort porta(Optional<String> vinculo) {
		return new VinculoCadastroPort() {
			@Override
			public Cadastro cadastro() {
				return Cadastro.UNIDADE;
			}

			@Override
			public Optional<String> descreverVinculo(Long id) {
				return vinculo;
			}
		};
	}

	private UnidadeEntity unidade(Long id, String nome) {
		UnidadeEntity u = new UnidadeEntity();
		u.setId(id);
		u.setNome(nome);
		return u;
	}

	private SetorEntity setor(Long id, String nome) {
		SetorEntity s = new SetorEntity();
		s.setId(id);
		s.setNome(nome);
		RegionalEntity regional = new RegionalEntity();
		regional.setId(100L);
		regional.setNome("Regional Test");
		s.setRegional(regional);
		return s;
	}
}
