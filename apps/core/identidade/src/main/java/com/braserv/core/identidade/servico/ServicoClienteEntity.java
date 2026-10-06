package com.braserv.core.identidade.servico;

import java.time.Instant;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.TreeSet;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Um sistema autorizado a chamar as rotas internas do core — RN-117. */
@Entity
@Table(name = "servicos_clientes")
public class ServicoClienteEntity {

	@Id
	@Column(length = 64)
	private String id;

	@Column(nullable = false)
	private String nome;

	/** BCrypt. O segredo em si so existe na resposta que o gerou. */
	@Column(name = "segredo_hash", nullable = false)
	private String segredoHash;

	/** Separados por virgula, em ordem alfabetica. */
	@Column(nullable = false, length = 1024)
	private String escopos;

	@Column(nullable = false)
	private boolean ativo;

	@Column(name = "criado_em", nullable = false)
	private Instant criadoEm;

	@Column(name = "atualizado_em", nullable = false)
	private Instant atualizadoEm;

	@Column(name = "ultimo_uso_em")
	private Instant ultimoUsoEm;

	public String getId() { return id; }
	public void setId(String id) { this.id = id; }
	public String getNome() { return nome; }
	public void setNome(String nome) { this.nome = nome; }
	public String getSegredoHash() { return segredoHash; }
	public void setSegredoHash(String segredoHash) { this.segredoHash = segredoHash; }
	public boolean isAtivo() { return ativo; }
	public void setAtivo(boolean ativo) { this.ativo = ativo; }
	public Instant getCriadoEm() { return criadoEm; }
	public void setCriadoEm(Instant criadoEm) { this.criadoEm = criadoEm; }
	public Instant getAtualizadoEm() { return atualizadoEm; }
	public void setAtualizadoEm(Instant atualizadoEm) { this.atualizadoEm = atualizadoEm; }
	public Instant getUltimoUsoEm() { return ultimoUsoEm; }
	public void setUltimoUsoEm(Instant ultimoUsoEm) { this.ultimoUsoEm = ultimoUsoEm; }

	public Set<String> getEscopos() {
		if (escopos == null || escopos.isBlank()) {
			return Set.of();
		}
		return new LinkedHashSet<>(Arrays.asList(escopos.split(",")));
	}

	public void setEscopos(Set<String> escopos) {
		this.escopos = String.join(",", new TreeSet<>(escopos));
	}
}
