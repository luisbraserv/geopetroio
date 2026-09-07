package com.geopetro.regional.adapter.out.persistence.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import com.geopetro.regional.adapter.out.persistence.entity.RegionalEntity;

public interface RegionalJpaRepository extends JpaRepository<RegionalEntity, Long> {

	boolean existsByNomeIgnoreCase(String nome);

	boolean existsByNomeIgnoreCaseAndIdNot(String nome, Long id);

	Page<RegionalEntity> findByNomeContainingIgnoreCase(String nome, Pageable pageable);
}
