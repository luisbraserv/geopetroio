package com.geopetro.db;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Verifica as migrations contra um <b>MySQL real</b>, numa base descartavel — DT-002.
 *
 * <p><b>Por que MySQL e nao H2:</b> os scripts usam {@code information_schema}, {@code PREPARE} e
 * sintaxe de {@code ALTER} que o H2 nao reproduz. Rodar em H2 provaria que os scripts funcionam em
 * H2, que nao e onde eles vao rodar.
 *
 * <p><b>Pula quando nao ha MySQL alcancavel</b>, em vez de quebrar a suite: a maquina de quem
 * desenvolve tem o banco local de pe, e e la que este teste vale.
 *
 * <p><b>Nunca toca a base de desenvolvimento.</b> Cria e derruba um schema proprio a cada caso.
 */
class MigracaoFlywayTest {

	private static final String HOST = System.getenv().getOrDefault("DB_TEST_HOST", "localhost:3306");
	private static final String USUARIO = System.getenv().getOrDefault("DB_USERNAME", "root");
	private static final String SENHA = System.getenv().getOrDefault("DB_PASSWORD", "bilzao90");

	private static final String SCHEMA = "geopetro_io_migracao_teste";
	private static final String PARAMETROS = "?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC";

	private static final String URL_SERVIDOR = "jdbc:mysql://" + HOST + "/" + PARAMETROS;
	private static final String URL_SCHEMA = "jdbc:mysql://" + HOST + "/" + SCHEMA + PARAMETROS;

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

	private Flyway flyway() {
		return Flyway.configure()
				.dataSource(URL_SCHEMA, USUARIO, SENHA)
				.locations("classpath:db/migration")
				.baselineOnMigrate(true)
				.baselineVersion("2026.09.04")
				.validateOnMigrate(true)
				.cleanDisabled(true)
				.load();
	}

	// --- base nova ---------------------------------------------------------------

	@Test
	@DisplayName("base vazia: o baseline cria tudo e as migrations seguintes aplicam")
	void baseVaziaMigraDoZero() throws SQLException {
		flyway().migrate();

		assertThat(versoesAplicadas()).containsExactly("2026.09.04", "2026.09.05", "2026.09.06.1", "2026.09.06.2", "2026.09.06.3", "2026.09.07.1", "2026.09.07.2", "2026.09.07.3", "2026.09.07.4", "2026.09.09.1");
		assertThat(existeTabela("simulador_pocos")).isTrue();
        assertThat(existeTabela("recuperacao_senha")).isTrue();
        assertThat(existeTabela("configuracao_smtp")).isTrue();
        assertThat(existeTabela("configuracao_sonda")).isTrue();
        assertThat(existeTabela("evento_alarme")).isTrue();
        // serie e nula para card de uma grandeza so: NOT NULL aqui impediria todo evento que nao
        // viesse de um contador de stroke (RN-098).
        assertThat(colunaAceitaNulo("evento_alarme", "serie")).isTrue();
		assertThat(existeColuna("unidades_sondas", "tipo")).isTrue();
		assertThat(colunaAceitaNulo("unidades_sondas", "tipo")).isFalse();
		assertThat(existeColuna("simulador_cenarios", "poco_id")).isTrue();

		// RN-064: o vinculo organizacional sai no fim da cadeia.
		assertThat(existeColuna("usuarios", "regional_id")).isFalse();
		assertThat(existeTabela("usuario_interno_regionais")).isFalse();
		assertThat(existeTabela("usuario_interno_setores")).isFalse();
	}

	/**
	 * RN-086 — a coluna de role precisa aceitar SUPORTE nos dois ambientes.
	 *
	 * <p>Producao tem VARCHAR(255) desde V2026.06.04; uma base nova nascia com ENUM, porque o
	 * baseline veio das entidades JPA. Gravar 'SUPORTE' no ENUM falharia com "Data truncated".
	 */
	@Test
	@DisplayName("a coluna usuario_roles.role termina VARCHAR e aceita SUPORTE")
	void colunaDeRoleAceitaSuporte() throws SQLException {
		flyway().migrate();

		assertThat(tipoDaColuna("usuario_roles", "role")).isEqualTo("varchar");

		executarNoSchema("""
			INSERT INTO usuarios (username, password, email, nome, telefone, status, tipo_usuario)
			VALUES ('sup', 'hash', 'sup@example.test', 'Suporte', '1', 'ATIVO', 'INTERNO')""");
		executarNoSchema("INSERT INTO usuario_roles (username, role) VALUES ('sup', 'SUPORTE')");

		assertThat(contar("SELECT COUNT(*) FROM usuario_roles WHERE role = 'SUPORTE'")).isEqualTo(1L);
	}

	/**
	 * O ramo da migration que roda <b>em producao</b>: la a coluna ja e VARCHAR desde V2026.06.04,
	 * e o script deve passar sem tocar na tabela.
	 *
	 * <p>Sem este caso, so o ramo da base nova seria exercitado — e o {@code IF} da migration tem
	 * dois lados. Um erro no lado de producao so apareceria no deploy.
	 */
	@Test
	@DisplayName("base com role ja VARCHAR, como producao: a migration nao quebra nem altera")
	void colunaJaVarcharNaoEAlterada() throws SQLException {
		simularBaseAnteriorSemHistorico();
		// Reproduz o efeito de V2026.06.04, que rodou em producao e nao no baseline.
		executarNoSchema("ALTER TABLE usuario_roles MODIFY COLUMN role VARCHAR(255) "
				+ "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL");

		flyway().migrate();

		assertThat(tipoDaColuna("usuario_roles", "role")).isEqualTo("varchar");
		// A collation de producao sobrevive: a migration nao declara uma propria.
		assertThat(collationDaColuna("usuario_roles", "role")).isEqualTo("utf8mb4_unicode_ci");
	}

	@Test
	@DisplayName("migrar de novo nao muda nada — o historico impede reexecucao")
	void migrarDuasVezesEIdempotente() throws SQLException {
		flyway().migrate();
		List<String> primeira = versoesAplicadas();

		flyway().migrate();

		assertThat(versoesAplicadas()).isEqualTo(primeira);
	}

	// --- base que ja existe ------------------------------------------------------

	/**
	 * Deixa o schema como producao esta hoje: estrutura anterior presente e <b>sem</b> historico do
	 * Flyway. Aplica o proprio baseline e depois apaga a tabela de controle — assim o cenario usa o
	 * mesmo SQL que roda de verdade, em vez de uma imitacao escrita a mao no teste.
	 */
	private void simularBaseAnteriorSemHistorico() throws SQLException {
		Flyway.configure()
				.dataSource(URL_SCHEMA, USUARIO, SENHA)
				.locations("classpath:db/migration")
				.target("2026.09.04")
				.load()
				.migrate();
		executarNoSchema("DROP TABLE flyway_schema_history");
	}

	@Test
	@DisplayName("base existente: o baseline e MARCADO, nao executado, e a migracao comeca em 2026.09.05")
	void baseExistenteNaoReexecutaOBaseline() throws SQLException {
		simularBaseAnteriorSemHistorico();

		flyway().migrate();

		// Se o baseline tivesse sido executado, os CREATE TABLE teriam colidido e a migracao
		// falharia. Ele entra so como registro.
		assertThat(versoesAplicadas()).containsExactly("2026.09.04", "2026.09.05", "2026.09.06.1", "2026.09.06.2", "2026.09.06.3", "2026.09.07.1", "2026.09.07.2", "2026.09.07.3", "2026.09.07.4", "2026.09.09.1");
		assertThat(tipoDoRegistro("2026.09.04")).isEqualTo("BASELINE");
		assertThat(tipoDoRegistro("2026.09.05")).isEqualTo("SQL");

		// E o efeito das migrations chegou mesmo na base que ja existia.
		assertThat(existeColuna("unidades_sondas", "tipo")).isTrue();
		assertThat(existeColuna("usuarios", "regional_id")).isFalse();
	}

	@Test
	@DisplayName("base onde simulador_pocos ja existe por acidente do ddl-auto nao quebra")
	void tolerarEstruturaCriadaPeloHibernate() throws SQLException {
		simularBaseAnteriorSemHistorico();

		// Foi o que aconteceu no MySQL local em 2026-09-06: a suite subiu o perfil dev com
		// ddl-auto=update e o Hibernate criou a estrutura sem ninguem rodar migration.
		executarNoSchema("""
				CREATE TABLE simulador_pocos (
				  id BIGINT NOT NULL AUTO_INCREMENT,
				  version BIGINT NOT NULL,
				  nome VARCHAR(255) NOT NULL,
				  geometria LONGTEXT NOT NULL,
				  atualizado_por VARCHAR(255) NOT NULL,
				  atualizado_em DATETIME(6) NOT NULL,
				  PRIMARY KEY (id)
				) ENGINE=InnoDB""");
		executarNoSchema("ALTER TABLE simulador_cenarios ADD COLUMN poco_id BIGINT NULL");

		flyway().migrate();

		assertThat(versoesAplicadas()).contains("2026.09.05");
		assertThat(existeTabela("simulador_pocos")).isTrue();
        assertThat(existeTabela("recuperacao_senha")).isTrue();
        assertThat(existeTabela("configuracao_smtp")).isTrue();
        assertThat(existeTabela("configuracao_sonda")).isTrue();
		assertThat(existeColuna("simulador_cenarios", "poco_id")).isTrue();
	}

	@Test
	@DisplayName("rodar a migration de vinculo numa base que ja nao os tem nao quebra")
	void dropDeVinculoJaAusenteNaoQuebra() throws SQLException {
        Flyway.configure().dataSource(URL_SCHEMA, USUARIO, SENHA)
            .locations("classpath:db/migration").target("2026.09.06.2").load().migrate();

		// A guarda do script protege quem aplicou o SQL a mao antes do Flyway existir:
		// reaplicar o DROP num schema que ja nao tem a coluna nem as tabelas e inofensivo.
		executarNoSchema("DELETE FROM flyway_schema_history WHERE version = '2026.09.06.2'");
		flyway().repair();
		flyway().migrate();

		assertThat(existeColuna("usuarios", "regional_id")).isFalse();
	}

    @Test
    void recuperacaoMantemIntegridadeEPermiteTokensConsumidos() throws SQLException {
        flyway().migrate();
        executarNoSchema("""
            INSERT INTO usuarios (username, password, email, nome, telefone, status, tipo_usuario)
            VALUES ('recovery-a', 'test-hash', 'a@example.test', 'A', '1', 'ATIVO', 'INTERNO'),
                   ('recovery-b', 'test-hash', 'b@example.test', 'B', '2', 'ATIVO', 'INTERNO')
            """);
        String insert = "INSERT INTO recuperacao_senha (username, token_hash, credential_hash, issued_at, expires_at) VALUES ";
        executarNoSchema(insert + "('recovery-a', REPEAT('a',64), REPEAT('b',64), NOW(6), NOW(6))");
        org.junit.jupiter.api.Assertions.assertThrows(SQLException.class, () ->
            executarNoSchema(insert + "('recovery-b', REPEAT('a',64), REPEAT('b',64), NOW(6), NOW(6))"));
        org.junit.jupiter.api.Assertions.assertThrows(SQLException.class, () ->
            executarNoSchema(insert + "('missing-user', REPEAT('c',64), REPEAT('b',64), NOW(6), NOW(6))"));
        executarNoSchema("UPDATE recuperacao_senha SET token_hash = NULL WHERE username = 'recovery-a'");
        executarNoSchema(insert + "('recovery-b', NULL, REPEAT('b',64), NOW(6), NOW(6))");
        assertThat(contar("SELECT COUNT(*) FROM recuperacao_senha")).isEqualTo(2);
        executarNoSchema("DELETE FROM usuarios WHERE username = 'recovery-a'");
        assertThat(contar("SELECT COUNT(*) FROM recuperacao_senha")).isEqualTo(1);
    }

    @Test
    void configuracaoSmtpMigraDaRecuperacaoSemAlterarDadosEImpedeMaisDeUmRegistro() throws SQLException {
        Flyway.configure().dataSource(URL_SCHEMA, USUARIO, SENHA)
            .locations("classpath:db/migration").target("2026.09.06.3").load().migrate();
        flyway().migrate();
        assertThat(existeTabela("configuracao_smtp")).isTrue();
        assertThat(existeTabela("configuracao_sonda")).isTrue();
        assertThat(colunaAceitaNulo("configuracao_smtp", "password_encrypted")).isTrue();
        assertThat(contar("SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '" + SCHEMA
            + "' AND TABLE_NAME = 'configuracao_smtp' AND COLUMN_NAME = 'password_encrypted'")).isEqualTo(8192);
        String insert = """
            INSERT INTO configuracao_smtp
            (id, version, enabled, host, port, transport, auth, username, password_encrypted, sender_address, frontend_url)
            VALUES
            """;
        executarNoSchema(insert + "(1, 0, false, 'smtp.example.test', 587, 'STARTTLS', false, '', NULL, '', '')");
        org.junit.jupiter.api.Assertions.assertThrows(SQLException.class, () ->
            executarNoSchema(insert + "(2, 0, false, 'smtp.example.test', 587, 'STARTTLS', false, '', NULL, '', '')"));
        org.junit.jupiter.api.Assertions.assertThrows(SQLException.class, () ->
            executarNoSchema("UPDATE configuracao_smtp SET port = 70000 WHERE id = 1"));
        flyway().migrate();
        assertThat(contar("SELECT COUNT(*) FROM configuracao_smtp")).isEqualTo(1);
    }

    @Test
    void configuracaoSondaPreservaUnidadeNaMigracaoEProtegeVinculo() throws SQLException {
        Flyway.configure().dataSource(URL_SCHEMA, USUARIO, SENHA)
            .locations("classpath:db/migration").target("2026.09.07.1").load().migrate();
        executarNoSchema("INSERT INTO regionais (id, nome) VALUES (7, 'Teste')");
        executarNoSchema("INSERT INTO setores (id, nome, regional_id) VALUES (7, 'Teste', 7)");
        executarNoSchema("INSERT INTO unidades_sondas (id, nome, setor_id, tipo) VALUES (7, 'Teste', 7, 'SONDA')");
        flyway().migrate();
        assertThat(contar("SELECT COUNT(*) FROM unidades_sondas WHERE id = 7")).isEqualTo(1);
        String insert = "INSERT INTO configuracao_sonda (unidade_sonda_id, version, limites_json, atualizado_por, atualizado_em) VALUES ";
        executarNoSchema(insert + "(7, 0, '[]', 'ana', NOW(6))");
        org.junit.jupiter.api.Assertions.assertThrows(SQLException.class, () -> executarNoSchema(insert + "(8, 0, '[]', 'ana', NOW(6))"));
        org.junit.jupiter.api.Assertions.assertThrows(SQLException.class, () -> executarNoSchema(insert + "(7, 0, '[]', 'ana', NOW(6))"));
        org.junit.jupiter.api.Assertions.assertThrows(SQLException.class, () -> executarNoSchema("DELETE FROM unidades_sondas WHERE id = 7"));
        flyway().migrate();
        assertThat(contar("SELECT COUNT(*) FROM configuracao_sonda WHERE unidade_sonda_id = 7 AND version = 0")).isEqualTo(1);
    }

	// --- utilitarios -------------------------------------------------------------

	private static boolean servidorDisponivel() {
		try (Connection ignored = DriverManager.getConnection(URL_SERVIDOR, USUARIO, SENHA)) {
			return true;
		} catch (SQLException e) {
			return false;
		}
	}

	private static void executarNoServidor(String sql) throws SQLException {
		try (Connection conexao = DriverManager.getConnection(URL_SERVIDOR, USUARIO, SENHA);
				Statement statement = conexao.createStatement()) {
			statement.execute(sql);
		}
	}

	private static void executarNoSchema(String sql) throws SQLException {
		try (Connection conexao = DriverManager.getConnection(URL_SCHEMA, USUARIO, SENHA);
				Statement statement = conexao.createStatement()) {
			statement.execute(sql);
		}
	}

	private static List<String> versoesAplicadas() throws SQLException {
		List<String> versoes = new ArrayList<>();
		try (Connection conexao = DriverManager.getConnection(URL_SCHEMA, USUARIO, SENHA);
				Statement statement = conexao.createStatement();
				ResultSet rs = statement.executeQuery(
						"SELECT version FROM flyway_schema_history WHERE success = 1 ORDER BY installed_rank")) {
			while (rs.next()) {
				versoes.add(rs.getString(1));
			}
		}
		return versoes;
	}

	private static String tipoDoRegistro(String versao) throws SQLException {
		try (Connection conexao = DriverManager.getConnection(URL_SCHEMA, USUARIO, SENHA);
				Statement statement = conexao.createStatement();
				ResultSet rs = statement.executeQuery(
						"SELECT type FROM flyway_schema_history WHERE version = '" + versao + "'")) {
			return rs.next() ? rs.getString(1) : null;
		}
	}

	private static String tipoDaColuna(String tabela, String coluna) throws SQLException {
		try (Connection conexao = DriverManager.getConnection(URL_SCHEMA, USUARIO, SENHA);
				Statement statement = conexao.createStatement();
				ResultSet rs = statement.executeQuery(
						"SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '" + SCHEMA
								+ "' AND TABLE_NAME = '" + tabela + "' AND COLUMN_NAME = '" + coluna + "'")) {
			return rs.next() ? rs.getString(1) : null;
		}
	}

	private static String collationDaColuna(String tabela, String coluna) throws SQLException {
		try (Connection conexao = DriverManager.getConnection(URL_SCHEMA, USUARIO, SENHA);
				Statement statement = conexao.createStatement();
				ResultSet rs = statement.executeQuery(
						"SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '" + SCHEMA
								+ "' AND TABLE_NAME = '" + tabela + "' AND COLUMN_NAME = '" + coluna + "'")) {
			return rs.next() ? rs.getString(1) : null;
		}
	}

	private static boolean existeTabela(String tabela) throws SQLException {
		return contar("SELECT COUNT(*) FROM information_schema.TABLES"
				+ " WHERE TABLE_SCHEMA = '" + SCHEMA + "' AND TABLE_NAME = '" + tabela + "'") > 0;
	}

	private static boolean existeColuna(String tabela, String coluna) throws SQLException {
		return contar("SELECT COUNT(*) FROM information_schema.COLUMNS"
				+ " WHERE TABLE_SCHEMA = '" + SCHEMA + "' AND TABLE_NAME = '" + tabela + "'"
				+ " AND COLUMN_NAME = '" + coluna + "'") > 0;
	}

	private static boolean colunaAceitaNulo(String tabela, String coluna) throws SQLException {
		return contar("SELECT COUNT(*) FROM information_schema.COLUMNS"
				+ " WHERE TABLE_SCHEMA = '" + SCHEMA + "' AND TABLE_NAME = '" + tabela + "'"
				+ " AND COLUMN_NAME = '" + coluna + "' AND IS_NULLABLE = 'YES'") > 0;
	}

	private static long contar(String sql) throws SQLException {
		try (Connection conexao = DriverManager.getConnection(URL_SCHEMA, USUARIO, SENHA);
				Statement statement = conexao.createStatement();
				ResultSet rs = statement.executeQuery(sql)) {
			return rs.next() ? rs.getLong(1) : 0L;
		}
	}
}
