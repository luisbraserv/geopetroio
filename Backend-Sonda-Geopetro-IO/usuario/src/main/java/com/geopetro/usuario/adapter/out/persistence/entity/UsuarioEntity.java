package com.geopetro.usuario.adapter.out.persistence.entity;

import java.util.LinkedHashSet;
import java.util.Set;

import com.geopetro.usuario.domain.model.Role;
import com.geopetro.usuario.domain.model.StatusUsuario;

import jakarta.persistence.Column;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.DiscriminatorColumn;
import jakarta.persistence.DiscriminatorType;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.Inheritance;
import jakarta.persistence.InheritanceType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;

@Entity
@Table(name = "usuarios")
@Inheritance(strategy = InheritanceType.SINGLE_TABLE)
@DiscriminatorColumn(name = "tipo_usuario", discriminatorType = DiscriminatorType.STRING)
public abstract class UsuarioEntity {

	@Id
	private String username;

	@Column(nullable = false)
	private String password;

	@ElementCollection(fetch = FetchType.EAGER)
	@CollectionTable(name = "usuario_roles", joinColumns = @JoinColumn(name = "username"))
	@Enumerated(EnumType.STRING)
	@Column(name = "role", nullable = false)
	private Set<Role> roles = new LinkedHashSet<>();

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private StatusUsuario status;

	@Column(nullable = false)
	private String nome;

	@Column(nullable = false)
	private String telefone;

	@Column(nullable = false)
	private String email;

	private String cep;

	private String logradouro;

	private String bairro;

	private String cidade;

	private String estado;

	private String numero;

	private String complemento;

	public String getUsername() {
		return username;
	}

	public void setUsername(String username) {
		this.username = username;
	}

	public String getPassword() {
		return password;
	}

	public void setPassword(String password) {
		this.password = password;
	}

	public Role getRole() {
		return roles.stream().findFirst().orElse(null);
	}

	public void setRole(Role role) {
		this.roles = new LinkedHashSet<>(Set.of(role));
	}

	public Set<Role> getRoles() {
		return roles;
	}

	public void setRoles(Set<Role> roles) {
		this.roles = new LinkedHashSet<>(roles);
	}

	public StatusUsuario getStatus() {
		return status;
	}

	public void setStatus(StatusUsuario status) {
		this.status = status;
	}

	public String getNome() {
		return nome;
	}

	public void setNome(String nome) {
		this.nome = nome;
	}

	public String getTelefone() {
		return telefone;
	}

	public void setTelefone(String telefone) {
		this.telefone = telefone;
	}

	public String getEmail() {
		return email;
	}

	public void setEmail(String email) {
		this.email = email;
	}

	public String getCep() {
		return cep;
	}

	public void setCep(String cep) {
		this.cep = cep;
	}

	public String getLogradouro() {
		return logradouro;
	}

	public void setLogradouro(String logradouro) {
		this.logradouro = logradouro;
	}

	public String getBairro() {
		return bairro;
	}

	public void setBairro(String bairro) {
		this.bairro = bairro;
	}

	public String getCidade() {
		return cidade;
	}

	public void setCidade(String cidade) {
		this.cidade = cidade;
	}

	public String getEstado() {
		return estado;
	}

	public void setEstado(String estado) {
		this.estado = estado;
	}

	public String getNumero() {
		return numero;
	}

	public void setNumero(String numero) {
		this.numero = numero;
	}

	public String getComplemento() {
		return complemento;
	}

	public void setComplemento(String complemento) {
		this.complemento = complemento;
	}
}
