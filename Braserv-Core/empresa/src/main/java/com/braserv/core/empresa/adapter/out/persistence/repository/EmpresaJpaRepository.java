package com.braserv.core.empresa.adapter.out.persistence.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import com.braserv.core.empresa.adapter.out.persistence.entity.EmpresaEntity;

public interface EmpresaJpaRepository extends JpaRepository<EmpresaEntity, Long> {
	boolean existsByCnpj(String cnpj);

	Page<EmpresaEntity> findByNomeContainingIgnoreCaseOrCnpjContainingIgnoreCase(String nome, String cnpj,
			Pageable pageable);
}
