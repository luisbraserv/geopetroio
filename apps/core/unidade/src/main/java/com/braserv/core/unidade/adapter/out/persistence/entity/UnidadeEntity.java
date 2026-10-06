package com.braserv.core.unidade.adapter.out.persistence.entity;

import com.braserv.core.setor.adapter.out.persistence.entity.SetorEntity;
import com.braserv.core.unidade.domain.StatusUnidade;
import com.braserv.core.unidade.domain.TipoUnidade;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "unidades")
public class UnidadeEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false, unique = true)
	private String nome;

	private String apelido;

	/** RN-065 — classificacao do equipamento. Nao altera o que e monitorado (RN-074). */
	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private TipoUnidade tipo;

	/** RN-116 — inativar substitui excluir para unidade que ja foi usada. */
	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 16)
	private StatusUnidade status = StatusUnidade.ATIVA;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "setor_id", nullable = false)
	private SetorEntity setor;

	public Long getId() { return id; }
	public void setId(Long id) { this.id = id; }
	public String getNome() { return nome; }
	public void setNome(String nome) { this.nome = nome; }
	public String getApelido() { return apelido; }
	public void setApelido(String apelido) { this.apelido = apelido; }
	public TipoUnidade getTipo() { return tipo; }
	public void setTipo(TipoUnidade tipo) { this.tipo = tipo; }
	public StatusUnidade getStatus() { return status; }
	public void setStatus(StatusUnidade status) { this.status = status; }
	public boolean ativa() { return status == StatusUnidade.ATIVA; }
	public SetorEntity getSetor() { return setor; }
	public void setSetor(SetorEntity setor) { this.setor = setor; }
}
