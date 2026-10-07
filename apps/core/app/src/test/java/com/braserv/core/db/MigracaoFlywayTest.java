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
		assertThat(existeColuna("unidades", "status")).isTrue();
		assertThat(existeTabela("servicos_clientes")).isTrue();
	}

	@Test
	@DisplayName("base movida: a estrutura inicial so e marcada, e as migrations seguintes rodam sobre os dados")
	void baseMovidaRecebeAsMigrationsSeguintes() throws Exception {
		// O script de movimentacao deixa o schema igual a estrutura inicial, com dados e sem historico do Flyway.
		executarScript("db/migration/V2026.10.06.1__estrutura_inicial.sql");
		executarNoSchema("INSERT INTO regionais (id, nome) VALUES (1, 'Bahia')");
		executarNoSchema("INSERT INTO setores (id, regional_id, nome) VALUES (1, 1, 'Reconcavo')");
		executarNoSchema("INSERT INTO unidades (id, setor_id, nome, tipo) VALUES (7, 1, 'SPT-144', 'SONDA')");
		executarNoSchema("""
				INSERT INTO usuarios (username, tipo_usuario, nome, email, password, telefone, status, matricula)
				VALUES ('interno', 'INTERNO', 'Interno', 'interno@example.test', 'x', '71999999999', 'ATIVO', 1)""");
		executarNoSchema("INSERT INTO usuario_roles (username, role) VALUES "
				+ "('interno', 'INTERNO'), ('interno', 'DEPARTAMENTO_PESSOAL'), "
				+ "('interno', 'SISTEMA_GESTAO_INTEGRADA')");

		flyway().migrate();

		assertThat(contar("SELECT COUNT(*) FROM flyway_schema_history WHERE type = 'BASELINE' AND version = '2026.10.06.1'"))
				.isEqualTo(1);
		assertThat(contar("SELECT COUNT(*) FROM flyway_schema_history WHERE version = '2026.10.06.2' AND success = 1"))
				.isEqualTo(1);
		assertThat(contar("SELECT COUNT(*) FROM unidades WHERE id = 7 AND status = 'ATIVA'"))
				.as("a unidade movida continua la, e nasce ativa").isEqualTo(1);
		assertThat(contar("SELECT COUNT(*) FROM usuario_roles WHERE username = 'interno' AND role = 'INTERNO'"))
				.as("a role valida e preservada").isEqualTo(1);
		assertThat(contar("SELECT COUNT(*) FROM usuario_roles WHERE username = 'interno' "
				+ "AND role IN ('DEPARTAMENTO_PESSOAL', 'SISTEMA_GESTAO_INTEGRADA')"))
				.as("roles antigas sem regra de acesso sao removidas").isZero();
		assertThat(existeTabela("servicos_clientes")).isTrue();
	}

	@Test
	@DisplayName("status da unidade so aceita ATIVA ou INATIVA")
	void statusDaUnidade() throws SQLException {
		flyway().migrate();
		executarNoSchema("INSERT INTO regionais (id, nome) VALUES (1, 'Bahia')");
		executarNoSchema("INSERT INTO setores (id, regional_id, nome) VALUES (1, 1, 'Reconcavo')");
		executarNoSchema("INSERT INTO unidades (id, setor_id, nome, tipo, status) VALUES (7, 1, 'SPT-144', 'SONDA', 'INATIVA')");

		assertThatThrownBy(() -> executarNoSchema(
				"INSERT INTO unidades (id, setor_id, nome, tipo, status) VALUES (8, 1, 'SPT-145', 'SONDA', 'EXCLUIDA')"))
				.isInstanceOf(SQLException.class);
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

	/** Executa um script de migration direto, sem Flyway, como faria o script de movimentacao. */
	private void executarScript(String recurso) throws Exception {
		String sql;
		try (var entrada = getClass().getClassLoader().getResourceAsStream(recurso)) {
			sql = new String(entrada.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
		}
		String semComentarios = sql.replaceAll("(?m)^\\s*--.*$", "");
		for (String comando : semComentarios.split(";")) {
			if (!comando.isBlank()) {
				executarNoSchema(comando);
			}
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
