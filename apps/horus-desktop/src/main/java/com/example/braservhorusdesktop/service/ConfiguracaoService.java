package com.example.braservhorusdesktop.service;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Objects;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.example.braservhorusdesktop.dto.ConfiguracaoBomba;
import com.example.braservhorusdesktop.model.UnidadePressao;

public class ConfiguracaoService {

    private static final String CONFIG_FILE_PATH = "config/bomba_config.json";
    private static final String IP_PLC_PADRAO = "10.0.0.200";
    private static final double RANGE_PRESSAO_PADRAO_BAR = 400.0;
    private static final double SENSIBILIDADE_PRESSAO_PADRAO = 1.0;
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private final Path configFilePath;
    private volatile ConfiguracaoBomba configuracao;

    public ConfiguracaoService() {
        this(resolverCaminhoConfiguracaoUsuario(), Paths.get(CONFIG_FILE_PATH));
    }

    ConfiguracaoService(Path configFilePath) {
        this(configFilePath, null);
    }

    private ConfiguracaoService(Path configFilePath, Path configFilePathLegado) {
        this.configFilePath = Objects.requireNonNull(configFilePath, "configFilePath");
        migrarConfiguracaoLegada(configFilePathLegado);
        this.configuracao = carregarConfiguracao();
    }

    private static Path resolverCaminhoConfiguracaoUsuario() {
        String localAppData = System.getenv("LOCALAPPDATA");

        if (localAppData != null && !localAppData.isBlank()) {
            return Paths.get(localAppData, "GeopetroIO", "config", "bomba_config.json");
        }

        return Paths.get(
                System.getProperty("user.home"),
                ".geopetroio",
                "config",
                "bomba_config.json"
        );
    }

    private void migrarConfiguracaoLegada(Path configFilePathLegado) {
        if (configFilePathLegado == null
                || Files.exists(configFilePath)
                || !Files.isRegularFile(configFilePathLegado)) {
            return;
        }

        try {
            Path diretorioConfig = configFilePath.getParent();
            if (diretorioConfig != null) {
                Files.createDirectories(diretorioConfig);
            }

            Files.copy(configFilePathLegado, configFilePath, StandardCopyOption.COPY_ATTRIBUTES);
            System.out.println("[CONFIG] Configuração anterior migrada para: " + configFilePath);
        } catch (IOException e) {
            System.err.println("[CONFIG] Não foi possível migrar a configuração anterior: " + e.getMessage());
        }
    }

    public ConfiguracaoBomba carregarConfiguracao() {
        try {
            File file = configFilePath.toFile();

            if (file.exists()) {
                ConfiguracaoBomba config = objectMapper.readValue(file, ConfiguracaoBomba.class);
                normalizarConfiguracao(config);
                return config;
            }
        } catch (IOException e) {
            System.err.println("[CONFIG] Erro ao carregar configuração: " + e.getMessage());
        }

        // Retorna configuração padrão se não existir
        return new ConfiguracaoBomba(
                IP_PLC_PADRAO,
                0.0,
                RANGE_PRESSAO_PADRAO_BAR,
                SENSIBILIDADE_PRESSAO_PADRAO
        );
    }

    private void normalizarConfiguracao(ConfiguracaoBomba config) {
        if (config == null) {
            return;
        }

        if (config.getIpPlc() == null || config.getIpPlc().isBlank()) {
            config.setIpPlc(IP_PLC_PADRAO);
        } else {
            config.setIpPlc(config.getIpPlc().trim());
        }

        if (config.getRangePressaoBar() <= 0) {
            config.setRangePressaoBar(RANGE_PRESSAO_PADRAO_BAR);
        }

        if (config.getSensibilidadePressao() <= 0) {
            config.setSensibilidadePressao(SENSIBILIDADE_PRESSAO_PADRAO);
        }

        // Configuracoes gravadas antes deste campo existir vem sem unidade: PSI mantem o
        // comportamento que o usuario ja via.
        if (config.getUnidadePressao() == null) {
            config.setUnidadePressao(UnidadePressao.PSI);
        }
    }

    public void salvarConfiguracao(ConfiguracaoBomba config) {
        try {
            normalizarConfiguracao(config);

            Path diretorioConfig = configFilePath.getParent();
            if (diretorioConfig != null) {
                Files.createDirectories(diretorioConfig);
            }

            File file = configFilePath.toFile();
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(file, config);

            this.configuracao = config;
            System.out.println("[CONFIG] Configuração salva com sucesso: " + configFilePath);

        } catch (IOException e) {
            System.err.println("[CONFIG] Erro ao salvar configuração: " + e.getMessage());
            throw new RuntimeException("Erro ao salvar configuração", e);
        }
    }

    public ConfiguracaoBomba getConfiguracao() {
        return configuracao;
    }

    public double getConstante() {
        return configuracao != null ? configuracao.getConstante() : 0.0;
    }

    public String getIpPlc() {
        return configuracao != null ? configuracao.getIpPlc() : IP_PLC_PADRAO;
    }

    public double getRangePressaoBar() {
        return configuracao != null ? configuracao.getRangePressaoBar() : RANGE_PRESSAO_PADRAO_BAR;
    }

    public double getSensibilidadePressao() {
        return configuracao != null ? configuracao.getSensibilidadePressao() : SENSIBILIDADE_PRESSAO_PADRAO;
    }

    public UnidadePressao getUnidadePressao() {
        return configuracao != null && configuracao.getUnidadePressao() != null
                ? configuracao.getUnidadePressao()
                : UnidadePressao.PSI;
    }

    public void atualizarConfiguracao(double constante) {
        atualizarConfiguracao(constante, getRangePressaoBar(), getSensibilidadePressao());
    }

    public void atualizarConfiguracao(double constante, double rangePressaoBar, double sensibilidadePressao) {
        atualizarConfiguracao(getIpPlc(), constante, rangePressaoBar, sensibilidadePressao);
    }

    /**
     * Mantem a unidade de pressao ja escolhida.
     *
     * <p>As sobrecargas antigas nao conhecem o campo; sem preservar aqui, qualquer gravacao feita
     * por elas silenciosamente devolveria a exibicao para PSI.
     */
    public void atualizarConfiguracao(
            String ipPlc,
            double constante,
            double rangePressaoBar,
            double sensibilidadePressao
    ) {
        atualizarConfiguracao(ipPlc, constante, rangePressaoBar, sensibilidadePressao, getUnidadePressao());
    }

    public void atualizarConfiguracao(
            String ipPlc,
            double constante,
            double rangePressaoBar,
            double sensibilidadePressao,
            UnidadePressao unidadePressao
    ) {
        ConfiguracaoBomba novaConfiguracao =
                new ConfiguracaoBomba(ipPlc, constante, rangePressaoBar, sensibilidadePressao);
        novaConfiguracao.setUnidadePressao(unidadePressao);
        normalizarConfiguracao(novaConfiguracao);
        salvarConfiguracao(novaConfiguracao);
    }
}
