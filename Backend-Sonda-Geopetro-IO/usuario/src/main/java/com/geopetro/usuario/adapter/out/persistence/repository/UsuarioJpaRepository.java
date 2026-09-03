package com.geopetro.usuario.adapter.out.persistence.repository;

import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import com.geopetro.usuario.adapter.out.persistence.entity.UsuarioEntity;

public interface UsuarioJpaRepository extends JpaRepository<UsuarioEntity, String> {

	Optional<UsuarioEntity> findByEmail(String email);

	Page<UsuarioEntity> findByUsernameContainingIgnoreCaseOrNomeContainingIgnoreCaseOrEmailContainingIgnoreCase(
			String username, String nome, String email, Pageable pageable);
}
