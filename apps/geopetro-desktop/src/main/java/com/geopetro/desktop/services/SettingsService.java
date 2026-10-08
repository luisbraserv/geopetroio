package com.geopetro.desktop.services;

import com.geopetro.desktop.models.AppSettings;
import com.geopetro.desktop.models.ChaveHidraulicaConfig;
import com.geopetro.desktop.models.SensorPressaoConfig;
import com.geopetro.desktop.models.TipoMovimento;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.geopetro.desktop.config.Ambiente;
import com.geopetro.desktop.config.AppPaths;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class SettingsService {

    private static final Logger logger = LoggerFactory.getLogger(SettingsService.class);

    private static final Pattern SONDA_ID_PATTERN        = Pattern.compile("\"idUnidade\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"");
    private static final Pattern TELEMETRIA_URL_PATTERN  = Pattern.compile("\"telemetriaUrl\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"");
    private static final Pattern TELEMETRIA_USER_PATTERN = Pattern.compile("\"telemetriaUsuario\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"");
    private static final Pattern TELEMETRIA_PASS_PATTERN = Pattern.compile("\"telemetriaSenha\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"");
    private static final Pattern PUMP_CONSTANT_PATTERN = Pattern.compile("\"pumpConstant\"\\s*:\\s*([-+]?\\d+(?:\\.\\d+)?)");
    // Canal de tempo real (WebSocket) com o Geopetro-Backend
    private static final Pattern BACKEND_URL_PATTERN   = Pattern.compile("\"backendUrl\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"");
    private static final Pattern CORE_URL_PATTERN      = Pattern.compile("\"coreUrl\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"");
    private static final Pattern BACKEND_USER_PATTERN  = Pattern.compile("\"backendUsuario\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"");
    private static final Pattern BACKEND_PASS_PATTERN  = Pattern.compile("\"backendSenha\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"");
    private static final Pattern UNIDADE_SONDA_ID_PATTERN = Pattern.compile("\"unidadeId\"\\s*:\\s*(\\d+)");
    // Interruptores de telemetria — §6. Ausentes num arquivo antigo significam LIGADO: ver
    // parseBooleanOuLigado.
    private static final Pattern MQTT_ATIVA_PATTERN    = Pattern.compile("\"telemetriaMqttAtiva\"\\s*:\\s*(true|false)");
    private static final Pattern TEMPO_REAL_ATIVO_PATTERN = Pattern.compile("\"tempoRealAtivo\"\\s*:\\s*(true|false)");

    private final Path settingsPath;
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private org.springframework.context.ApplicationEventPublisher events;
    public record Alteradas() {}

    public SettingsService() {
        this.settingsPath = AppPaths.configDir().resolve("app-settings.json");
    }

    /**
     * Le o arquivo de configuracoes. No app instalado, Core, Backend e broker sao definidos
     * no build ({@link Ambiente}), qualquer que seja o valor gravado.
     */
    public AppSettings loadSettings() {
        return Ambiente.aplicar(lerArquivo());
    }

    private AppSettings lerArquivo() {
        if (Files.notExists(settingsPath)) return new AppSettings();
        try {
            String content = Files.readString(settingsPath, StandardCharsets.UTF_8);
            AppSettings settings = new AppSettings();

            // ⚠️ plcIp continua no arquivo das estacoes em campo e NAO e lido de proposito: adotar
            // aquele valor apontaria a estacao para outro CLP no primeiro boot depois da
            // atualizacao, porque quem conecta sempre foi o documento da unidade. §4.
            Matcher m = SONDA_ID_PATTERN.matcher(content);
            if (m.find()) settings.setIdUnidade(unescapeJson(m.group(1)));

            m = TELEMETRIA_URL_PATTERN.matcher(content);
            if (m.find()) settings.setTelemetriaUrl(unescapeJson(m.group(1)));

            m = TELEMETRIA_USER_PATTERN.matcher(content);
            if (m.find()) settings.setTelemetriaUsuario(unescapeJson(m.group(1)));

            m = TELEMETRIA_PASS_PATTERN.matcher(content);
            if (m.find()) settings.setTelemetriaSenha(unescapeJson(m.group(1)));

            m = BACKEND_URL_PATTERN.matcher(content);
            if (m.find()) settings.setBackendUrl(unescapeJson(m.group(1)));

            m = CORE_URL_PATTERN.matcher(content);
            if (m.find()) settings.setCoreUrl(unescapeJson(m.group(1)));

            m = BACKEND_USER_PATTERN.matcher(content);
            if (m.find()) settings.setBackendUsuario(unescapeJson(m.group(1)));

            m = BACKEND_PASS_PATTERN.matcher(content);
            if (m.find()) settings.setBackendSenha(unescapeJson(m.group(1)));

            m = UNIDADE_SONDA_ID_PATTERN.matcher(content);
            if (m.find()) settings.setUnidadeId(Long.parseLong(m.group(1)));

            m = PUMP_CONSTANT_PATTERN.matcher(content);
            if (m.find()) settings.setPumpConstant(Double.parseDouble(m.group(1)));

            // ⚠️ Chave ausente = LIGADO. Um app-settings.json gravado antes de §6 nao tem estas
            // duas linhas, e tratar a ausencia como "desligado" emudeceria toda a frota na primeira
            // atualizacao — por uma escolha que ninguem fez.
            settings.setTelemetriaMqttAtiva(ligadoSalvoSeDitoFalso(content, MQTT_ATIVA_PATTERN));
            settings.setTempoRealAtivo(ligadoSalvoSeDitoFalso(content, TEMPO_REAL_ATIVO_PATTERN));

            settings.setSensor01(parseSensor(content, "sensor01"));
            settings.setSensor02(parseSensor(content, "sensor02"));
            settings.setSensor03(parseSensor(content, "sensor03"));
            settings.setSensor04(parseSensor(content, "sensor04"));
            settings.setChaveTubos(parseChave(content, "chaveTubos"));
            settings.setChaveFlutuante(parseChave(content, "chaveFlutuante"));
            settings.setPesoColuna(parsePesoColuna(content));

            return settings;
        } catch (IOException e) {
            logger.error("Erro ao carregar configuracoes em {}", settingsPath, e);
            return new AppSettings();
        }
    }

    /** Só um {@code false} explícito desliga. Chave ausente ou ilegível fica ligada. */
    private boolean ligadoSalvoSeDitoFalso(String content, Pattern padrao) {
        Matcher m = padrao.matcher(content);
        return !m.find() || Boolean.parseBoolean(m.group(1));
    }

    private SensorPressaoConfig parseSensor(String content, String key) {
        SensorPressaoConfig sensor = new SensorPressaoConfig();
        Pattern blockPattern = Pattern.compile("\"" + key + "\"\\s*:\\s*\\{([^}]*)\\}");
        Matcher block = blockPattern.matcher(content);
        if (!block.find()) return sensor;
        String bc = block.group(1);
        sensor.setRangeBar(parseDouble(bc, "rangeBar", sensor.getRangeBar()));
        sensor.setSensibilidade(parseDouble(bc, "sensibilidade", sensor.getSensibilidade()));
        return sensor;
    }

    private com.geopetro.desktop.models.PesoColunaConfig parsePesoColuna(String content) {
        com.geopetro.desktop.models.PesoColunaConfig cfg = new com.geopetro.desktop.models.PesoColunaConfig();
        Pattern blockPattern = Pattern.compile("\"pesoColuna\"\\s*:\\s*\\{([^}]*)\\}");
        Matcher block = blockPattern.matcher(content);
        if (!block.find()) return cfg;
        String bc = block.group(1);
        cfg.setPressaoZeroPsi(parseDouble(bc, "pressaoZeroPsi", cfg.getPressaoZeroPsi()));
        // "areaEfetivaPol2" era o nome do campo antes de a cadeia do sargento existir; lido como
        // alternativa para que uma configuracao antiga nao perca a area ja medida em campo.
        double area = parseDouble(bc, "areaEfetivaSensorPol2",
                parseDouble(bc, "areaEfetivaPol2", cfg.getAreaEfetivaSensorPol2()));
        cfg.setAreaEfetivaSensorPol2(area);
        cfg.setBracoSensorPol(parseDouble(bc, "bracoSensorPol", cfg.getBracoSensorPol()));
        cfg.setDiametroTamborPol(parseDouble(bc, "diametroTamborPol", cfg.getDiametroTamborPol()));
        cfg.setDiametroCaboPol(parseDouble(bc, "diametroCaboPol", cfg.getDiametroCaboPol()));
        cfg.setNumeroLinhas((int) Math.round(parseDouble(bc, "numeroLinhas", cfg.getNumeroLinhas())));
        cfg.setPesoCatarinaLbf(parseDouble(bc, "pesoCatarinaLbf", cfg.getPesoCatarinaLbf()));
        cfg.setFatorCalibracao(parseDouble(bc, "fatorCalibracao", cfg.getFatorCalibracao()));
        return cfg;
    }

    private ChaveHidraulicaConfig parseChave(String content, String key) {
        ChaveHidraulicaConfig cfg = new ChaveHidraulicaConfig();
        Pattern blockPattern = Pattern.compile("\"" + key + "\"\\s*:\\s*\\{([^}]*)\\}");
        Matcher block = blockPattern.matcher(content);
        if (!block.find()) return cfg;
        String bc = block.group(1);
        cfg.setDiametroPistaoIn(parseDouble(bc, "diametroPistaoIn", cfg.getDiametroPistaoIn()));
        cfg.setDiametroHasteIn(parseDouble(bc, "diametroHasteIn", cfg.getDiametroHasteIn()));
        cfg.setBracoAlavancaFt(parseDouble(bc, "bracoAlavancaFt", cfg.getBracoAlavancaFt()));
        cfg.setTipoMovimento(parseTipoMovimento(bc));
        return cfg;
    }

    private TipoMovimento parseTipoMovimento(String content) {
        Matcher m = Pattern.compile("\"tipoMovimento\"\\s*:\\s*\"(AVANCO|RECUO)\"").matcher(content);
        return m.find() ? TipoMovimento.valueOf(m.group(1)) : null;
    }


    private double parseDouble(String content, String field, double defaultValue) {
        Matcher m = Pattern.compile("\"" + field + "\"\\s*:\\s*([-+]?\\d+(?:\\.\\d+)?)").matcher(content);
        return m.find() ? Double.parseDouble(m.group(1)) : defaultValue;
    }

    private boolean parseBool(String content, String field, boolean defaultValue) {
        Matcher m = Pattern.compile("\"" + field + "\"\\s*:\\s*(true|false)").matcher(content);
        return m.find() ? Boolean.parseBoolean(m.group(1)) : defaultValue;
    }


    public void saveSettings(AppSettings settings) {
        try {
            Files.createDirectories(settingsPath.getParent());
            String idUnidade       = settings.getIdUnidade()        == null ? "" : settings.getIdUnidade();
            String telemetriaUrl = settings.getTelemetriaUrl()  == null ? "tcp://localhost:1883" : settings.getTelemetriaUrl();
            String telemetriaUsuario = settings.getTelemetriaUsuario() == null ? "" : settings.getTelemetriaUsuario();
            String telemetriaSenha   = settings.getTelemetriaSenha()   == null ? "" : settings.getTelemetriaSenha();
            String content = "{\n"
                    + "  \"idUnidade\" : \"" + escapeJson(idUnidade) + "\",\n"
                    + "  \"telemetriaUrl\" : \"" + escapeJson(telemetriaUrl) + "\",\n"
                    + "  \"telemetriaUsuario\" : \"" + escapeJson(telemetriaUsuario) + "\",\n"
                    + "  \"telemetriaSenha\" : \"" + escapeJson(telemetriaSenha) + "\",\n"
                    + "  \"unidadeId\" : " + (settings.getUnidadeId() == null ? 0 : settings.getUnidadeId()) + ",\n"
                    + "  \"backendUrl\" : \"" + escapeJson(settings.getBackendUrl() == null ? "" : settings.getBackendUrl()) + "\",\n"
                    + "  \"coreUrl\" : \"" + escapeJson(settings.getCoreUrl() == null ? "" : settings.getCoreUrl()) + "\",\n"
                    + "  \"backendUsuario\" : \"" + escapeJson(settings.getBackendUsuario() == null ? "" : settings.getBackendUsuario()) + "\",\n"
                    + "  \"backendSenha\" : \"" + escapeJson(settings.getBackendSenha() == null ? "" : settings.getBackendSenha()) + "\",\n"
                    + "  \"pumpConstant\" : " + settings.getPumpConstant() + ",\n"
                    + "  \"sensor01\" : " + sensorJson(settings.getSensor01()) + ",\n"
                    + "  \"sensor02\" : " + sensorJson(settings.getSensor02()) + ",\n"
                    + "  \"sensor03\" : " + sensorJson(settings.getSensor03()) + ",\n"
                    + "  \"sensor04\" : " + sensorJson(settings.getSensor04()) + ",\n"
                    + "  \"chaveTubos\" : " + chaveJson(settings.getChaveTubos()) + ",\n"
                    + "  \"chaveFlutuante\" : " + chaveJson(settings.getChaveFlutuante()) + ",\n"
                    + "  \"pesoColuna\" : " + pesoColunaJson(settings.getPesoColuna()) + ",\n"
                    + "  \"telemetriaMqttAtiva\" : " + settings.isTelemetriaMqttAtiva() + ",\n"
                    + "  \"tempoRealAtivo\" : " + settings.isTempoRealAtivo() + "\n"
                    + "}\n";
            Files.writeString(settingsPath, content, StandardCharsets.UTF_8);
            if (events != null) events.publishEvent(new Alteradas());
        } catch (IOException e) {
            logger.error("Erro ao salvar configuracoes em {}", settingsPath, e);
            throw new IllegalStateException("Nao foi possivel salvar as configuracoes.", e);
        }
    }

    private String sensorJson(SensorPressaoConfig s) {
        if (s == null) s = new SensorPressaoConfig();
        return "{ \"rangeBar\" : " + s.getRangeBar()
                + ", \"sensibilidade\" : " + s.getSensibilidade()
                + " }";
    }

    private String chaveJson(ChaveHidraulicaConfig c) {
        if (c == null) c = new ChaveHidraulicaConfig();
        String tipoMovimento = c.getTipoMovimento() == null ? "null" : "\"" + c.getTipoMovimento().name() + "\"";
        return "{ \"diametroPistaoIn\" : " + c.getDiametroPistaoIn()
                + ", \"diametroHasteIn\" : " + c.getDiametroHasteIn()
                + ", \"bracoAlavancaFt\" : " + c.getBracoAlavancaFt()
                + ", \"tipoMovimento\" : " + tipoMovimento
                + " }";
    }

    private String pesoColunaJson(com.geopetro.desktop.models.PesoColunaConfig c) {
        if (c == null) c = new com.geopetro.desktop.models.PesoColunaConfig();
        return "{ \"pressaoZeroPsi\" : " + c.getPressaoZeroPsi()
                + ", \"areaEfetivaSensorPol2\" : " + c.getAreaEfetivaSensorPol2()
                + ", \"bracoSensorPol\" : " + c.getBracoSensorPol()
                + ", \"diametroTamborPol\" : " + c.getDiametroTamborPol()
                + ", \"diametroCaboPol\" : " + c.getDiametroCaboPol()
                + ", \"numeroLinhas\" : " + c.getNumeroLinhas()
                + ", \"pesoCatarinaLbf\" : " + c.getPesoCatarinaLbf()
                + ", \"fatorCalibracao\" : " + c.getFatorCalibracao()
                + " }";
    }

    public com.geopetro.desktop.models.PesoColunaConfig getPesoColuna() {
        return loadSettings().getPesoColuna();
    }

    public void updatePesoColuna(com.geopetro.desktop.models.PesoColunaConfig cfg) {
        AppSettings settings = loadSettings();
        settings.setPesoColuna(cfg);
        saveSettings(settings);
    }

    private String escapeJson(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private String unescapeJson(String value) {
        return value.replace("\\\"", "\"").replace("\\\\", "\\");
    }

    public double getPumpConstant() { return loadSettings().getPumpConstant(); }

    // ⚠️ getCardVisibility/updateCardVisibility sairam em 2026-09-10 junto com o cartao que era o
    // unico a chama-los. O bloco "cardVisibility" continua nos app-settings.json de campo, sem
    // leitor — nao se apaga arquivo de configuracao de campo por conveniencia de codigo.

    public SensorPressaoConfig getSensorConfig(int sensorIndex) {
        AppSettings s = loadSettings();
        return switch (sensorIndex) {
            case 1 -> s.getSensor01();
            case 2 -> s.getSensor02();
            case 3 -> s.getSensor03();
            case 4 -> s.getSensor04();
            default -> new SensorPressaoConfig();
        };
    }

    public void updateSensorConfig(int sensorIndex, SensorPressaoConfig cfg) {
        AppSettings settings = loadSettings();
        switch (sensorIndex) {
            case 1 -> settings.setSensor01(cfg);
            case 2 -> settings.setSensor02(cfg);
            case 3 -> settings.setSensor03(cfg);
            case 4 -> settings.setSensor04(cfg);
        }
        saveSettings(settings);
    }

    public ChaveHidraulicaConfig getChaveTubos()     { return loadSettings().getChaveTubos(); }
    public ChaveHidraulicaConfig getChaveFlutuante() { return loadSettings().getChaveFlutuante(); }

    public void updateChaveTubos(ChaveHidraulicaConfig cfg) {
        AppSettings settings = loadSettings();
        settings.setChaveTubos(cfg);
        saveSettings(settings);
    }

    public void updateChaveFlutuante(ChaveHidraulicaConfig cfg) {
        AppSettings settings = loadSettings();
        settings.setChaveFlutuante(cfg);
        saveSettings(settings);
    }

    /**
     * Os dois interruptores de telemetria — {@code configuracao-da-estacao.md §6}.
     *
     * <p>Gravados juntos porque a tela os oferece juntos, e porque cada {@code saveSettings}
     * reescreve o arquivo inteiro: separá-los seria uma segunda escrita sem ganho.
     */
    public void updateTelemetria(boolean mqttAtiva, boolean tempoRealAtivo) {
        AppSettings settings = loadSettings();
        settings.setTelemetriaMqttAtiva(mqttAtiva);
        settings.setTempoRealAtivo(tempoRealAtivo);
        saveSettings(settings);
    }

    public void updateIdUnidade(String idUnidade) {
        AppSettings settings = loadSettings();
        settings.setIdUnidade(idUnidade);
        saveSettings(settings);
    }

    public String getIdUnidade() { return loadSettings().getIdUnidade(); }

    public void updateTelemetriaUrl(String url) {
        AppSettings settings = loadSettings();
        settings.setTelemetriaUrl(url);
        saveSettings(settings);
    }

    /**
     * Grava as credenciais do broker MQTT.
     *
     * <p>Usuario e senha sao gravados juntos porque so fazem sentido em conjunto: trocar um sem o
     * outro deixaria a conexao num estado invalido ate a proxima edicao.
     */
    public void updateTelemetriaCredenciais(String usuario, String senha) {
        AppSettings settings = loadSettings();
        settings.setTelemetriaUsuario(usuario == null ? "" : usuario.trim());
        settings.setTelemetriaSenha(senha == null ? "" : senha);
        saveSettings(settings);
    }

    /**
     * Grava a configuracao do canal de tempo real.
     *
     * <p>Os cinco valores sao gravados juntos porque so fazem sentido em conjunto: apontar para
     * outro backend sem trocar as credenciais, ou trocar a unidade sem o resto, deixaria a conexao
     * num estado invalido ate a proxima edicao.
     */
    public void updateTempoReal(Long unidadeId, String coreUrl, String backendUrl, String usuario, String senha) {
        AppSettings settings = loadSettings();
        settings.setUnidadeId(unidadeId);
        settings.setCoreUrl(coreUrl == null ? "" : coreUrl.trim());
        settings.setBackendUrl(backendUrl == null ? "" : backendUrl.trim());
        settings.setBackendUsuario(usuario == null ? "" : usuario.trim());
        settings.setBackendSenha(senha == null ? "" : senha);
        saveSettings(settings);
    }

    /**
     * Grava só o endereço do Braserv-Core.
     *
     * <p>⚠️ Existe para o login de configuração, que aceita o servidor digitado na hora quando a
     * estação ainda não tem um ({@link SessaoConfiguracao}). Diferente de
     * {@link #updateTempoReal}, não toca em unidade nem em credenciais: nesse momento a estação
     * pode não ter nenhuma das duas, e zerá-las seria pior que não gravar nada.
     */
    public void updateCoreUrl(String coreUrl) {
        AppSettings settings = loadSettings();
        settings.setCoreUrl(coreUrl == null ? "" : coreUrl.trim());
        saveSettings(settings);
    }

    public void updateBackendUrl(String backendUrl) {
        AppSettings settings = loadSettings();
        settings.setBackendUrl(backendUrl == null ? "" : backendUrl.trim());
        saveSettings(settings);
    }

    public void updatePumpConstant(double pumpConstant) {
        AppSettings settings = loadSettings();
        settings.setPumpConstant(pumpConstant);
        saveSettings(settings);
    }
}
