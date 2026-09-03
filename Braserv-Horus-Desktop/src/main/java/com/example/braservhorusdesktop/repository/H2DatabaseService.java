package com.example.braservhorusdesktop.repository;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;

import com.example.braservhorusdesktop.model.RegistroOperacao;

public class H2DatabaseService {

    private static final String URL = "jdbc:h2:./data/operacao;AUTO_SERVER=TRUE";
    private static final String USER = "sa";
    private static final String PASS = "";

    public H2DatabaseService() {
        criarTabelaSeNecessario();
    }

    private void criarTabelaSeNecessario() {
        String sql = """
                CREATE TABLE IF NOT EXISTS registro_operacao (
                    id IDENTITY PRIMARY KEY,
                    timestamp TIMESTAMP,
                    pressao DOUBLE,
                    stroke_atual BIGINT,
                    stroke_cumulativo BIGINT,
                    vazao DOUBLE,
                    volume DOUBLE
                )
                """;

        try (Connection conn = DriverManager.getConnection(URL, USER, PASS);
             PreparedStatement ps = conn.prepareStatement(sql)) {

            ps.execute();

        } catch (Exception e) {
            System.out.println("[H2] Erro ao criar tabela: " + e.getMessage());
        }
    }

    public void salvar(RegistroOperacao registro) {
        String sql = """
                INSERT INTO registro_operacao
                (
                    timestamp,
                    pressao,
                    stroke_atual,
                    stroke_cumulativo,
                    vazao,
                    volume
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """;

        try (Connection conn = DriverManager.getConnection(URL, USER, PASS);
             PreparedStatement ps = conn.prepareStatement(sql)) {

            ps.setObject(1, registro.getTimestamp());
            ps.setDouble(2, registro.getPressao());
            ps.setLong(3, registro.getStrokeAtual());
            ps.setLong(4, registro.getStrokeCumulativo());
            ps.setDouble(5, registro.getVazaoAtual());
            ps.setDouble(6, registro.getVolumeBombeado());

            ps.executeUpdate();

        } catch (Exception e) {
            System.out.println("[H2] Erro ao salvar registro: " + e.getMessage());
        }
    }
}