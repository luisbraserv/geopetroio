package com.geopetro.unidadesonda.adapter.out.persistence.entity;

import com.geopetro.setor.adapter.out.persistence.entity.SetorEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "unidades_sondas")
public class UnidadeSondaEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false, unique = true)
	private String nome;

	private String apelido;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "setor_id", nullable = false)
	private SetorEntity setor;

	public Long getId() { return id; }
	public void setId(Long id) { this.id = id; }
	public String getNome() { return nome; }
	public void setNome(String nome) { this.nome = nome; }
	public String getApelido() { return apelido; }
	public void setApelido(String apelido) { this.apelido = apelido; }
	public SetorEntity getSetor() { return setor; }
	public void setSetor(SetorEntity setor) { this.setor = setor; }
}
