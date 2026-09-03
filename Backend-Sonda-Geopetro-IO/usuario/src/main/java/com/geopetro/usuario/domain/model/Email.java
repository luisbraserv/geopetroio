package com.geopetro.usuario.domain.model;

public class Email {

	private String usuario;
	private String dominio;

	public Email() {
	}

	public Email(String usuario, String dominio) {
		this.usuario = tratarUsuario(usuario);
		this.dominio = tratarDominio(dominio);
	}

	public static Email comTratamento(String email) {
		String valor = tratarValor(email);
		String[] partes = valor.split("@", -1);

		if (partes.length != 2) {
			throw new IllegalArgumentException("Email deve conter usuario e dominio separados por @.");
		}

		return new Email(partes[0], partes[1]);
	}

	public String formatado() {
		return String.format("%s@%s", usuario, dominio);
	}

	public String getUsuario() {
		return usuario;
	}

	public void setUsuario(String usuario) {
		this.usuario = tratarUsuario(usuario);
	}

	public String getDominio() {
		return dominio;
	}

	public void setDominio(String dominio) {
		this.dominio = tratarDominio(dominio);
	}

	private static String tratarUsuario(String usuario) {
		String valor = tratarValor(usuario);

		if (valor.isBlank() || valor.contains("@")) {
			throw new IllegalArgumentException("Usuario do email invalido.");
		}

		return valor;
	}

	private static String tratarDominio(String dominio) {
		String valor = tratarValor(dominio);

		if (valor.isBlank() || valor.contains("@") || !valor.contains(".")) {
			throw new IllegalArgumentException("Dominio do email invalido.");
		}

		return valor;
	}

	private static String tratarValor(String valor) {
		if (valor == null) {
			return "";
		}

		return valor.trim().toLowerCase();
	}
}
