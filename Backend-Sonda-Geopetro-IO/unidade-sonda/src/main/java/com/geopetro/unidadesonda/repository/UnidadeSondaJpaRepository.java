package com.geopetro.unidadesonda.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import com.geopetro.unidadesonda.adapter.out.persistence.entity.UnidadeSondaEntity;

public interface UnidadeSondaJpaRepository extends JpaRepository<UnidadeSondaEntity, Long> {

	Page<UnidadeSondaEntity> findByNomeContainingIgnoreCaseOrApelidoContainingIgnoreCase(String nome, String apelido,
			Pageable pageable);

	List<UnidadeSondaEntity> findBySetorIdOrderByNomeAsc(Long setorId);

	List<UnidadeSondaEntity> findBySetorIdInOrderByNomeAsc(List<Long> setorIds);

	List<UnidadeSondaEntity> findBySetor_RegionalIdOrderByNomeAsc(Long regionalId);

	boolean existsBySetor_RegionalId(Long regionalId);

	Optional<UnidadeSondaEntity> findByNome(String nome);

	boolean existsByNome(String nome);

	boolean existsByNomeAndIdNot(String nome, Long id);
}
