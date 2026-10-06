package com.braserv.core.usuario.domain.model;

public class Endereco {

	private String cep;
	private String logradouro;
	private String bairro;
	private String cidade;
	private String estado;
	private String numero;
	private String complemento;

	public Endereco() {
	}

	public Endereco(String cep, String logradouro, String bairro, String cidade, String estado, String numero,
			String complemento) {
		this.cep = tratarCep(cep);
		this.logradouro = tratarCampoObrigatorio(logradouro, "Logradouro");
		this.bairro = tratarCampoObrigatorio(bairro, "Bairro");
		this.cidade = tratarCampoObrigatorio(cidade, "Cidade");
		this.estado = tratarEstado(estado);
		this.numero = tratarCampoObrigatorio(numero, "Numero");
		this.complemento = tratarComplemento(complemento);
	}

	public static Endereco comTratamento(String cep, String logradouro, String bairro, String cidade, String estado,
			String numero, String complemento) {
		return new Endereco(cep, logradouro, bairro, cidade, estado, numero, complemento);
	}

	public String formatado() {
		String endereco = String.format("%s, %s - %s, %s - %s, CEP: %s", logradouro, numero, bairro, cidade, estado,
				cep);

		if (complemento.isBlank()) {
			return endereco;
		}

		return String.format("%s, Complemento: %s", endereco, complemento);
	}

	public String getCep() {
		return cep;
	}

	public void setCep(String cep) {
		this.cep = tratarCep(cep);
	}

	public String getLogradouro() {
		return logradouro;
	}

	public void setLogradouro(String logradouro) {
		this.logradouro = tratarCampoObrigatorio(logradouro, "Logradouro");
	}

	public String getBairro() {
		return bairro;
	}

	public void setBairro(String bairro) {
		this.bairro = tratarCampoObrigatorio(bairro, "Bairro");
	}

	public String getCidade() {
		return cidade;
	}

	public void setCidade(String cidade) {
		this.cidade = tratarCampoObrigatorio(cidade, "Cidade");
	}

	public String getEstado() {
		return estado;
	}

	public void setEstado(String estado) {
		this.estado = tratarEstado(estado);
	}

	public String getNumero() {
		return numero;
	}

	public void setNumero(String numero) {
		this.numero = tratarCampoObrigatorio(numero, "Numero");
	}

	public String getComplemento() {
		return complemento;
	}

	public void setComplemento(String complemento) {
		this.complemento = tratarComplemento(complemento);
	}

	private static String tratarCep(String cep) {
		String digitos = manterApenasDigitos(cep);

		if (digitos.length() != 8) {
			throw new IllegalArgumentException("CEP deve conter 8 digitos.");
		}

		return String.format("%s-%s", digitos.substring(0, 5), digitos.substring(5));
	}

	private static String tratarEstado(String estado) {
		String valor = tratarTexto(estado).toUpperCase();

		if (valor.length() != 2) {
			throw new IllegalArgumentException("Estado deve conter 2 letras.");
		}

		return valor;
	}

	private static String tratarCampoObrigatorio(String valor, String nomeCampo) {
		String texto = tratarTexto(valor);

		if (texto.isBlank()) {
			throw new IllegalArgumentException(nomeCampo + " e obrigatorio.");
		}

		return texto;
	}

	private static String tratarComplemento(String complemento) {
		return tratarTexto(complemento);
	}

	private static String tratarTexto(String valor) {
		if (valor == null) {
			return "";
		}

		return valor.trim();
	}

	private static String manterApenasDigitos(String valor) {
		if (valor == null) {
			return "";
		}

		return valor.replaceAll("\\D", "");
	}
}
