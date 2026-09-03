package com.geopetro.unidadesonda;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import com.geopetro.core.exception.BusinessException;
import com.geopetro.core.exception.ResourceNotFoundException;
import com.geopetro.regional.adapter.out.persistence.entity.RegionalEntity;
import com.geopetro.setor.adapter.out.persistence.entity.SetorEntity;
import com.geopetro.setor.adapter.out.persistence.repository.SetorJpaRepository;
import com.geopetro.unidadesonda.adapter.in.web.request.UnidadeSondaRequest;
import com.geopetro.unidadesonda.adapter.out.persistence.entity.UnidadeSondaEntity;
import com.geopetro.unidadesonda.application.service.UnidadeSondaService;
import com.geopetro.unidadesonda.repository.UnidadeSondaJpaRepository;

@ExtendWith(MockitoExtension.class)
class UnidadeSondaServiceTest {

	@Mock
	private UnidadeSondaJpaRepository repository;

	@Mock
	private SetorJpaRepository setorRepository;

	private UnidadeSondaService service;

	@BeforeEach
	void setUp() {
		service = new UnidadeSondaService(repository, setorRepository);
	}

	@Test
	void deveListarTodasAsUnidades() {
		when(repository.findAll()).thenReturn(List.of(unidade(1L, "Sonda-01"), unidade(2L, "Sonda-02")));

		List<UnidadeSondaEntity> resultado = service.listar(null, null, null);

		assertThat(resultado).hasSize(2);
	}

	@Test
	void deveListarUnidadesPorSetor() {
		when(repository.findBySetorIdOrderByNomeAsc(5L)).thenReturn(List.of(unidade(1L, "Sonda-01")));

		List<UnidadeSondaEntity> resultado = service.listar(5L, null, null);

		verify(repository).findBySetorIdOrderByNomeAsc(5L);
		assertThat(resultado).hasSize(1);
	}

	@Test
	void deveListarUnidadesPorRegional() {
		when(repository.findBySetor_RegionalIdOrderByNomeAsc(10L)).thenReturn(List.of(unidade(1L, "Sonda-01")));

		List<UnidadeSondaEntity> resultado = service.listar(null, null, 10L);

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

		UnidadeSondaEntity resultado = service.buscar(1L);

		assertThat(resultado.getNome()).isEqualTo("Sonda-01");
	}

	@Test
	void deveLancarExcecaoAoBuscarUnidadeInexistente() {
		when(repository.findById(99L)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.buscar(99L))
				.isInstanceOf(ResourceNotFoundException.class)
				.hasMessageContaining("Unidade/Sonda nao encontrada");
	}

	@Test
	void deveCriarUnidade() {
		SetorEntity setor = setor(5L, "Operações");
		when(repository.existsByNome("Sonda-01")).thenReturn(false);
		when(setorRepository.findById(5L)).thenReturn(Optional.of(setor));
		when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		UnidadeSondaEntity resultado = service.criar(new UnidadeSondaRequest("Sonda-01", "S01", 5L));

		assertThat(resultado.getNome()).isEqualTo("Sonda-01");
		assertThat(resultado.getSetor().getId()).isEqualTo(5L);
	}

	@Test
	void deveLancarExcecaoAoCriarComNomeDuplicado() {
		when(repository.existsByNome("Sonda-01")).thenReturn(true);

		assertThatThrownBy(() -> service.criar(new UnidadeSondaRequest("Sonda-01", null, 5L)))
				.isInstanceOf(BusinessException.class)
				.hasMessageContaining("Ja existe uma unidade/sonda com esse nome");
	}

	@Test
	void deveLancarExcecaoAoCriarComSetorInexistente() {
		when(repository.existsByNome("Sonda-01")).thenReturn(false);
		when(setorRepository.findById(99L)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.criar(new UnidadeSondaRequest("Sonda-01", null, 99L)))
				.isInstanceOf(ResourceNotFoundException.class)
				.hasMessageContaining("Setor nao encontrado");
	}

	@Test
	void deveAtualizarUnidade() {
		UnidadeSondaEntity existente = unidade(1L, "Sonda-01");
		SetorEntity setor = setor(5L, "Operações");
		when(repository.existsByNomeAndIdNot("Sonda-01-v2", 1L)).thenReturn(false);
		when(repository.findById(1L)).thenReturn(Optional.of(existente));
		when(setorRepository.findById(5L)).thenReturn(Optional.of(setor));
		when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		UnidadeSondaEntity resultado = service.atualizar(1L, new UnidadeSondaRequest("Sonda-01-v2", "S1", 5L));

		assertThat(resultado.getNome()).isEqualTo("Sonda-01-v2");
	}

	@Test
	void deveLancarExcecaoAoAtualizarComNomeDuplicado() {
		when(repository.existsByNomeAndIdNot("Sonda-02", 1L)).thenReturn(true);

		assertThatThrownBy(() -> service.atualizar(1L, new UnidadeSondaRequest("Sonda-02", null, 5L)))
				.isInstanceOf(BusinessException.class);
	}

	@Test
	void deveExcluirUnidade() {
		UnidadeSondaEntity existente = unidade(1L, "Sonda-01");
		when(repository.findById(1L)).thenReturn(Optional.of(existente));

		service.excluir(1L);

		verify(repository).delete(existente);
	}

	private UnidadeSondaEntity unidade(Long id, String nome) {
		UnidadeSondaEntity u = new UnidadeSondaEntity();
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
