package com.braserv.core.identidade.token;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.interfaces.RSAPrivateCrtKey;
import java.security.interfaces.RSAPublicKey;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Carrega as chaves de assinatura — RN-117.
 *
 * <ul>
 *   <li>{@code security.jwt.chave-privada}: caminho do PEM da chave atual. Obrigatorio.</li>
 *   <li>{@code security.jwt.chaves-publicas-anteriores}: caminhos de PEMs publicos, separados por
 *       virgula. Usado so durante uma rotacao.</li>
 *   <li>{@code security.jwt.gerar-se-ausente}: gera a chave quando o arquivo nao existe. Ligado em
 *       desenvolvimento; <b>desligado em producao</b>, onde subir com uma chave recem-inventada
 *       invalidaria todos os tokens a cada deploy sem ninguem perceber o motivo.</li>
 * </ul>
 */
@Configuration
public class ChavesDeAssinaturaConfig {

	private static final Logger log = LoggerFactory.getLogger(ChavesDeAssinaturaConfig.class);

	@Bean
	ChavesDeAssinatura chavesDeAssinatura(
			@Value("${security.jwt.chave-privada:}") String chavePrivada,
			@Value("${security.jwt.chaves-publicas-anteriores:}") List<String> anteriores,
			@Value("${security.jwt.gerar-se-ausente:false}") boolean gerarSeAusente) {
		if (chavePrivada == null || chavePrivada.isBlank()) {
			throw new IllegalStateException(
					"security.jwt.chave-privada nao configurado. Defina JWT_CHAVE_PRIVADA com o caminho do PEM.");
		}
		Path arquivo = Path.of(chavePrivada);
		RSAPrivateCrtKey privada;
		if (Files.exists(arquivo)) {
			privada = ArquivoDeChave.lerPrivada(arquivo);
		} else if (gerarSeAusente) {
			privada = ArquivoDeChave.gerar(arquivo);
			log.warn("Chave de assinatura gerada em {}. Use so em desenvolvimento.", arquivo.toAbsolutePath());
		} else {
			throw new IllegalStateException("Chave de assinatura nao encontrada em " + arquivo.toAbsolutePath()
					+ ". Gere com: openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out <arquivo>");
		}
		List<RSAPublicKey> publicasAnteriores = anteriores.stream()
				.filter(caminho -> caminho != null && !caminho.isBlank())
				.map(caminho -> ArquivoDeChave.lerPublica(Path.of(caminho.trim())))
				.toList();
		ChavesDeAssinatura chaves = ChavesDeAssinatura.de(privada, publicasAnteriores);
		log.info("Assinando tokens com a chave kid={} ({} chave(s) publicada(s) no JWKS)", chaves.kidAtual(),
				1 + publicasAnteriores.size());
		return chaves;
	}
}
