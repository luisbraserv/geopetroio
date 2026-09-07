package com.geopetro.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
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
import com.geopetro.core.port.VinculoCadastroPort;
import com.geopetro.core.vinculo.GuardaDeExclusao;
import com.geopetro.regional.adapter.in.web.request.RegionalRequest;
import com.geopetro.regional.adapter.out.persistence.entity.RegionalEntity;
import com.geopetro.regional.adapter.out.persistence.repository.RegionalJpaRepository;
import com.geopetro.regional.application.service.RegionalService;

@ExtendWith(MockitoExtension.class)
class RegionalServiceTest {

	@Mock
	private RegionalJpaRepository repository;

	@Mock
	private VinculoCadastroPort vinculoConsulta;

	private RegionalService service;

	@BeforeEach
	void setUp() {
		service = new RegionalService(repository, new GuardaDeExclusao(List.of(vinculoConsulta)));
	}

	@Test
	void deveListarTodasAsRegionais() {
		RegionalEntity r1 = regional(1L, "Norte");
		RegionalEntity r2 = regional(2L, "Sul");
		when(repository.findAll()).thenReturn(List.of(r1, r2));

		List<RegionalEntity> resultado = service.listar();

		assertThat(resultado).hasSize(2).extracting(RegionalEntity::getNome).containsExactly("Norte", "Sul");
	}

	@Test
	void deveBuscarRegionalExistente() {
		RegionalEntity r = regional(1L, "Norte");
		when(repository.findById(1L)).thenReturn(Optional.of(r));

		RegionalEntity resultado = service.buscar(1L);

		assertThat(resultado.getNome()).isEqualTo("Norte");
	}

	@Test
	void deveLancarExcecaoAoBuscarRegionalInexistente() {
		when(repository.findById(99L)).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.buscar(99L))
				.isInstanceOf(ResourceNotFoundException.class)
				.hasMessageContaining("Regional nao encontrada");
	}

	@Test
	void deveCriarRegional() {
		RegionalRequest request = new RegionalRequest("Nordeste", "CC-001");
		RegionalEntity salva = regional(1L, "Nordeste");
		when(repository.existsByNomeIgnoreCase("Nordeste")).thenReturn(false);
		when(repository.save(any())).thenReturn(salva);

		RegionalEntity resultado = service.criar(request);

		assertThat(resultado.getNome()).isEqualTo("Nordeste");
		verify(repository).save(any());
	}

	@Test
	void deveLancarExcecaoAoCriarComNomeDuplicado() {
		when(repository.existsByNomeIgnoreCase("Norte")).thenReturn(true);

		assertThatThrownBy(() -> service.criar(new RegionalRequest("Norte", null)))
				.isInstanceOf(BusinessException.class)
				.hasMessageContaining("Ja existe uma regional com esse nome");
	}

	@Test
	void deveAtualizarRegional() {
		RegionalEntity existente = regional(1L, "Norte");
		RegionalRequest request = new RegionalRequest("Norte Atualizado", "CC-002");
		when(repository.findById(1L)).thenReturn(Optional.of(existente));
		when(repository.existsByNomeIgnoreCaseAndIdNot("Norte Atualizado", 1L)).thenReturn(false);
		when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

		RegionalEntity resultado = service.atualizar(1L, request);

		assertThat(resultado.getNome()).isEqualTo("Norte Atualizado");
	}

	@Test
	void deveLancarExcecaoAoAtualizarComNomeDuplicado() {
		when(repository.existsByNomeIgnoreCaseAndIdNot("Sul", 1L)).thenReturn(true);

		assertThatThrownBy(() -> service.atualizar(1L, new RegionalRequest("Sul", null)))
				.isInstanceOf(BusinessException.class);
	}

	@Test
	void deveExcluirRegionalSemVinculos() {
		RegionalEntity existente = regional(1L, "Norte");
		when(repository.findById(1L)).thenReturn(Optional.of(existente));
		when(vinculoConsulta.cadastro()).thenReturn(VinculoCadastroPort.Cadastro.REGIONAL);
		when(vinculoConsulta.descreverVinculo(1L)).thenReturn(java.util.Optional.empty());

		service.excluir(1L);

		verify(repository).deleteById(1L);
	}

	@Test
	void deveLancarExcecaoAoExcluirRegionalComVinculos() {
		RegionalEntity existente = regional(1L, "Norte");
		when(repository.findById(1L)).thenReturn(Optional.of(existente));
		when(vinculoConsulta.cadastro()).thenReturn(VinculoCadastroPort.Cadastro.REGIONAL);
		when(vinculoConsulta.descreverVinculo(1L)).thenReturn(java.util.Optional.of("2 setores vinculados"));

		// RN-063: a mensagem diz o que impede, nao apenas que impede.
		assertThatThrownBy(() -> service.excluir(1L))
				.isInstanceOf(BusinessException.class)
				.hasMessageContaining("2 setores vinculados");

		verify(repository, never()).deleteById(any());
	}

	private RegionalEntity regional(Long id, String nome) {
		RegionalEntity r = new RegionalEntity();
		r.setId(id);
		r.setNome(nome);
		return r;
	}
}
