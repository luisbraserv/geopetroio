package com.braserv.core.unidade.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.braserv.core.unidade.domain.StatusUnidade;

import com.braserv.core.unidade.adapter.out.persistence.entity.UnidadeEntity;

public interface UnidadeJpaRepository extends JpaRepository<UnidadeEntity, Long> {

	/** Busca por nome ou apelido, com filtro opcional de status. Parametro nulo nao filtra. */
	@Query("""
			select u from UnidadeEntity u
			where (:status is null or u.status = :status)
			  and (:termo is null
			       or lower(u.nome) like lower(concat('%', :termo, '%'))
			       or lower(u.apelido) like lower(concat('%', :termo, '%')))
			""")
	Page<UnidadeEntity> buscar(@Param("termo") String termo, @Param("status") StatusUnidade status,
			Pageable pageable);

	List<UnidadeEntity> findBySetorIdOrderByNomeAsc(Long setorId);

	List<UnidadeEntity> findBySetorIdInOrderByNomeAsc(List<Long> setorIds);

	List<UnidadeEntity> findBySetor_RegionalIdOrderByNomeAsc(Long regionalId);

	long countBySetor_RegionalId(Long regionalId);

	long countBySetorId(Long setorId);

	Optional<UnidadeEntity> findByNome(String nome);

	boolean existsByNome(String nome);

	boolean existsByNomeAndIdNot(String nome, Long id);
}
