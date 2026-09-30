package com.geopetro.alarmes;

import java.lang.reflect.Proxy;
import java.time.Instant;
import java.util.*;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.transaction.*;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import com.geopetro.config.ApiExceptionHandler;
import com.geopetro.configuracaosonda.ConfiguracaoSonda.Limite;
import com.geopetro.configuracaosonda.LimitesDeclarados;
import com.geopetro.realtime.dto.EstadoRealtimeDTO.LeituraRealtimeDTO;

/** Read-only audit reproducer. Uses the project's compiled classes and in-memory collaborators. */
public class AlarmAuditProbe {
    static final List<EventoAlarmeEntity> stored = new ArrayList<>();
    static final Limite limit = new Limite("PRESSAO_01", null, null, 100.0, null, 120.0, 0, 0, true);
    static final LimitesDeclarados limits = new LimitesDeclarados(null) {
        @Override public List<Limite> de(long id) { return List.of(limit); }
    };
    static final EventoAlarmeRepository repo = (EventoAlarmeRepository) Proxy.newProxyInstance(
        EventoAlarmeRepository.class.getClassLoader(), new Class<?>[]{EventoAlarmeRepository.class},
        (proxy, method, args) -> {
            if (method.getName().equals("saveAll")) {
                for (Object value : (Iterable<?>) args[0]) {
                    var entity = (EventoAlarmeEntity) value;
                    entity.id = (long) stored.size() + 1;
                    stored.add(entity);
                }
                return stored;
            }
            if (method.getName().equals("fatosDosEpisodiosAbertos")) return List.copyOf(stored);
            throw new UnsupportedOperationException(method.getName());
        });
    static LeituraRealtimeDTO reading(double value) {
        return new LeituraRealtimeDTO("PRESSAO_01", null, "PRESSAO", "psi", "DBW0", value, null);
    }
    static void check(String label, boolean reproduced, Object actual) {
        if (!reproduced) throw new AssertionError("Not reproduced: " + label + " = " + actual);
        System.out.println("REPRODUCED | " + label + " | " + actual);
    }
    public static void main(String[] args) throws Exception {
        var motor = new MotorDeAlarmes(repo, limits);
        motor.avaliar(1, List.of(reading(130)));
        motor.avaliar(1, List.of(reading(200)));
        double peak = motor.ativos(1).getFirst().valorExtremo();
        var restarted = new MotorDeAlarmes(repo, limits);
        restarted.reconstruirProjecao();
        check("restart loses measured peak", peak == 200 && restarted.ativos(1).getFirst().valorExtremo() == 130,
            "before=200; after=" + restarted.ativos(1).getFirst().valorExtremo());
        motor.avaliar(1, List.of(reading(90)));
        var episode = EpisodioAlarme.de(stored.stream().map(EventoAlarmeEntity::paraDominio).toList());
        check("history loses measured peak", episode.valorExtremo() == 130, "measured=200; history=" + episode.valorExtremo());

        stored.clear();
        motor = new MotorDeAlarmes(repo, limits);
        motor.avaliar(1, List.of(reading(130), reading(130)));
        check("duplicate identity in one cycle opens two episodes", stored.size() == 2 &&
            !stored.get(0).episodioId.equals(stored.get(1).episodioId), "events=" + stored.size() + "; active=" + motor.ativos(1).size());

        stored.clear();
        motor = new MotorDeAlarmes(repo, limits);
        var tx = new AbstractPlatformTransactionManager() {
            protected Object doGetTransaction() { return new Object(); }
            protected void doBegin(Object transaction, TransactionDefinition definition) { }
            protected void doRollback(DefaultTransactionStatus status) { stored.clear(); }
            protected void doCommit(DefaultTransactionStatus status) {
                stored.clear();
                throw new UnexpectedRollbackException("injected commit failure");
            }
        };
        var factory = new ProxyFactory(motor);
        var interceptor = new TransactionInterceptor();
        interceptor.setTransactionManager(tx);
        interceptor.setTransactionAttributeSource(new AnnotationTransactionAttributeSource());
        factory.addAdvice(interceptor);
        var transactional = (MotorDeAlarmes) factory.getProxy();
        try { transactional.avaliar(1, List.of(reading(130))); }
        catch (UnexpectedRollbackException expected) { }
        check("commit failure leaves nonpersistent active alarm", stored.isEmpty() && motor.ativos(1).size() == 1,
            "stored=" + stored.size() + "; active=" + motor.ativos(1).size());

        var mvc = MockMvcBuilders.standaloneSetup(new AlarmesController(motor, null, null))
            .setControllerAdvice(new ApiExceptionHandler()).build();
        int missing = mvc.perform(get("/api/sondas/1/alarmes/historico")).andReturn().getResponse().getStatus();
        check("missing required interval returns server error", missing == 500, "HTTP=" + missing);
        int invalid = mvc.perform(get("/api/sondas/1/alarmes/historico")
            .param("inicio", "invalid").param("fim", "2026-09-09T12:00:00Z"))
            .andReturn().getResponse().getStatus();
        check("invalid interval format returns server error", invalid == 500, "HTTP=" + invalid);
    }
}
