package com.geopetro.configuracaosonda;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;
import com.geopetro.cards.CardsDeclarados;
import com.geopetro.cards.GrandezasDeCard;
import com.geopetro.cards.GrandezasDeCard.Grandeza;
import com.geopetro.comum.exception.BusinessException;
import org.springframework.http.HttpStatus;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import static com.geopetro.configuracaosonda.ConfiguracaoSonda.*;

@Service
public class ConfiguracaoSondaService {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final ConfiguracaoSondaRepository repository;
    private final ConfiguracaoSondaAccess access;
    private final CardsDeclarados cards;
    public ConfiguracaoSondaService(ConfiguracaoSondaRepository repository, ConfiguracaoSondaAccess access,
            CardsDeclarados cards) {
        this.repository = repository; this.access = access; this.cards = cards;
    }
    @Transactional(readOnly = true) public ConfiguracaoSonda ler(String username, long id) {
        access.exigir(username, id);
        return repository.findById(id).map(this::dto).orElseGet(() -> new ConfiguracaoSonda(1, id, 0, List.of(), null, null));
    }
    @Transactional public ConfiguracaoSonda salvar(String username, long id, Alteracao update) {
        access.exigir(username, id); access.exigirUnidadeExistente(id); validar(update, grandezasDeclaradas(id));
        var entity = repository.findById(id).orElse(null);
        if (update.revisao() != (entity == null ? 0 : entity.version + 1)) throw conflict();
        if (entity == null) { entity = new ConfiguracaoSondaEntity(); entity.unidadeId = id; }
        entity.limitesJson = JSON.writeValueAsString(update.limites());
        entity.atualizadoPor = username; entity.atualizadoEm = Instant.now();
        ConfiguracaoSonda snapshot;
        try { snapshot = dto(repository.saveAndFlush(entity)); }
        catch (DataIntegrityViolationException e) { throw conflict(); }
        // ⚠️ Nao ha publicacao em tempo real deste documento, e nao e esquecimento.
        //
        // Ele existia para o Desktop, que assinava /topic/config/unidades/{id} e avaliava os
        // limites localmente. Em 2026-09-09 o alarme da estacao passou a ser configurado na estacao
        // (configuracao-da-estacao.md §3.3) e a assinatura saiu; o Front nunca assinou — le e grava
        // por REST. O topico ficou sem assinante nenhum e foi removido junto.
        //
        // O documento continua VIVO e e lido a cada ciclo de tempo real por MotorDeAlarmes, que e
        // quem alarma no servidor (RN-102). Quem o altera aqui ja o ve na proxima avaliacao.
        return snapshot;
    }
    /**
     * O vocabulário desta unidade — RN-089.
     *
     * <p>Lido sem passar pela porta autorizada de cards de propósito: o acesso já foi exigido acima
     * com a regra dos <b>limites</b>, que é mais ampla. Ver {@link CardsDeclarados}.
     *
     * <p>Unidade ainda não configurada devolve conjunto vazio, e aí toda tentativa de gravar um
     * limite é recusada com o motivo — que é a resposta certa: não há grandeza para vigiar.
     */
    private Set<String> grandezasDeclaradas(long id) {
        return GrandezasDeCard.declaradas(cards.de(id)).stream().map(Grandeza::chave).collect(Collectors.toSet());
    }
    private ConfiguracaoSonda dto(ConfiguracaoSondaEntity e) {
        return new ConfiguracaoSonda(1, e.unidadeId, e.version + 1,
            Arrays.asList(JSON.readValue(e.limitesJson, Limite[].class)), e.atualizadoPor, e.atualizadoEm);
    }
    private BusinessException conflict() { return new BusinessException("A configuracao foi alterada. Recarregue antes de salvar.", HttpStatus.CONFLICT); }
}
