package com.geopetro.configuracaosonda;

import java.time.Instant;
import java.util.*;
import com.geopetro.core.exception.BusinessException;
import org.springframework.http.HttpStatus;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.*;
import tools.jackson.databind.json.JsonMapper;
import static com.geopetro.configuracaosonda.ConfiguracaoSonda.*;

@Service
public class ConfiguracaoSondaService {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final ConfiguracaoSondaRepository repository;
    private final ConfiguracaoSondaAccess access;
    private final SimpMessagingTemplate messages;
    public ConfiguracaoSondaService(ConfiguracaoSondaRepository repository, ConfiguracaoSondaAccess access, SimpMessagingTemplate messages) {
        this.repository = repository; this.access = access; this.messages = messages;
    }
    @Transactional(readOnly = true) public ConfiguracaoSonda ler(String username, long id) {
        access.exigir(username, id);
        return repository.findById(id).map(this::dto).orElseGet(() -> new ConfiguracaoSonda(1, id, 0, List.of(), null, null));
    }
    @Transactional public ConfiguracaoSonda salvar(String username, long id, Alteracao update) {
        access.exigir(username, id); validar(update);
        var entity = repository.findById(id).orElse(null);
        if (update.revisao() != (entity == null ? 0 : entity.version + 1)) throw conflict();
        if (entity == null) { entity = new ConfiguracaoSondaEntity(); entity.unidadeSondaId = id; }
        entity.limitesJson = JSON.writeValueAsString(update.limites());
        entity.atualizadoPor = username; entity.atualizadoEm = Instant.now();
        ConfiguracaoSonda snapshot;
        try { snapshot = dto(repository.saveAndFlush(entity)); }
        catch (DataIntegrityViolationException e) { throw conflict(); }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() {
                try { messages.convertAndSend("/topic/config/unidades-sondas/" + id, snapshot); }
                catch (RuntimeException e) {
                    org.slf4j.LoggerFactory.getLogger(ConfiguracaoSondaService.class).warn("Configuracao salva; publicacao indisponivel. Clientes recuperam o snapshot na sincronizacao.");
                }
            }
        });
        return snapshot;
    }
    private ConfiguracaoSonda dto(ConfiguracaoSondaEntity e) {
        return new ConfiguracaoSonda(1, e.unidadeSondaId, e.version + 1,
            Arrays.asList(JSON.readValue(e.limitesJson, Limite[].class)), e.atualizadoPor, e.atualizadoEm);
    }
    private BusinessException conflict() { return new BusinessException("A configuracao foi alterada. Recarregue antes de salvar.", HttpStatus.CONFLICT); }
}
