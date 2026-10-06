package com.braserv.core;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.SQLException;

import javax.sql.DataSource;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import com.braserv.core.identidade.token.ChavesDeAssinatura;

@SpringBootTest(properties = {
		"spring.datasource.url=jdbc:h2:mem:braserv-core;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=false",
		"spring.datasource.driver-class-name=org.h2.Driver",
		"spring.datasource.username=sa",
		"spring.datasource.password=",
		"spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
		"spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
		"spring.jpa.properties.hibernate.hbm2ddl.halt_on_error=true",
		"spring.jpa.hibernate.ddl-auto=create-drop",
		"spring.sql.init.mode=never",
		// As migrations do Flyway sao escritas em SQL de MySQL e nao rodam em H2.
		// Aqui quem monta o schema e o Hibernate, so para o contexto subir; as
		// migrations sao verificadas contra MySQL real em MigracaoFlywayTest.
		"spring.flyway.enabled=false",
		"security.jwt.chave-privada=${java.io.tmpdir}/braserv-core-teste/jwt.pem",
		"security.jwt.gerar-se-ausente=true"
})
class BraservCoreApplicationTests {

	@Autowired
	DataSource dataSource;

	@Autowired
	ChavesDeAssinatura chaves;

	@Test
	void contextLoads() throws SQLException {
		try (var connection = dataSource.getConnection()) {
			assertThat(connection.getMetaData().getURL()).startsWith("jdbc:h2:mem:");
		}
		assertThat(chaves.kidAtual()).isNotBlank();
	}

}
