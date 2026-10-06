package com.example.demo.models;

public class AppSettings {

    // ⚠️ plcIp saiu daqui em 2026-09-10: ele era lido, exibido e salvo — e ignorado. Quem conecta
    // sempre foi conexao.ip do documento de cards da unidade, hoje editado na engrenagem.
    // Ver configuracao-da-estacao.md §4.
    private String sondaId;
    private String telemetriaUrl;
    // Credenciais do broker MQTT. Vazias = conexao anonima, que so funciona se o broker
    // permitir. Em producao o broker exige autenticacao (ver SEC-009 nas specs).
    private String telemetriaUsuario;
    private String telemetriaSenha;

    /**
     * Id da Unidade/Sonda no cadastro do Geopetro-Backend.
     *
     * <p>OBRIGATORIO para o tempo real: cada instalacao do Desktop pertence a uma unica
     * Unidade/Sonda. E este id que endereca o topico e que o backend usa para autorizar a
     * publicacao — uma instalacao mal configurada nao consegue escrever na tela de outra sonda.
     */
    private Long unidadeSondaId;

    /** URL base do Geopetro-Backend, ex.: http://localhost:8080 */
    private String backendUrl;

    /** Credenciais do usuario de servico que o Desktop usa para autenticar no Geopetro-Backend. */
    private String backendUsuario;
    private String backendSenha;
    private double pumpConstant;
    private SensorPressaoConfig sensor01; // Peso da Coluna
    private SensorPressaoConfig sensor02; // T. Ch. Hid. Tubos  (pressão hidráulica)
    private SensorPressaoConfig sensor03; // T. Ch. Flutuante    (pressão hidráulica)
    private SensorPressaoConfig sensor04; // P. Bomba de Lama / ESCP
    private ChaveHidraulicaConfig chaveTubos;     // parâmetros de torque — chave dos tubos
    private ChaveHidraulicaConfig chaveFlutuante; // parâmetros de torque — chave flutuante
    private PesoColunaConfig      pesoColuna;     // parâmetros de cálculo — peso da coluna B002

    /**
     * Os dois interruptores de telemetria — {@code configuracao-da-estacao.md §6}.
     *
     * <p>Antes não havia liga/desliga: "desligar" era deixar um campo em branco. Funcionava por
     * acidente, era indescobrível, e não distinguia <b>desligado de propósito</b> de <b>mal
     * configurado</b>.
     *
     * <p>⚠️ <b>Nascem ligados, e isso é a migração.</b> Uma estação em campo tem um
     * {@code app-settings.json} sem estas chaves; se a ausência valesse "desligado", a frota inteira
     * emudeceria na primeira atualização — e por um campo que ninguém escolheu.
     *
     * <p>São <b>locais</b>: não viajam ao servidor. De fora, uma unidade calada de propósito é
     * indistinguível de uma quebrada, que é o mesmo limite já aceito para o CLP desligado.
     */
    private boolean telemetriaMqttAtiva;
    private boolean tempoRealAtivo;

    public AppSettings() {
        this.sondaId        = "";
        this.telemetriaUrl  = "tcp://localhost:1883";
        this.telemetriaUsuario = "";
        this.telemetriaSenha   = "";
        this.unidadeSondaId    = null;
        this.backendUrl        = "http://localhost:8080";
        this.backendUsuario    = "";
        this.backendSenha      = "";
        this.pumpConstant   = 0.0;
        this.sensor01       = new SensorPressaoConfig();
        this.sensor02       = new SensorPressaoConfig();
        this.sensor03       = new SensorPressaoConfig();
        this.sensor04       = new SensorPressaoConfig();
        this.chaveTubos     = new ChaveHidraulicaConfig();
        this.chaveFlutuante = new ChaveHidraulicaConfig();
        this.pesoColuna     = new PesoColunaConfig();
        this.telemetriaMqttAtiva = true;
        this.tempoRealAtivo      = true;
    }

    public String getSondaId()                          { return sondaId; }
    public void   setSondaId(String v)                  { this.sondaId = v; }

    public String getTelemetriaUrl()                    { return telemetriaUrl; }
    public void   setTelemetriaUrl(String v)            { this.telemetriaUrl = v; }

    public String getTelemetriaUsuario()                { return telemetriaUsuario; }
    public void   setTelemetriaUsuario(String v)        { this.telemetriaUsuario = v; }

    public String getTelemetriaSenha()                  { return telemetriaSenha; }
    public void   setTelemetriaSenha(String v)          { this.telemetriaSenha = v; }

    /** True quando ha usuario configurado — a senha pode ser vazia em brokers que so exigem usuario. */
    public Long   getUnidadeSondaId()                   { return unidadeSondaId; }
    public void   setUnidadeSondaId(Long v)             { this.unidadeSondaId = v; }

    public String getBackendUrl()                       { return backendUrl; }
    public void   setBackendUrl(String v)               { this.backendUrl = v; }

    public String getBackendUsuario()                   { return backendUsuario; }
    public void   setBackendUsuario(String v)           { this.backendUsuario = v; }

    public String getBackendSenha()                     { return backendSenha; }
    public void   setBackendSenha(String v)             { this.backendSenha = v; }

    /**
     * True quando ha o minimo para abrir o canal de tempo real.
     *
     * <p>Sem isto o Desktop segue operando normalmente — le o CLP, grava local e publica no MQTT.
     * O tempo real e um canal adicional, nao um requisito de funcionamento.
     */
    public boolean temConfiguracaoTempoReal() {
        return unidadeSondaId != null && unidadeSondaId > 0
                && backendUrl != null && !backendUrl.isBlank()
                && backendUsuario != null && !backendUsuario.isBlank();
    }

    public boolean temCredenciaisTelemetria() {
        return telemetriaUsuario != null && !telemetriaUsuario.isBlank();
    }

    public double getPumpConstant()                     { return pumpConstant; }
    public void   setPumpConstant(double v)             { this.pumpConstant = v; }

    public SensorPressaoConfig getSensor01()            { return sensor01; }
    public void setSensor01(SensorPressaoConfig s)      { this.sensor01 = s; }

    public SensorPressaoConfig getSensor02()            { return sensor02; }
    public void setSensor02(SensorPressaoConfig s)      { this.sensor02 = s; }

    public SensorPressaoConfig getSensor03()            { return sensor03; }
    public void setSensor03(SensorPressaoConfig s)      { this.sensor03 = s; }

    public SensorPressaoConfig getSensor04()            { return sensor04; }
    public void setSensor04(SensorPressaoConfig s)      { this.sensor04 = s; }

    public ChaveHidraulicaConfig getChaveTubos()        { return chaveTubos; }
    public void setChaveTubos(ChaveHidraulicaConfig c)  { this.chaveTubos = c; }

    public ChaveHidraulicaConfig getChaveFlutuante()         { return chaveFlutuante; }
    public void setChaveFlutuante(ChaveHidraulicaConfig c)   { this.chaveFlutuante = c; }

    public PesoColunaConfig getPesoColuna()                  { return pesoColuna; }
    public void setPesoColuna(PesoColunaConfig c)            { this.pesoColuna = c; }

    public boolean isTelemetriaMqttAtiva()                   { return telemetriaMqttAtiva; }
    public void setTelemetriaMqttAtiva(boolean v)            { this.telemetriaMqttAtiva = v; }

    public boolean isTempoRealAtivo()                        { return tempoRealAtivo; }
    public void setTempoRealAtivo(boolean v)                 { this.tempoRealAtivo = v; }

}
