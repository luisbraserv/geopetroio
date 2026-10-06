package com.braserv.core.setor.adapter.out.persistence.entity;

import com.braserv.core.regional.adapter.out.persistence.entity.RegionalEntity;

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
@Table(name = "setores")
public class SetorEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false)
	private String nome;

	private String centroCusto;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "regional_id", nullable = false)
	private RegionalEntity regional;

	public Long getId() { return id; }
	public void setId(Long id) { this.id = id; }
	public String getNome() { return nome; }
	public void setNome(String nome) { this.nome = nome; }
	public String getCentroCusto() { return centroCusto; }
	public void setCentroCusto(String centroCusto) { this.centroCusto = centroCusto; }
	public RegionalEntity getRegional() { return regional; }
	public void setRegional(RegionalEntity regional) { this.regional = regional; }
}
