package com.geopetro.desktop.services;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.geopetro.desktop.models.AppSettings;
import com.geopetro.desktop.models.CardsDaUnidade;
import com.geopetro.desktop.models.CardsDaUnidade.*;
import com.geopetro.desktop.models.PesoColunaConfig;
import com.geopetro.desktop.repositories.LeituraLocalRepository;
import com.sourceforge.snap7.moka7.S7;
import com.sourceforge.snap7.moka7.S7Client;

class PlcConnectionServiceTest {
    private final S7Client driver = mock(S7Client.class);
    private final SettingsService settingsService = mock(SettingsService.class);
    private final TelemetriaRealtimeService realtime = mock(TelemetriaRealtimeService.class);
    private final TelemetriaMqttService mqtt = mock(TelemetriaMqttService.class);
    private final LeituraLocalRepository historico = mock(LeituraLocalRepository.class);
    private final CalibracaoDeCards calibracoes = mock(CalibracaoDeCards.class);
    private final SondaService sonda = new SondaService();
    private final AtomicReference<CardsDaUnidade> documento = new AtomicReference<>();
    private PlcConnectionService plc;

    private CardsDaUnidade documento(Conexao conexao) {
        return new CardsDaUnidade(1, 2, 8, conexao, List.of(
                new Card("CONTADOR_STROKE_01", "Bomba 01", Tipo.CONTADOR_STROKE, 0, true, true, 0,
                        new Parametros(null, null, null, null, null, null, null, null, null, null, null, .0324)),
                new Card("PESO_01", "Peso Tubo", Tipo.PESO, 4, true, true, 1,
                        new Parametros(400., null, null, null, null, null, null, null, null, null, null, null))),
                null, null);
    }

    @BeforeEach void preparar() {
        documento.set(documento(new Conexao("192.168.0.3", 0, 1, 1, 1000)));
        var settings = new AppSettings();
        settings.setUnidadeId(2L);
        settings.setBackendUrl("http://servidor");
        when(settingsService.loadSettings()).thenReturn(settings);
        when(realtime.cardsAtuais(settings)).thenAnswer(call -> Optional.of(documento.get()));
        var peso = new PesoColunaConfig();
        peso.setAreaEfetivaSensorPol2(2); peso.setBracoSensorPol(7);
        peso.setDiametroTamborPol(3); peso.setDiametroCaboPol(3);
        peso.setNumeroLinhas(10); peso.setPesoCatarinaLbf(1400); peso.setFatorCalibracao(1);
        when(calibracoes.para(anyString())).thenReturn(new CalibracaoDeCards.Calibracao(1, peso, null));
        var strokes = new StrokeCalculatorService();
        var vazoes = new FlowRateCalculatorService();
        plc = new PlcConnectionService(settingsService, strokes, vazoes, historico, sonda, mqtt,
                realtime, new LeituraDeCards(calibracoes, strokes, vazoes), calibracoes, mock(AlarmesLocais.class)) {
            @Override S7Client criarCliente() { return driver; }
            @Override void startReading(int intervaloMs) { /* ciclos dirigidos pelo teste */ }
        };
        when(driver.ReadArea(eq(S7.S7AreaDB), eq(1), eq(0), eq(6), any(byte[].class)))
                .thenAnswer(call -> {
                    byte[] buffer = call.getArgument(4);
                    // DBD0=123 e DBW4=350, no formato big-endian do LOGO.
                    System.arraycopy(new byte[]{0, 0, 0, 123, 1, 94}, 0, buffer, 0, 6);
                    return 0;
                });
    }

    @Test void primeiraLeituraPercorreDbConversaoTelaHistoricoETelemetria() {
        plc.setStatusListener(conectado -> {
            if (conectado) assertEquals(4, sonda.grandezas(documento.get()).size(),
                    "só sinalizar conectado depois que os dados chegaram");
        });
        assertInstanceOf(PlcConnectionService.Resultado.Conectado.class, plc.connectUsingSavedIp());
        assertTrue(plc.isConnected());
        assertNotNull(plc.getUltimaLeitura());
        assertEquals(123L, sonda.getValorBruto(0));
        assertEquals(350L, sonda.getValorBruto(4));
        var grandezas = sonda.grandezas(documento.get());
        assertEquals(4, grandezas.size());
        assertTrue(grandezas.stream().allMatch(LeituraDeCards.Grandeza::temValor));
        assertEquals(123 * .0324, grandezas.stream().filter(g -> "volumeAcumulado".equals(g.serie()))
                .findFirst().orElseThrow().valor(), .000001);
        verify(historico).saveAll(argThat(linhas -> ((List<?>) linhas).size() == 4));
        verify(mqtt).enviarLeitura(any(), argThat(leituras -> leituras.size() == 4));
        verify(realtime).publicarEstado(any(), any());
    }

    @Test void sessaoAbertaComDbRecusadoNaoInformaSucesso() {
        when(driver.ReadArea(anyInt(), anyInt(), anyInt(), anyInt(), any(byte[].class)))
                .thenReturn(S7Client.errS7DataRead);
        var falha = assertInstanceOf(PlcConnectionService.Resultado.Falhou.class, plc.connectUsingSavedIp());
        assertTrue(falha.motivo().contains("DB1, bytes 0 a 5"));
        assertFalse(plc.isConnected());
        assertNull(plc.getUltimaLeitura());
        verify(driver).Disconnect();
        verifyNoInteractions(mqtt, historico);
    }

    @Test void timeoutDeConexaoExplicaEnderecoENaoTentaLer() {
        when(driver.ConnectTo(anyString(), anyInt(), anyInt())).thenReturn(S7Client.errTCPConnectionFailed);
        var falha = assertInstanceOf(PlcConnectionService.Resultado.Falhou.class, plc.connectUsingSavedIp());
        assertTrue(falha.motivo().contains("192.168.0.3:102"));
        verify(driver, never()).ReadArea(anyInt(), anyInt(), anyInt(), anyInt(), any());
    }

    @Test void falhaNumCicloLimpaDadosAntigosEConservaMotivo() {
        plc.connectUsingSavedIp();
        when(driver.ReadArea(anyInt(), anyInt(), anyInt(), anyInt(), any(byte[].class)))
                .thenReturn(S7Client.errTCPDataRecvTout);
        plc.readAll();
        assertFalse(plc.isConnected());
        assertTrue(plc.getUltimoErro().contains("Código S7"));
        assertTrue(sonda.grandezas(documento.get()).isEmpty());
        assertNull(sonda.getValorBruto(4));
    }

    @Test void falhaDePublicacaoNaoDerrubaLeituraLocalNemOutroCanal() {
        doThrow(new IllegalStateException("MQTT fora")).when(mqtt).enviarLeitura(any(), anyList());
        doThrow(new IllegalStateException("Backend fora")).when(realtime).publicarEstado(any(), any());
        assertInstanceOf(PlcConnectionService.Resultado.Conectado.class, plc.connectUsingSavedIp());
        plc.readAll();
        assertTrue(plc.isConnected());
        assertEquals(350L, sonda.getValorBruto(4));
        verify(realtime, times(2)).publicarEstado(any(), any());
    }

    @Test void trocarIpExigeNovaSessaoAntesDeLerMaisDados() {
        plc.connectUsingSavedIp();
        documento.set(documento(new Conexao("192.168.0.9", 0, 1, 1, 1000)));
        plc.readAll();
        assertFalse(plc.isConnected());
        assertTrue(plc.getUltimoErro().contains("Reconecte"));
        verify(driver, times(1)).ReadArea(anyInt(), anyInt(), anyInt(), anyInt(), any());
    }

    @Test void modoLogoUsaTsapsExplicitosESemElesPreservaRackSlot() {
        documento.set(documento(new Conexao("192.168.0.3", 0, 1, 1, 1000, 0x0300, 0x0200)));
        assertInstanceOf(PlcConnectionService.Resultado.Conectado.class, plc.connectUsingSavedIp());
        verify(driver).SetConnectionParams("192.168.0.3", 0x0300, 0x0200);
        verify(driver).Connect();
        verify(driver, never()).ConnectTo(anyString(), anyInt(), anyInt());
    }
}
