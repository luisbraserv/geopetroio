package com.example.demo.services;

import com.example.demo.models.ConfiguracaoSondaRemota;
import java.util.Optional;

/** Latest immutable snapshot, isolated by backend/unit and connection generation. */
public class ConfiguracaoRemotaState {
    private String backend;
    private Long unidade;
    private long generation;
    private ConfiguracaoSondaRemota current;
    public synchronized long conectar(String backend, Long unidade) {
        if (!java.util.Objects.equals(this.backend, backend) || !java.util.Objects.equals(this.unidade, unidade)) current = null;
        this.backend = backend; this.unidade = unidade;
        return ++generation;
    }
    public synchronized boolean aceitar(long connection, ConfiguracaoSondaRemota snapshot) {
        if (connection != generation || unidade == null || snapshot.unidadeSondaId() != unidade ||
            current != null && snapshot.revisao() <= current.revisao()) return false;
        current = snapshot; return true;
    }
    public synchronized Optional<ConfiguracaoSondaRemota> atual(String backend, Long unidade) {
        return java.util.Objects.equals(this.backend, backend) && java.util.Objects.equals(this.unidade, unidade) ? atual() : Optional.empty();
    }
    public synchronized Optional<ConfiguracaoSondaRemota> atual() { return Optional.ofNullable(current); }
}
