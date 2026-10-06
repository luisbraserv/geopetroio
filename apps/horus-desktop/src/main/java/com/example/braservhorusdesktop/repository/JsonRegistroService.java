package com.example.braservhorusdesktop.repository;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

import com.example.braservhorusdesktop.model.RegistroOperacao;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Serviço que salva registros de operação em arquivo JSON.
 * 
 * Mantém um arquivo JSON com todos os registros de transações,
 * permitindo fácil acesso e análise dos dados.
 */
public class JsonRegistroService {

    private static final Path ARQUIVO_REGISTROS_LEGADO = Paths.get("data", "registros_operacao.json");
    private static final String NOME_ARQUIVO_LEGADO = "registros_operacao.json";
    private static final String NOME_ARQUIVO_INCREMENTAL = "registros_operacao.jsonl";
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final DateTimeFormatter formatter = DateTimeFormatter.ISO_LOCAL_DATE_TIME;
    private static final Object FILE_LOCK = new Object();

    private final Path dataDir;
    private final Path arquivoRegistrosLegado;
    private final Path arquivoRegistrosIncremental;

    /**
     * DTO para serialização JSON
     */
    public static class RegistroJson {
        public String timestamp;
        public double pressao;
        public long strokeAtual;
        public long strokeCumulativo;
        public double vazaoAtual;
        public double volumeBombeado;

        public RegistroJson() {
        }

        public RegistroJson(RegistroOperacao registro) {
            this.timestamp = registro.getTimestamp() != null ? 
                    registro.getTimestamp().format(formatter) : 
                    LocalDateTime.now().format(formatter);
            this.pressao = registro.getPressao();
            this.strokeAtual = registro.getStrokeAtual();
            this.strokeCumulativo = registro.getStrokeCumulativo();
            this.vazaoAtual = registro.getVazaoAtual();
            this.volumeBombeado = registro.getVolumeBombeado();
        }
    }

    /**
     * Container para o arquivo JSON
     */
    public static class ArquivoRegistros {
        public List<RegistroJson> registros;

        public ArquivoRegistros() {
            this.registros = new ArrayList<>();
        }
    }

    public JsonRegistroService() {
        this(resolverDiretorioDadosUsuario(), ARQUIVO_REGISTROS_LEGADO);
    }

    public JsonRegistroService(Path dataDir) {
        this(dataDir, null);
    }

    private JsonRegistroService(Path dataDir, Path arquivoLegadoOrigem) {
        this.dataDir = dataDir;
        this.arquivoRegistrosLegado = dataDir.resolve(NOME_ARQUIVO_LEGADO);
        this.arquivoRegistrosIncremental = dataDir.resolve(NOME_ARQUIVO_INCREMENTAL);
        criarDiretorioSeNecessario();
        migrarHistoricoLegado(arquivoLegadoOrigem);
    }

    private static Path resolverDiretorioDadosUsuario() {
        String localAppData = System.getenv("LOCALAPPDATA");

        if (localAppData != null && !localAppData.isBlank()) {
            return Paths.get(localAppData, "GeopetroIO", "data");
        }

        return Paths.get(System.getProperty("user.home"), ".geopetroio", "data");
    }

    /**
     * Cria o diretório de dados se não existir
     */
    private void criarDiretorioSeNecessario() {
        try {
            Files.createDirectories(dataDir);
            System.out.println("[JSON] Diretório de dados criado/verificado: " + dataDir);
        } catch (IOException e) {
            System.err.println("[JSON] Erro ao criar diretório: " + e.getMessage());
        }
    }

    private void migrarHistoricoLegado(Path arquivoLegadoOrigem) {
        if (arquivoLegadoOrigem == null || !Files.isRegularFile(arquivoLegadoOrigem)) {
            return;
        }

        Path origemAbsoluta = arquivoLegadoOrigem.toAbsolutePath().normalize();
        Path destinoAbsoluto = arquivoRegistrosLegado.toAbsolutePath().normalize();

        if (origemAbsoluta.equals(destinoAbsoluto) || Files.exists(arquivoRegistrosLegado)) {
            return;
        }

        try {
            Files.copy(
                    arquivoLegadoOrigem,
                    arquivoRegistrosLegado,
                    StandardCopyOption.COPY_ATTRIBUTES
            );
            System.out.println("[JSON] Histórico anterior migrado para: " + arquivoRegistrosLegado);
        } catch (IOException e) {
            System.err.println("[JSON] Não foi possível migrar o histórico anterior: " + e.getMessage());
        }
    }

    /**
     * Salva um registro de operação no arquivo JSON
     * 
     * @param registro o registro de operação a salvar
     */
    public synchronized void salvar(RegistroOperacao registro) {
        if (registro == null) {
            return;
        }

        synchronized (FILE_LOCK) {
            try {
                RegistroJson novoRegistro = new RegistroJson(registro);
                String linha = objectMapper.writeValueAsString(novoRegistro) + System.lineSeparator();

                Files.writeString(
                        arquivoRegistrosIncremental,
                        linha,
                        StandardCharsets.UTF_8,
                        StandardOpenOption.CREATE,
                        StandardOpenOption.WRITE,
                        StandardOpenOption.APPEND
                );
            } catch (IOException e) {
                System.err.println("[JSON] Erro ao salvar registro: " + e.getMessage());
            }
        }
    }

    /**
     * Carrega todos os registros do arquivo JSON
     * 
     * @return objeto contendo lista de registros
     */
    private ArquivoRegistros carregarRegistros() {
        byte[] conteudoLegado = null;
        List<String> linhasIncrementais = List.of();

        synchronized (FILE_LOCK) {
            try {
                if (Files.isRegularFile(arquivoRegistrosLegado)) {
                    conteudoLegado = Files.readAllBytes(arquivoRegistrosLegado);
                }

                if (Files.isRegularFile(arquivoRegistrosIncremental)) {
                    linhasIncrementais = Files.readAllLines(
                            arquivoRegistrosIncremental,
                            StandardCharsets.UTF_8
                    );
                }
            } catch (IOException e) {
                System.err.println("[JSON] Erro ao ler arquivos de histórico: " + e.getMessage());
            }
        }

        ArquivoRegistros arquivo = carregarRegistrosLegados(conteudoLegado);
        carregarRegistrosIncrementais(arquivo, linhasIncrementais);
        return arquivo;
    }

    private ArquivoRegistros carregarRegistrosLegados(byte[] conteudoLegado) {
        if (conteudoLegado == null || conteudoLegado.length == 0) {
            return new ArquivoRegistros();
        }

        try {
            return objectMapper.readValue(conteudoLegado, ArquivoRegistros.class);
        } catch (IOException e) {
            System.err.println("[JSON] Erro ao carregar histórico legado: " + e.getMessage());
            return new ArquivoRegistros();
        }
    }

    private void carregarRegistrosIncrementais(
            ArquivoRegistros arquivo,
            List<String> linhasIncrementais
    ) {
        for (String linha : linhasIncrementais) {
            if (linha == null || linha.isBlank()) {
                continue;
            }

            try {
                arquivo.registros.add(objectMapper.readValue(linha, RegistroJson.class));
            } catch (IOException e) {
                System.err.println("[JSON] Registro incremental inválido ignorado: " + e.getMessage());
            }
        }
    }

    /**
     * Obtém todos os registros salvos
     * 
     * @return lista de registros
     */
    public List<RegistroJson> obterRegistros() {
        return carregarRegistros().registros;
    }

    /**
     * Obtém a quantidade de registros salvos
     * 
     * @return quantidade de registros
     */
    public int obterQuantidadeRegistros() {
        return carregarRegistros().registros.size();
    }

    /**
     * Limpa todos os registros salvos
     */
    public synchronized void limpar() {
        synchronized (FILE_LOCK) {
            try {
                Files.deleteIfExists(arquivoRegistrosIncremental);
                objectMapper.writerWithDefaultPrettyPrinter()
                        .writeValue(arquivoRegistrosLegado.toFile(), new ArquivoRegistros());

                System.out.println("[JSON] Registros limpos com sucesso");
            } catch (IOException e) {
                System.err.println("[JSON] Erro ao limpar registros: " + e.getMessage());
            }
        }
    }

    /**
     * Exporta registros para um arquivo JSON especificado
     * 
     * @param nomeArquivo nome do arquivo de exportação
     */
    public void exportar(String nomeArquivo) {
        try {
            ArquivoRegistros arquivo = carregarRegistros();
            File file = new File(nomeArquivo);
            objectMapper.writerWithDefaultPrettyPrinter()
                    .writeValue(file, arquivo);

            System.out.println("[JSON] Registros exportados para: " + nomeArquivo);

        } catch (IOException e) {
            System.err.println("[JSON] Erro ao exportar registros: " + e.getMessage());
        }
    }
}
