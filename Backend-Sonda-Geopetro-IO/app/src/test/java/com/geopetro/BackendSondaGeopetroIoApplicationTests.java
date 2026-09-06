package com.geopetro;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:application-context;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=false",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.jpa.properties.hibernate.hbm2ddl.halt_on_error=true",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.sql.init.mode=never",
        // As migrations do Flyway sao escritas em SQL de MySQL e nao rodam em H2.
        // Aqui quem monta o schema e o Hibernate, so para o contexto subir; a
        // verificacao das migrations acontece contra MySQL real, fora desta suite.
        "spring.flyway.enabled=false"
})
class BackendSondaGeopetroIoApplicationTests {

    @org.springframework.beans.factory.annotation.Autowired
    javax.sql.DataSource dataSource;

	@Test
	void contextLoads() throws java.sql.SQLException {
        try (var connection = dataSource.getConnection()) {
            org.assertj.core.api.Assertions.assertThat(connection.getMetaData().getURL()).startsWith("jdbc:h2:mem:");
        }
	}

}
