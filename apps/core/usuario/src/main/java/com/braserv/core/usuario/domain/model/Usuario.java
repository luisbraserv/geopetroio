package com.braserv.core.usuario.domain.model;

import java.util.LinkedHashSet;
import java.util.Set;

import com.braserv.core.usuario.domain.exception.UsuarioInvalidoException;

public abstract class Usuario {

	private String username;
	private String password;
	private Set<Role> roles;
	private StatusUsuario status;
	private String nome;
	private Telefone telefone;
	private Email email;
	private Endereco endereco;

	public Usuario() {
	}

	protected Usuario(String username, String password, Set<Role> roles, String nome, Telefone telefone, Email email,
			Endereco endereco) {
		this.username = validarUsername(username);
		this.password = validarPassword(password);
		this.roles = validarRoles(roles);
		this.status = StatusUsuario.ATIVO;
		this.nome = validarNome(nome);
		this.telefone = validarTelefone(telefone);
		this.email = validarEmail(email);
		this.endereco = validarEndereco(endereco);
	}

	public String getUsername() {
		return username;
	}

	public void setUsername(String username) {
		this.username = validarUsername(username);
	}

	public String getPassword() {
		return password;
	}

	public void setPassword(String password) {
		this.password = validarPassword(password);
	}

	public Role getRole() {
		return roles.stream().findFirst()
				.orElseThrow(() -> new UsuarioInvalidoException("Role do usuario e obrigatoria."));
	}

	public void setRole(Role role) {
		this.roles = validarRoles(Set.of(role));
	}

	public Set<Role> getRoles() {
		return Set.copyOf(roles);
	}

	public void setRoles(Set<Role> roles) {
		this.roles = validarRoles(roles);
	}

	public StatusUsuario getStatus() {
		return status;
	}

	public void setStatus(StatusUsuario status) {
		if (status == null) {
			throw new UsuarioInvalidoException("Status do usuario e obrigatorio.");
		}

		this.status = status;
	}

	public String getNome() {
		return nome;
	}

	public void setNome(String nome) {
		this.nome = validarNome(nome);
	}

	public Telefone getTelefone() {
		return telefone;
	}

	public void setTelefone(Telefone telefone) {
		this.telefone = validarTelefone(telefone);
	}

	public Email getEmail() {
		return email;
	}

	public void setEmail(Email email) {
		this.email = validarEmail(email);
	}

	public Endereco getEndereco() {
		return endereco;
	}

	public void setEndereco(Endereco endereco) {
		this.endereco = validarEndereco(endereco);
	}

	public void ativar() {
		this.status = StatusUsuario.ATIVO;
	}

	public void desativar() {
		this.status = StatusUsuario.INATIVO;
	}

	private static String validarUsername(String username) {
		String valor = tratarTexto(username);

		if (valor.isBlank()) {
			throw new UsuarioInvalidoException("Username e obrigatorio.");
		}

		if (valor.length() > 60) {
			throw new UsuarioInvalidoException("Username deve ter no maximo 60 caracteres.");
		}

		if (!valor.matches("[a-zA-Z0-9._-]+")) {
			throw new UsuarioInvalidoException("Username deve conter apenas letras, numeros, ponto, hifen ou underline.");
		}

		return valor;
	}

	private static String validarPassword(String password) {
		String valor = tratarTexto(password);

		if (valor.isBlank()) {
			throw new UsuarioInvalidoException("Password e obrigatorio.");
		}

		if (valor.length() < 8) {
			throw new UsuarioInvalidoException("Password deve ter no minimo 8 caracteres.");
		}

		if (valor.length() > 20 && !isBCryptHash(valor)) {
			throw new UsuarioInvalidoException("Password deve ter no maximo 20 caracteres.");
		}

		if (isBCryptHash(valor)) {
			return valor;
		}

		if (!valor.matches(".*[a-z].*")) {
			throw new UsuarioInvalidoException("Password deve conter pelo menos uma letra minuscula.");
		}

		if (!valor.matches(".*[A-Z].*")) {
			throw new UsuarioInvalidoException("Password deve conter pelo menos uma letra maiuscula.");
		}

		if (!valor.matches(".*\\d.*")) {
			throw new UsuarioInvalidoException("Password deve conter pelo menos um numero.");
		}

		if (!valor.matches(".*[^a-zA-Z0-9].*")) {
			throw new UsuarioInvalidoException("Password deve conter pelo menos um caractere especial.");
		}

		return valor;
	}

	private static Set<Role> validarRoles(Set<Role> roles) {
		if (roles == null || roles.isEmpty() || roles.stream().anyMatch(role -> role == null)) {
			throw new UsuarioInvalidoException("Role do usuario e obrigatoria.");
		}

		return new LinkedHashSet<>(roles);
	}

	private static boolean isBCryptHash(String valor) {
		return valor.matches("^\\$2[aby]\\$\\d{2}\\$.{53}$");
	}

	private static String validarNome(String nome) {
		String valor = tratarTexto(nome);

		if (valor.isBlank()) {
			throw new UsuarioInvalidoException("Nome do usuario e obrigatorio.");
		}

		return valor;
	}

	private static Telefone validarTelefone(Telefone telefone) {
		if (telefone == null) {
			throw new UsuarioInvalidoException("Telefone do usuario e obrigatorio.");
		}

		return telefone;
	}

	private static Email validarEmail(Email email) {
		if (email == null) {
			throw new UsuarioInvalidoException("Email do usuario e obrigatorio.");
		}

		return email;
	}

	private static Endereco validarEndereco(Endereco endereco) {
		return endereco;
	}

	private static String tratarTexto(String valor) {
		if (valor == null) {
			return "";
		}

		return valor.trim();
	}
}
