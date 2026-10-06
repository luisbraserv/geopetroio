package com.braserv.core.identidade.token;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.interfaces.RSAPrivateCrtKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.InvalidKeySpecException;
import java.security.spec.RSAPublicKeySpec;
import java.util.Arrays;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * O par de chaves que assina os tokens — RN-117.
 *
 * <p>A chave <b>privada</b> assina e nunca sai do Braserv-Core. A <b>publica</b> confere e e
 * publicada no JWKS ({@code /.well-known/jwks.json}) para qualquer sistema que precise validar um
 * token, sem receber nada que permita emitir um.
 *
 * <p>Alem da chave atual, aceita chaves publicas <b>anteriores</b>: durante uma rotacao, tokens
 * assinados com a chave antiga continuam validos ate expirar (1 hora). Cada chave e identificada
 * pelo {@code kid}, o thumbprint RFC 7638 dela — o mesmo arquivo de chave sempre produz o mesmo
 * {@code kid}, em qualquer maquina.
 */
public final class ChavesDeAssinatura {

	private final RSAPrivateCrtKey privadaAtual;
	private final String kidAtual;
	private final Map<String, RSAPublicKey> publicas;

	private ChavesDeAssinatura(RSAPrivateCrtKey privadaAtual, List<RSAPublicKey> anteriores) {
		this.privadaAtual = privadaAtual;
		RSAPublicKey publicaAtual = publicaDe(privadaAtual);
		this.kidAtual = kid(publicaAtual);
		Map<String, RSAPublicKey> todas = new LinkedHashMap<>();
		todas.put(kidAtual, publicaAtual);
		for (RSAPublicKey anterior : anteriores) {
			todas.putIfAbsent(kid(anterior), anterior);
		}
		this.publicas = Map.copyOf(todas);
	}

	public static ChavesDeAssinatura de(RSAPrivateCrtKey privadaAtual, List<RSAPublicKey> anteriores) {
		if (privadaAtual.getModulus().bitLength() < 2048) {
			throw new IllegalStateException("A chave de assinatura precisa ter ao menos 2048 bits.");
		}
		return new ChavesDeAssinatura(privadaAtual, anteriores == null ? List.of() : anteriores);
	}

	public RSAPrivateCrtKey privadaAtual() {
		return privadaAtual;
	}

	public String kidAtual() {
		return kidAtual;
	}

	/** Chave publica do {@code kid} informado, atual ou anterior. Vazio para um {@code kid} desconhecido. */
	public Optional<RSAPublicKey> publica(String kid) {
		return kid == null ? Optional.empty() : Optional.ofNullable(publicas.get(kid));
	}

	/** Conteudo do JWKS: a chave atual primeiro, depois as anteriores. */
	public Map<String, Object> jwks() {
		List<Map<String, String>> chaves = publicas.entrySet().stream()
				.sorted((a, b) -> a.getKey().equals(kidAtual) ? -1 : b.getKey().equals(kidAtual) ? 1 : 0)
				.map(entrada -> {
					Map<String, String> jwk = new LinkedHashMap<>();
					jwk.put("kty", "RSA");
					jwk.put("kid", entrada.getKey());
					jwk.put("use", "sig");
					jwk.put("alg", "RS256");
					jwk.put("n", base64Url(entrada.getValue().getModulus()));
					jwk.put("e", base64Url(entrada.getValue().getPublicExponent()));
					return jwk;
				})
				.toList();
		return Map.of("keys", chaves);
	}

	static RSAPublicKey publicaDe(RSAPrivateCrtKey privada) {
		try {
			return (RSAPublicKey) KeyFactory.getInstance("RSA")
					.generatePublic(new RSAPublicKeySpec(privada.getModulus(), privada.getPublicExponent()));
		} catch (NoSuchAlgorithmException | InvalidKeySpecException e) {
			throw new IllegalStateException("Nao foi possivel derivar a chave publica.", e);
		}
	}

	/** Thumbprint RFC 7638: SHA-256 do JWK canonico, em base64url sem preenchimento. */
	static String kid(RSAPublicKey publica) {
		String canonico = "{\"e\":\"" + base64Url(publica.getPublicExponent()) + "\",\"kty\":\"RSA\",\"n\":\""
				+ base64Url(publica.getModulus()) + "\"}";
		try {
			byte[] hash = MessageDigest.getInstance("SHA-256").digest(canonico.getBytes(StandardCharsets.UTF_8));
			return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
		} catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException("SHA-256 indisponivel.", e);
		}
	}

	/** Inteiro sem sinal, big-endian, sem o zero a esquerda que {@link BigInteger#toByteArray()} acrescenta. */
	private static String base64Url(BigInteger valor) {
		byte[] bytes = valor.toByteArray();
		if (bytes.length > 1 && bytes[0] == 0) {
			bytes = Arrays.copyOfRange(bytes, 1, bytes.length);
		}
		return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
	}
}
