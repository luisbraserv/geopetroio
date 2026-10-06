package com.braserv.core.db;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Verifica as migrations do Braserv-Core contra um <b>MySQL real</b>, numa base descartavel.
 *
 * <p><b>Por que MySQL e nao H2:</b> o H2 nao reproduz {@code ENGINE}, {@code COLLATE} nem os
 * {@code CHECK} do MySQL do jeito que a producao os executa.
 *
 * <p><b>Pula quando nao ha MySQL alcancavel</b>, em vez de quebrar a suite. Credenciais por
 * {@code DB_TEST_HOST}, {@code DB_USERNAME} e {@code DB_PASSWORD}.
 *
 * <p><b>Nunca toca a base de desenvolvimento.</b> Cria e derruba um schema proprio a cada caso.
 */
class MigracaoFlywayTest {

	private static final String HOST = System.getenv().getOrDefault("DB_TEST_HOST", "localhost:3306");
	private static final String USUARIO = System.getenv().getOrDefault("DB_USERNAME", "root");
	private static final String SENHA = System.getenv().getOrDefault("DB_PASSWORD", "");

	private static final String SCHEMA = "braserv_core_migracao_teste";
	private static final String PARAMETROS = "?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC";

	private static final String URL_SERVIDOR = "jdbc:mysql://" + HOST + "/" + PARAMETROS;
	private static final String URL_SCHEMA = "jdbc:mysql://" + HOST + "/" + SCHEMA + PARAMETROS;

	private static final List<String> TABELAS = List.of("regionais", "setores", "unidades", "empresas", "usuarios",
			"usuario_roles", "usuario_cliente_unidades", "recuperacao_senha", "configuracao_smtp");

	@BeforeEach
	void prepararSchemaLimpo() throws SQLException {
		assumeTrue(servidorDisponivel(), "MySQL nao alcancavel em " + HOST + " — teste de migracao pulado");
		executarNoServidor("DROP DATABASE IF EXISTS " + SCHEMA);
		executarNoServidor("CREATE DATABASE " + SCHEMA + " CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci");
	}

	@AfterEach
	void derrubarSchema() throws SQLException {
		if (servidorDisponivel()) {
			executarNoServidor("DROP DATABASE IF EXISTS " + SCHEMA);
		}
	}

	/** Mesma configuracao de application.properties. */
	private Flyway flyway() {
		return Flyway.configure()
				.dataSource(URL_SCHEMA, USUARIO, SENHA)
				.locations("classpath:db/migration")
				.baselineOnMigrate(true)
				.baselineVersion("2026.10.06.1")
				.validateOnMigrate(true)
				.cleanDisabled(true)
				.load();
	}

	@Test
	@DisplayName("base vazia: a migration inicial cria as nove tabelas com os nomes novos")
	void baseVaziaCriaTudo() throws SQLException {
		var resultado = flyway().migrate();

		assertThat(resultado.migrationsExecuted).isGreaterThanOrEqualTo(1);
		for (String tabela : TABELAS) {
			assertThat(existeTabela(tabela)).as(tabela).isTrue();
		}
		assertThat(existeTabela("unidades_sondas")).isFalse();
		assertThat(existeColuna("usuario_cliente_unidades", "unidade_id")).isTrue();
		assertThat(existeColuna("usuario_cliente_unidades", "unidade_sonda_id")).isFalse();
		assertThat(existeColuna("usuarios", "regional_id")).isFalse();
	}

	@Test
	@DisplayName("base que recebeu as tabelas movidas: a versao inicial so e marcada, nao executada")
	void baseMovidaSoMarcaAVersaoInicial() throws SQLException {
		// Simula o resultado do script de movimentacao: tabelas ja existem, sem historico do Flyway.
		executarNoSchema("CREATE TABLE regionais (id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, nome VARCHAR(255) NOT NULL, centro_custo VARCHAR(255))");
		executarNoSchema("INSERT INTO regionais (nome) VALUES ('Bahia')");

		flyway().migrate();

		assertThat(contar("SELECT COUNT(*) FROM flyway_schema_history WHERE type = 'BASELINE' AND version = '2026.10.06.1'"))
				.isEqualTo(1);
		assertThat(contar("SELECT COUNT(*) FROM regionais")).as("o dado movido continua la").isEqualTo(1);
	}

	@Test
	@DisplayName("unidade com concessao a cliente nao pode ser apagada no banco")
	void concessaoProtegeAUnidade() throws SQLException {
		flyway().migrate();
		executarNoSchema("INSERT INTO regionais (id, nome) VALUES (1, 'Bahia')");
		executarNoSchema("INSERT INTO setores (id, regional_id, nome) VALUES (1, 1, 'Recôncavo')");
		executarNoSchema("INSERT INTO unidades (id, setor_id, nome, tipo) VALUES (7, 1, 'SPT-144', 'SONDA')");
		executarNoSchema("""
				INSERT INTO usuarios (username, tipo_usuario, nome, email, password, telefone, status)
				VALUES ('cli', 'CLIENTE', 'Cliente', 'cli@example.test', 'x', '71999999999', 'ATIVO')""");
		executarNoSchema("INSERT INTO usuario_cliente_unidades (unidade_id, usuario_username) VALUES (7, 'cli')");

		assertThatThrownBy(() -> executarNoSchema("DELETE FROM unidades WHERE id = 7"))
				.isInstanceOf(SQLException.class)
				.hasMessageContaining("foreign key");
	}

	@Test
	@DisplayName("a configuracao de e-mail continua sendo linha unica")
	void smtpLinhaUnica() throws SQLException {
		flyway().migrate();
		String insert = "INSERT INTO configuracao_smtp (id, version, enabled, host, port, transport, auth, username, sender_address, frontend_url) VALUES ";

		executarNoSchema(insert + "(1, 0, false, '', 587, 'STARTTLS', false, '', '', '')");

		assertThatThrownBy(() -> executarNoSchema(insert + "(2, 0, false, '', 587, 'STARTTLS', false, '', '', '')"))
				.isInstanceOf(SQLException.class);
	}

	private boolean servidorDisponivel() {
		try (Connection conexao = DriverManager.getConnection(URL_SERVIDOR, USUARIO, SENHA)) {
			return conexao.isValid(2);
		} catch (SQLException e) {
			return false;
		}
	}

	private void executarNoServidor(String sql) throws SQLException {
		try (Connection conexao = DriverManager.getConnection(URL_SERVIDOR, USUARIO, SENHA);
				Statement comando = conexao.createStatement()) {
			comando.execute(sql);
		}
	}

	private void executarNoSchema(String sql) throws SQLException {
		try (Connection conexao = DriverManager.getConnection(URL_SCHEMA, USUARIO, SENHA);
				Statement comando = conexao.createStatement()) {
			comando.execute(sql);
		}
	}

	private long contar(String sql) throws SQLException {
		try (Connection conexao = DriverManager.getConnection(URL_SCHEMA, USUARIO, SENHA);
				Statement comando = conexao.createStatement();
				ResultSet resultado = comando.executeQuery(sql)) {
			resultado.next();
			return resultado.getLong(1);
		}
	}

	private boolean existeTabela(String tabela) throws SQLException {
		return contar("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = '" + SCHEMA
				+ "' AND TABLE_NAME = '" + tabela + "'") == 1;
	}

	private boolean existeColuna(String tabela, String coluna) throws SQLException {
		return contar("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '" + SCHEMA
				+ "' AND TABLE_NAME = '" + tabela + "' AND COLUMN_NAME = '" + coluna + "'") == 1;
	}
}
