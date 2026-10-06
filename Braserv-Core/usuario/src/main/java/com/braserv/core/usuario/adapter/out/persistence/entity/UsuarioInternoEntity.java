package com.braserv.core.usuario.adapter.out.persistence.entity;

import jakarta.persistence.DiscriminatorValue;
import jakarta.persistence.Entity;

/**
 * RN-064 — sem vinculo organizacional. A coluna {@code regional_id} e as tabelas
 * {@code usuario_interno_regionais} / {@code usuario_interno_setores} sairam do modelo; o descarte
 * no banco esta em {@code db/migrations/2026-09-06-usuario-sem-vinculo-organizacional.sql}.
 */
@Entity
@DiscriminatorValue("INTERNO")
public class UsuarioInternoEntity extends UsuarioEntity {

	private Integer matricula;

	public Integer getMatricula() { return matricula; }
	public void setMatricula(Integer matricula) { this.matricula = matricula; }
}
