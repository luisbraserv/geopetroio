package com.geopetro.desktop.telemetria;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import com.geopetro.desktop.configuracoes.SettingsService;

/** O canal precisa funcionar mesmo antes de conectar o CLP. */
@Component
public class CanalConfiguracaoLifecycle {
    private final SettingsService settings;
    private final TelemetriaRealtimeService realtime;
    public CanalConfiguracaoLifecycle(SettingsService settings, TelemetriaRealtimeService realtime) {
        this.settings = settings; this.realtime = realtime;
    }
    @EventListener({ApplicationReadyEvent.class, SettingsService.Alteradas.class})
    public void atualizar() { realtime.atualizarConfiguracao(settings.loadSettings()); }
}
