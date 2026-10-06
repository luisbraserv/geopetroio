package com.geopetro.usuario.domain.model;

public class Telefone {

	private String ddd;
	private String numero;

	public Telefone() {
	}

	public Telefone(String ddd, String numero) {
		this.ddd = tratarDdd(ddd);
		this.numero = tratarNumero(numero);
	}

	public static Telefone comTratamento(String telefone) {
		String digitos = manterApenasDigitos(telefone);

		if (digitos.length() != 11) {
			throw new IllegalArgumentException("Telefone deve conter DDD e numero com 11 digitos.");
		}

		return new Telefone(digitos.substring(0, 2), digitos.substring(2));
	}

	public String formatado() {
		return String.format("(%s) %s-%s", ddd, numero.substring(0, 5), numero.substring(5));
	}

	public String getDdd() {
		return ddd;
	}

	public void setDdd(String ddd) {
		this.ddd = tratarDdd(ddd);
	}

	public String getNumero() {
		return numero;
	}

	public void setNumero(String numero) {
		this.numero = tratarNumero(numero);
	}

	private static String tratarDdd(String ddd) {
		String digitos = manterApenasDigitos(ddd);

		if (digitos.length() != 2) {
			throw new IllegalArgumentException("DDD deve conter 2 digitos.");
		}

		return digitos;
	}

	private static String tratarNumero(String numero) {
		String digitos = manterApenasDigitos(numero);

		if (digitos.length() != 9) {
			throw new IllegalArgumentException("Numero deve conter 9 digitos.");
		}

		return digitos;
	}

	private static String manterApenasDigitos(String valor) {
		if (valor == null) {
			return "";
		}

		return valor.replaceAll("\\D", "");
	}
}
