package com.braserv.core.identidade.token;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateCrtKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

/**
 * Le e grava chaves RSA em PEM: privada em PKCS#8 ({@code BEGIN PRIVATE KEY}), publica em X.509
 * ({@code BEGIN PUBLIC KEY}) — os formatos que {@code openssl} produz.
 *
 * <p>Gerar uma chave nova pelo terminal, para producao:
 * <pre>
 * openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out jwt-privada.pem
 * </pre>
 */
final class ArquivoDeChave {

	private static final String INICIO_PRIVADA = "-----BEGIN PRIVATE KEY-----";
	private static final String FIM_PRIVADA = "-----END PRIVATE KEY-----";
	private static final String INICIO_PUBLICA = "-----BEGIN PUBLIC KEY-----";
	private static final String FIM_PUBLICA = "-----END PUBLIC KEY-----";

	private ArquivoDeChave() {
	}

	static RSAPrivateCrtKey lerPrivada(Path arquivo) {
		try {
			byte[] der = decodificar(Files.readString(arquivo, StandardCharsets.US_ASCII), INICIO_PRIVADA, FIM_PRIVADA, arquivo);
			return (RSAPrivateCrtKey) KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(der));
		} catch (IOException | GeneralSecurityException | ClassCastException e) {
			throw new IllegalStateException("Chave privada invalida em " + arquivo + ". Esperado RSA em PKCS#8 (BEGIN PRIVATE KEY).", e);
		}
	}

	static RSAPublicKey lerPublica(Path arquivo) {
		try {
			byte[] der = decodificar(Files.readString(arquivo, StandardCharsets.US_ASCII), INICIO_PUBLICA, FIM_PUBLICA, arquivo);
			return (RSAPublicKey) KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(der));
		} catch (IOException | GeneralSecurityException | ClassCastException e) {
			throw new IllegalStateException("Chave publica invalida em " + arquivo + ". Esperado RSA em X.509 (BEGIN PUBLIC KEY).", e);
		}
	}

	/**
	 * Gera uma chave RSA de 2048 bits e grava em {@code arquivo}, legivel so pelo dono onde o sistema
	 * de arquivos permite. Existe para o ambiente de desenvolvimento; em producao a chave e provida.
	 */
	static RSAPrivateCrtKey gerar(Path arquivo) {
		try {
			KeyPairGenerator gerador = KeyPairGenerator.getInstance("RSA");
			gerador.initialize(2048);
			RSAPrivateCrtKey privada = (RSAPrivateCrtKey) gerador.generateKeyPair().getPrivate();
			if (arquivo.getParent() != null) {
				Files.createDirectories(arquivo.getParent());
			}
			Files.writeString(arquivo, pem(privada.getEncoded()), StandardCharsets.US_ASCII);
			try {
				Files.setPosixFilePermissions(arquivo, PosixFilePermissions.fromString("rw-------"));
			} catch (UnsupportedOperationException semPosix) {
				// Windows: as permissoes ficam as da pasta do usuario.
			}
			return privada;
		} catch (IOException | GeneralSecurityException e) {
			throw new IllegalStateException("Nao foi possivel gerar a chave de assinatura em " + arquivo, e);
		}
	}

	private static String pem(byte[] der) {
		String base64 = Base64.getMimeEncoder(64, "\n".getBytes(StandardCharsets.US_ASCII)).encodeToString(der);
		return INICIO_PRIVADA + "\n" + base64 + "\n" + FIM_PRIVADA + "\n";
	}

	private static byte[] decodificar(String conteudo, String inicio, String fim, Path arquivo) {
		int de = conteudo.indexOf(inicio);
		int ate = conteudo.indexOf(fim);
		if (de < 0 || ate < de) {
			throw new IllegalStateException("Arquivo " + arquivo + " nao contem " + inicio);
		}
		String base64 = conteudo.substring(de + inicio.length(), ate).replaceAll("\\s", "");
		return Base64.getDecoder().decode(base64);
	}
}
