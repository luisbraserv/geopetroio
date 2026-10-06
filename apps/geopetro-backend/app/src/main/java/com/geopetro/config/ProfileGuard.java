package com.geopetro.config;

import java.util.Arrays;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Alerta quando a aplicacao sobe com perfil de desenvolvimento fora da maquina do desenvolvedor.
 *
 * <p><b>Por que isto existe.</b> O perfil default e {@code dev}. Se um container subir sem
 * {@code SPRING_PROFILES_ACTIVE=prod}, o {@code application-prod.properties} nunca e lido — e a
 * aplicacao usa o MySQL de localhost e o segredo JWT de desenvolvimento, <b>mesmo que
 * {@code DB_URL} e {@code JWT_SECRET} estejam definidos</b>. O sintoma seria um erro de conexao
 * confuso, ou pior: se houver um MySQL local, ela sobe funcionando com uma chave JWT publica.
 *
 * <p>A imagem Docker ja define {@code SPRING_PROFILES_ACTIVE=prod}. Esta classe cobre o caso de
 * alguem sobrescrever isso por engano, ou rodar o jar direto sem o perfil.
 *
 * <p>Nao impede o startup de proposito: bloquear quebraria o uso legitimo em desenvolvimento.
 * O alerta e ruidoso justamente para ser notado em log de container.
 */
@Component
public class ProfileGuard {

	private static final Logger log = LoggerFactory.getLogger(ProfileGuard.class);

	private static final List<String> PERFIS_DE_DESENVOLVIMENTO = List.of("dev", "default", "test");

	private final Environment environment;

	public ProfileGuard(Environment environment) {
		this.environment = environment;
	}

	@EventListener(ApplicationReadyEvent.class)
	public void verificar() {
		String[] ativos = environment.getActiveProfiles();
		String perfis = ativos.length == 0 ? "default" : String.join(",", ativos);

		boolean desenvolvimento = ativos.length == 0
				|| Arrays.stream(ativos).allMatch(PERFIS_DE_DESENVOLVIMENTO::contains);

		if (!desenvolvimento) {
			log.info("Perfil ativo: {}", perfis);
			return;
		}

		String url = environment.getProperty("spring.datasource.url", "");
		boolean bancoLocal = url.contains("localhost") || url.contains("127.0.0.1");

		if (bancoLocal) {
			log.info("Perfil ativo: {} (banco local — execucao de desenvolvimento)", perfis);
			return;
		}

		// Perfil de desenvolvimento apontando para um banco que nao e local: quase certamente
		// um deploy que esqueceu de definir SPRING_PROFILES_ACTIVE.
		log.error("""

				*********************************************************************
				ATENCAO: perfil '{}' ativo com banco NAO local.

				O application-prod.properties NAO foi carregado. A aplicacao esta
				usando o segredo JWT de desenvolvimento, que e publico no repositorio.

				Defina SPRING_PROFILES_ACTIVE=prod.
				*********************************************************************
				""", perfis);
	}
}
