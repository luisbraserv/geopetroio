package com.geopetro.setor;

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

import com.geopetro.core.exception.ResourceNotFoundException;
import com.geopetro.regional.adapter.out.persistence.entity.RegionalEntity;
import com.geopetro.regional.adapter.out.persistence.repository.RegionalJpaRepository;
import com.geopetro.setor.adapter.in.web.request.SetorRequest;
import com.geopetro.setor.adapter.out.persistence.entity.SetorEntity;
import com.geopetro.setor.adapter.out.persistence.repository.SetorJpaRepository;
import com.geopetro.setor.application.service.SetorService;

@ExtendWith(MockitoExtension.class)
class SetorServiceTest {

	@Mock
	private SetorJpaRepository repository;

	@Mock
	private RegionalJpaRepository regionalRepository;

	private SetorService service;

	@BeforeEach
	void setUp() {
		service = new SetorService(repository, regionalRepository);
	}

	@Test
	void deveListarTodosOsSetores() {
		when(repository.findAll()).thenReturn(List.of(setor(1L, "TI"), setor(2L, "Operações")));

		List<SetorEntity> resultado = service.listar(null);

		assertThat(resultado).hasSize(2);
	}

	@Test
	void deveListarSetoresPorRegional() {
		when(repository.findByRegionalIdOrderByNomeAsc(10L)).thenReturn(List.of(setor(1L, "TI")));

		List<SetorEntity> resultado = service.listar(10L);

		assertThat(resultado).hasSize(1);
		verify(repository).findByRegionalIdOrderByNomeAsc(10L);
	}

	@Test
	void deveBuscarSetorExistente() {
		when(repository.findById(1L)).thenReturn(Optional.of(setor(1L, "TI")));

		SetorEntity resultado = service.buscar(1L);

		assertThat(resultado.getNome()).isEqualTo("TI");
	}

	@Test
	void deveLancarExcecaoAoBuscarSetorInexistente() {
		when(repository.findById(99L)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.buscar(99L))
				.isInstanceOf(ResourceNotFoundException.class)
				.hasMessageContaining("Setor nao encontrado");
	}

	@Test
	void deveCriarSetor() {
		RegionalEntity regional = regional(10L, "Norte");
		when(regionalRepository.findById(10L)).thenReturn(Optional.of(regional));
		when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		SetorRequest request = new SetorRequest("Operações", "CC-001", 10L);
		SetorEntity resultado = service.criar(request);

		assertThat(resultado.getNome()).isEqualTo("Operações");
		assertThat(resultado.getRegional().getId()).isEqualTo(10L);
	}

	@Test
	void deveLancarExcecaoAoCriarSetorComRegionalInexistente() {
		when(regionalRepository.findById(99L)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.criar(new SetorRequest("Operações", null, 99L)))
				.isInstanceOf(ResourceNotFoundException.class)
				.hasMessageContaining("Regional nao encontrada");
	}

	@Test
	void deveAtualizarSetor() {
		SetorEntity existente = setor(1L, "TI");
		RegionalEntity regional = regional(10L, "Norte");
		when(repository.findById(1L)).thenReturn(Optional.of(existente));
		when(regionalRepository.findById(10L)).thenReturn(Optional.of(regional));
		when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		SetorEntity resultado = service.atualizar(1L, new SetorRequest("TI Atualizado", null, 10L));

		assertThat(resultado.getNome()).isEqualTo("TI Atualizado");
	}

	@Test
	void deveExcluirSetor() {
		SetorEntity existente = setor(1L, "TI");
		when(repository.findById(1L)).thenReturn(Optional.of(existente));

		service.excluir(1L);

		verify(repository).delete(existente);
	}

	private SetorEntity setor(Long id, String nome) {
		SetorEntity s = new SetorEntity();
		s.setId(id);
		s.setNome(nome);
		return s;
	}

	private RegionalEntity regional(Long id, String nome) {
		RegionalEntity r = new RegionalEntity();
		r.setId(id);
		r.setNome(nome);
		return r;
	}
}
