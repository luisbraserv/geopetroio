package com.braserv.core;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Braserv-Core: cadastro organizacional e identidade da Braserv — RN-115.
 *
 * <p>Dono de Usuario, Empresa, Regional, Setor e Unidade, do login e da emissao de tokens. Os
 * outros sistemas consomem o core e nao guardam copia desses dados.
 */
@SpringBootApplication(scanBasePackages = "com.braserv.core")
public class BraservCoreApplication {

	public static void main(String[] args) {
		SpringApplication.run(BraservCoreApplication.class, args);
	}

}
