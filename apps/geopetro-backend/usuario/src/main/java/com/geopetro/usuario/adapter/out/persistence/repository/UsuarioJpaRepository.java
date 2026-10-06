package com.geopetro.usuario.adapter.out.persistence.repository;

import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.geopetro.usuario.adapter.out.persistence.entity.UsuarioEntity;
import com.geopetro.usuario.domain.model.StatusUsuario;

public interface UsuarioJpaRepository extends JpaRepository<UsuarioEntity, String> {

	Optional<UsuarioEntity> findByEmail(String email);

	/**
	 * Projecao do status, usada a cada requisicao autenticada (RN-062). Carregar o
	 * {@link UsuarioEntity} inteiro traria roles, endereco e as colecoes do usuario interno para
	 * responder uma pergunta de um campo so.
	 */
	@Query("select u.status from UsuarioEntity u where u.username = :username")
	Optional<StatusUsuario> findStatusByUsername(@Param("username") String username);

	/** Clientes com a unidade/sonda concedida — RN-063 e RN-048. */
	@Query("select count(u) from UsuarioClienteEntity u join u.unidadesSondas s where s.id = :unidadeSondaId")
	long countClientesComUnidadeSonda(@Param("unidadeSondaId") Long unidadeSondaId);

	/** Usuarios de uma empresa — RN-063. */
	@Query("select count(u) from UsuarioClienteEntity u where u.empresaRef.id = :empresaId")
	long countByEmpresaId(@Param("empresaId") Long empresaId);

	Page<UsuarioEntity> findByUsernameContainingIgnoreCaseOrNomeContainingIgnoreCaseOrEmailContainingIgnoreCase(
			String username, String nome, String email, Pageable pageable);
}
