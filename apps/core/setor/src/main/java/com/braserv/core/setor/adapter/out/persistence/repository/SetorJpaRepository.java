package com.braserv.core.setor.adapter.out.persistence.repository;

import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.braserv.core.setor.adapter.out.persistence.entity.SetorEntity;

public interface SetorJpaRepository extends JpaRepository<SetorEntity, Long> {

	List<SetorEntity> findByRegionalIdOrderByNomeAsc(Long regionalId);

	long countByRegionalId(Long regionalId);

	Page<SetorEntity> findByNomeContainingIgnoreCase(String nome, Pageable pageable);

	Page<SetorEntity> findByNomeContainingIgnoreCaseAndRegionalId(String nome, Long regionalId, Pageable pageable);

	Page<SetorEntity> findByRegionalId(Long regionalId, Pageable pageable);

	@Query("SELECT DISTINCT s.regional.id FROM SetorEntity s WHERE s.id IN :ids")
	java.util.Set<Long> findRegionalIdsBySetorIds(@Param("ids") java.util.Set<Long> ids);
}
