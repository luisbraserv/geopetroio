package com.example.demo.services;

import com.example.demo.models.ConfiguracaoSondaRemota;
import java.util.Optional;

/**
 * Latest immutable snapshot, isolated by backend/unit and connection generation.
 *
 * <p>Respaldado por {@link ConfiguracaoRemotaStore}: o ultimo snapshot valido sobrevive ao
 * reinicio do app — RN-088. Sem isso, um Desktop que reinicia sem rede nao saberia o que ler.
 */
public class ConfiguracaoRemotaState {
    private final ConfiguracaoRemotaStore store;
    private String backend;
    private Long unidade;
    private long generation;
    private ConfiguracaoSondaRemota current;

    public ConfiguracaoRemotaState() { this(new ConfiguracaoRemotaStore()); }

    public ConfiguracaoRemotaState(ConfiguracaoRemotaStore store) { this.store = store; }

    /**
     * Troca de servidor, usuario ou unidade descarta o que estava em memoria. Em seguida, se nao
     * houver nada, tenta o disco: e o caminho de quem acabou de abrir o app.
     *
     * <p>O snapshot restaurado entra como {@code current}, entao {@link #aceitar} continua
     * exigindo revisao <b>maior</b> para substitui-lo — um snapshot atrasado que chegue depois
     * nao regride a configuracao.
     */
    public synchronized long conectar(String backend, Long unidade) {
        if (!java.util.Objects.equals(this.backend, backend) || !java.util.Objects.equals(this.unidade, unidade)) current = null;
        this.backend = backend; this.unidade = unidade;
        if (current == null && store != null) current = store.carregar(backend, unidade).orElse(null);
        return ++generation;
    }

    public synchronized boolean aceitar(long connection, ConfiguracaoSondaRemota snapshot) {
        if (connection != generation || unidade == null || snapshot.unidadeSondaId() != unidade ||
            current != null && snapshot.revisao() <= current.revisao()) return false;
        current = snapshot;
        if (store != null) store.gravar(backend, unidade, snapshot);
        return true;
    }

    public synchronized Optional<ConfiguracaoSondaRemota> atual(String backend, Long unidade) {
        return java.util.Objects.equals(this.backend, backend) && java.util.Objects.equals(this.unidade, unidade) ? atual() : Optional.empty();
    }

    public synchronized Optional<ConfiguracaoSondaRemota> atual() { return Optional.ofNullable(current); }
}
