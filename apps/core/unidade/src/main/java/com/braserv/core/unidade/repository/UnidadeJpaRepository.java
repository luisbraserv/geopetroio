package com.braserv.core.unidade.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import com.braserv.core.unidade.adapter.out.persistence.entity.UnidadeEntity;

public interface UnidadeJpaRepository extends JpaRepository<UnidadeEntity, Long> {

	Page<UnidadeEntity> findByNomeContainingIgnoreCaseOrApelidoContainingIgnoreCase(String nome, String apelido,
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
