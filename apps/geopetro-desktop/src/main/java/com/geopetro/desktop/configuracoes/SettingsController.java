package com.geopetro.desktop.configuracoes;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;

import com.geopetro.desktop.sessao.ConfiguracaoLoginController;
import com.geopetro.desktop.sessao.UnidadeSondaCatalogoService.CatalogoIndisponivelException;
import com.geopetro.desktop.sessao.UnidadeSondaCatalogoService.SessaoExpiradaException;
import com.geopetro.desktop.sessao.UnidadeSondaCatalogoService;
import com.geopetro.desktop.sessao.UnidadeSondaOpcao;

import javafx.application.Platform;
import javafx.collections.FXCollections;
import javafx.concurrent.Task;
import javafx.fxml.FXML;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.scene.control.CheckBox;
import javafx.scene.control.ComboBox;
import javafx.scene.control.Label;
import javafx.scene.control.PasswordField;
import javafx.scene.control.ScrollPane;
import javafx.scene.control.TextField;
import javafx.scene.layout.BorderPane;
import javafx.scene.layout.ColumnConstraints;
import javafx.scene.layout.GridPane;
import javafx.scene.layout.VBox;
import javafx.stage.Stage;

@Controller
public class SettingsController {

    /**
     * Abaixo desta largura, duas colunas espremem os campos a ponto de cortar os textos de ajuda.
     * Acima, sobra espaco horizontal suficiente para as duas.
     */
    private static final double LARGURA_MINIMA_DUAS_COLUNAS = 780.0;

    @Autowired
    private SettingsService settingsService;

    @Autowired
    private UnidadeSondaCatalogoService catalogoService;

    @Autowired
    private com.geopetro.desktop.sessao.SessaoConfiguracao sessao;

    @Autowired
    private org.springframework.context.ApplicationContext contexto;

    @Autowired
    private com.geopetro.desktop.services.ConfiguracaoCardsClient cardsClient;

    /**
     * O documento como esta tela o leu — a base da conferência de conflito ao gravar.
     *
     * <p>{@code null} enquanto a leitura não terminou ou quando ela falhou, e é por isso que ele
     * também serve de trava: sem base lida não se grava conexão nenhuma, porque não haveria como
     * saber se alguém a mudou no intervalo.
     */
    private com.geopetro.desktop.models.CardsDaUnidade documentoCarregado;

    @FXML private BorderPane raiz;
    @FXML private ScrollPane rolagem;
    @FXML private GridPane grade;
    @FXML private ColumnConstraints coluna1;
    @FXML private ColumnConstraints coluna2;

    @FXML private VBox cartaoEquipamento;
    @FXML private VBox cartaoMqtt;
    @FXML private VBox cartaoTempoReal;

    @FXML private TextField txtPlcIp;
    @FXML private TextField txtPlcRack;
    @FXML private TextField txtPlcSlot;
    @FXML private TextField txtPlcDb;
    @FXML private TextField txtPlcIntervalo;
    @FXML private CheckBox chkPlcTsap;
    @FXML private TextField txtPlcTsapLocal;
    @FXML private TextField txtPlcTsapRemoto;
    @FXML private Label lblConexaoStatus;
    @FXML private ComboBox<UnidadeSondaOpcao> cmbUnidadeSonda;
    @FXML private Button btnRecarregar;
    @FXML private Label lblUnidadeStatus;

    @FXML private CheckBox chkTelemetriaMqtt;
    @FXML private TextField txtTelemetriaUsuario;
    @FXML private PasswordField txtTelemetriaSenha;

    @FXML private CheckBox chkTempoReal;

    @FXML private TextField txtBackendUsuario;
    @FXML private PasswordField txtBackendSenha;

    @FXML private Button btnSave;
    @FXML private Button btnCancel;

    @FXML private javafx.scene.layout.HBox faixaPortao;
    @FXML private Label lblPortao;
    @FXML private Button btnDesbloquear;

    /** Duas colunas hoje? Guardado para so remontar a grade quando o estado realmente muda. */
    private boolean duasColunas = true;

    /** A engrenagem inteira exige {@code ADMIN} ou {@code SUPORTE}. */
    private void aplicarPortao() {
        boolean liberado = sessao.liberada();

        cartaoEquipamento.setDisable(!liberado);
        cartaoMqtt.setDisable(!liberado);
        cartaoTempoReal.setDisable(!liberado);

        faixaPortao.setVisible(!liberado);
        faixaPortao.setManaged(!liberado);
        lblPortao.setText("Estas configurações exigem ADMIN ou SUPORTE.");
    }

    private void desbloquear() {
        if (ConfiguracaoLoginController.exigirSessao(btnDesbloquear.getScene().getWindow(), contexto)) {
            aplicarPortao();
            // A conexao do CLP so pode ser lida com sessao aberta: agora da.
            carregarConexao();
        }
    }

    @FXML
    public void initialize() {
        AppSettings settings = settingsService.loadSettings();

        chkTelemetriaMqtt.setSelected(settings.isTelemetriaMqttAtiva());
        chkTempoReal.setSelected(settings.isTempoRealAtivo());
        txtTelemetriaUsuario.setText(settings.getTelemetriaUsuario());
        txtTelemetriaSenha.setText(settings.getTelemetriaSenha());
        txtBackendUsuario.setText(settings.getBackendUsuario());
        txtBackendSenha.setText(settings.getBackendSenha());

        mostrarSelecaoSalva(settings);

        btnSave.setOnAction(event -> saveSettings());
        btnCancel.setOnAction(event -> closeWindow());
        btnDesbloquear.setOnAction(event -> desbloquear());
        aplicarPortao();
        btnRecarregar.setOnAction(event -> carregarUnidades());
        chkPlcTsap.selectedProperty().addListener((obs, antiga, nova) -> atualizarModoConexao());

        // Trocar de unidade troca de documento: a conexao mostrada tem de ser a da unidade
        // selecionada, ou salvar gravaria o CLP de uma sonda no documento de outra.
        cmbUnidadeSonda.getSelectionModel().selectedItemProperty()
                .addListener((obs, antiga, nova) -> carregarConexao());

        carregarConexao();
        observarLargura();
    }

    // ------------------------------------------------------------------
    // Conexao com o CLP — configuracao-da-estacao.md §4
    // ------------------------------------------------------------------

    /**
     * Le a conexao do documento da unidade selecionada.
     *
     * <p>⚠️ <b>Ela nao mora em {@code app-settings.json}.</b> Rack, slot, DB e intervalo descrevem o
     * modelo de CLP e sao copiados ao configurar uma sonda igual; torna-los locais tiraria esse
     * ganho e obrigaria a redigitar unidade a unidade.
     *
     * <p>Sem sessao, sem unidade ou com o Backend fora do ar os campos ficam desligados: o valor
     * verdadeiro esta no servidor, e mostrar campos editaveis com o documento nao lido convidaria a
     * gravar por cima do que nao se leu.
     */
    private void carregarConexao() {
        documentoCarregado = null;
        UnidadeSondaOpcao unidade = cmbUnidadeSonda.getSelectionModel().getSelectedItem();

        if (!sessao.liberada()) {
            aplicarPortao();
            desligarConexao("Entre com ADMIN ou SUPORTE para ver a conexão do CLP.");
            return;
        }
        if (unidade == null || unidade.id() == null) {
            desligarConexao("Escolha a Unidade para editar a conexão do CLP.");
            return;
        }

        long unidadeId = unidade.id();
        desligarConexao("Lendo a conexão do CLP…");

        Task<com.geopetro.desktop.models.CardsDaUnidade> tarefa = new Task<>() {
            @Override
            protected com.geopetro.desktop.models.CardsDaUnidade call() {
                return cardsClient.ler(unidadeId);
            }
        };
        tarefa.setOnSucceeded(e -> {
            // Outra troca de unidade pode ter acontecido enquanto esta leitura corria; a resposta
            // atrasada nao pode sobrescrever a selecao atual.
            UnidadeSondaOpcao agora = cmbUnidadeSonda.getSelectionModel().getSelectedItem();
            if (agora == null || agora.id() == null || agora.id() != unidadeId) {
                return;
            }
            documentoCarregado = tarefa.getValue();
            preencherConexao(documentoCarregado.conexao());
            ligarConexao(documentoCarregado.cards().size());
        });
        tarefa.setOnFailed(e -> {
            Throwable causa = tarefa.getException();
            if (!sessao.liberada()) {
                aplicarPortao();
            }
            desligarConexao("Não foi possível ler a conexão do CLP: "
                    + (causa == null ? "falha ao falar com o Backend." : causa.getMessage()));
        });

        Thread thread = new Thread(tarefa, "conexao-clp");
        thread.setDaemon(true);
        thread.start();
    }

    private void preencherConexao(com.geopetro.desktop.models.CardsDaUnidade.Conexao conexao) {
        var valores = conexao == null
                ? com.geopetro.desktop.models.CardsDaUnidade.Conexao.padrao()
                : conexao;
        txtPlcIp.setText(valores.ip() == null ? "" : valores.ip());
        txtPlcRack.setText(String.valueOf(valores.rack()));
        txtPlcSlot.setText(String.valueOf(valores.slot()));
        txtPlcDb.setText(String.valueOf(valores.dbNumero()));
        txtPlcIntervalo.setText(String.valueOf(valores.intervaloLeituraMs()));
        chkPlcTsap.setSelected(valores.usaTsap());
        txtPlcTsapLocal.setText(TsapPlc.formatar(valores.tsapLocal(), 0x0300));
        txtPlcTsapRemoto.setText(TsapPlc.formatar(valores.tsapRemoto(), 0x0200));
    }

    private void ligarConexao(int quantosCards) {
        camposDaConexao().forEach(campo -> campo.setDisable(false));
        chkPlcTsap.setDisable(false);
        atualizarModoConexao();
        lblConexaoStatus.setText(quantosCards == 0
                ? "Unidade ainda sem cards. A conexão pode ser gravada assim mesmo."
                : quantosCards + " card(s) nesta unidade — os cards não são alterados aqui.");
    }

    private void desligarConexao(String motivo) {
        chkPlcTsap.setDisable(true);
        camposDaConexao().forEach(campo -> {
            campo.setDisable(true);
            campo.clear();
        });
        lblConexaoStatus.setText(motivo);
    }

    private List<TextField> camposDaConexao() {
        return List.of(txtPlcIp, txtPlcRack, txtPlcSlot, txtPlcDb, txtPlcIntervalo,
                txtPlcTsapLocal, txtPlcTsapRemoto);
    }

    private void atualizarModoConexao() {
        boolean disponivel = documentoCarregado != null && !chkPlcTsap.isDisabled();
        txtPlcRack.setDisable(!disponivel || chkPlcTsap.isSelected());
        txtPlcSlot.setDisable(!disponivel || chkPlcTsap.isSelected());
        txtPlcTsapLocal.setDisable(!disponivel || !chkPlcTsap.isSelected());
        txtPlcTsapRemoto.setDisable(!disponivel || !chkPlcTsap.isSelected());
    }

    private com.geopetro.desktop.models.CardsDaUnidade.Conexao conexaoDigitada() {
        return new com.geopetro.desktop.models.CardsDaUnidade.Conexao(
                texto(txtPlcIp),
                inteiro(txtPlcRack, 0),
                inteiro(txtPlcSlot, 1),
                inteiro(txtPlcDb, 1),
                inteiro(txtPlcIntervalo, 1000),
                chkPlcTsap.isSelected() ? TsapPlc.ler(texto(txtPlcTsapLocal)) : null,
                chkPlcTsap.isSelected() ? TsapPlc.ler(texto(txtPlcTsapRemoto)) : null);
    }

    /** Campo vazio ou com letra volta ao padrao em vez de derrubar a gravacao inteira. */
    private int inteiro(TextField campo, int padrao) {
        try {
            return Integer.parseInt(texto(campo));
        } catch (NumberFormatException naoENumero) {
            return padrao;
        }
    }

    // ------------------------------------------------------------------
    // Unidade
    // ------------------------------------------------------------------

    /**
     * Mostra o que ja estava salvo antes de qualquer ida ao backend.
     *
     * <p>A tela precisa ser util com o backend fora do ar: sem isso, abrir Configuracoes numa sonda
     * offline daria a impressao de que a unidade se perdeu.
     */
    private void mostrarSelecaoSalva(AppSettings settings) {
        Long id = settings.getUnidadeId();
        String codigo = settings.getIdUnidade();

        if (id == null && (codigo == null || codigo.isBlank())) {
            lblUnidadeStatus.setText("Nenhuma Unidade configurada. Use \"Buscar\" para listar.");
            return;
        }

		UnidadeSondaOpcao salva = new UnidadeSondaOpcao(id, codigo, null, null);
        cmbUnidadeSonda.setItems(FXCollections.observableArrayList(salva));
        cmbUnidadeSonda.getSelectionModel().select(salva);
        lblUnidadeStatus.setText(descreverSelecao(id, codigo) + " (salvo). Use \"Buscar\" para trocar.");
    }

    private void carregarUnidades() {
        AppSettings settings = settingsService.loadSettings();
        String backendUrl = settings.getBackendUrl();
        String token = sessao.token().orElse(null);
        if (token == null) {
            aplicarPortao();
            lblUnidadeStatus.setText("A sessão de configuração expirou. Entre novamente.");
            return;
        }

        btnRecarregar.setDisable(true);
        lblUnidadeStatus.setText("Consultando as Unidades disponíveis...");

        // Chamada de rede fora da thread de UI: 10s de timeout congelariam a janela.
        Task<List<UnidadeSondaOpcao>> tarefa = new Task<>() {
            @Override
            protected List<UnidadeSondaOpcao> call() {
                return catalogoService.listarComToken(backendUrl, token);
            }
        };

        tarefa.setOnSucceeded(e -> {
            btnRecarregar.setDisable(false);
            aplicarUnidades(tarefa.getValue());
        });

        tarefa.setOnFailed(e -> {
            btnRecarregar.setDisable(false);
            Throwable causa = tarefa.getException();
            if (causa instanceof SessaoExpiradaException) {
                sessao.encerrar();
                aplicarPortao();
            }
            String mensagem = causa instanceof CatalogoIndisponivelException
                    ? causa.getMessage()
                    : "Falha ao consultar o Backend.";
            // A selecao anterior fica de pe: falha de rede nao deve apagar o que ja funcionava.
            lblUnidadeStatus.setText(mensagem);
        });

        Thread thread = new Thread(tarefa, "catalogo-unidades");
        thread.setDaemon(true);
        thread.start();
    }

    private void aplicarUnidades(List<UnidadeSondaOpcao> unidades) {
        if (unidades == null || unidades.isEmpty()) {
            lblUnidadeStatus.setText("O Backend não retornou nenhuma Unidade para este usuário.");
            return;
        }

        Long idAtual = settingsService.loadSettings().getUnidadeId();
        cmbUnidadeSonda.setItems(FXCollections.observableArrayList(unidades));

        UnidadeSondaOpcao aSelecionar = unidades.stream()
                .filter(u -> u.id().equals(idAtual))
                .findFirst()
                .orElse(null);

        if (aSelecionar != null) {
            cmbUnidadeSonda.getSelectionModel().select(aSelecionar);
            lblUnidadeStatus.setText(unidades.size() + " unidade(s) encontrada(s).");
        } else {
            cmbUnidadeSonda.getSelectionModel().clearSelection();
            lblUnidadeStatus.setText(unidades.size() + " unidade(s) encontrada(s). Selecione uma.");
        }
    }

    private String descreverSelecao(Long id, String codigo) {
        String texto = codigo == null || codigo.isBlank() ? "(sem código)" : codigo;
        return id == null ? texto : texto + " · id " + id;
    }

    // ------------------------------------------------------------------
    // Layout responsivo
    // ------------------------------------------------------------------

    /**
     * Colapsa para uma coluna em janelas estreitas.
     *
     * <p>FXML nao tem media query, entao a troca acontece aqui, observando a largura da cena. A
     * grade so e remontada quando o estado muda — reagir a cada pixel do arrasto reposicionaria os
     * cartoes continuamente.
     */
    private void observarLargura() {
        Platform.runLater(() -> {
            Scene scene = raiz.getScene();
            if (scene == null) {
                return;
            }
            aplicarLayout(scene.getWidth() >= LARGURA_MINIMA_DUAS_COLUNAS);
            scene.widthProperty().addListener((obs, antigo, novo) ->
                    aplicarLayout(novo.doubleValue() >= LARGURA_MINIMA_DUAS_COLUNAS));
        });
    }

    private void aplicarLayout(boolean duas) {
        if (duas == duasColunas && grade.getColumnConstraints().size() > 0) {
            return;
        }
        duasColunas = duas;

        if (duas) {
            posicionar(cartaoEquipamento, 0, 0);
            posicionar(cartaoMqtt, 1, 0);
            posicionar(cartaoTempoReal, 0, 1);

            grade.getColumnConstraints().setAll(coluna1, coluna2);
            coluna1.setPercentWidth(50.0);
            coluna2.setPercentWidth(50.0);
        } else {
            posicionar(cartaoEquipamento, 0, 0);
            posicionar(cartaoMqtt, 0, 1);
            posicionar(cartaoTempoReal, 0, 2);

            grade.getColumnConstraints().setAll(coluna1);
            coluna1.setPercentWidth(100.0);
        }
    }

    private void posicionar(VBox cartao, int coluna, int linha) {
        GridPane.setColumnIndex(cartao, coluna);
        GridPane.setRowIndex(cartao, linha);
    }

    // ------------------------------------------------------------------
    // Salvar
    // ------------------------------------------------------------------

    /**
     * ⚠️ O portão é conferido <b>aqui também</b>, e não só nos campos desabilitados.
     *
     * <p>Campo desabilitado é aparência: um FXML editado, um bean trocado ou um caminho que chame
     * este método sem passar pela tela gravariam do mesmo jeito. A regra é de autorização
     * (RN-086), não de layout — e regra de autorização que vive só na UI é a que some na primeira
     * refatoração.
     */
    private void saveSettings() {
        // ⚠️ Sem sessao nao se grava NADA. Antes de 2026-09-10 uma parte da tela ficava livre, e o
        // metodo precisava separar o que podia do que nao podia; agora a regra e uma so.
        if (!sessao.liberada()) {
            closeWindow();
            return;
        }

        UnidadeSondaOpcao unidade = cmbUnidadeSonda.getSelectionModel().getSelectedItem();
        AppSettings settings = settingsService.loadSettings();

        settingsService.updateTelemetria(chkTelemetriaMqtt.isSelected(), chkTempoReal.isSelected());
        settingsService.updateTelemetriaCredenciais(
                txtTelemetriaUsuario.getText(), txtTelemetriaSenha.getText());

        // Uma escolha alimenta os dois enderecos: o codigo textual do historico (topico MQTT) e o
        // id numerico do tempo real (topico WebSocket).
		settingsService.updateIdUnidade(unidade == null || unidade.nome() == null
                ? ""
				: unidade.nome().trim());

        settingsService.updateTempoReal(
                unidade == null ? null : unidade.id(),
                settings.getCoreUrl(),
                settings.getBackendUrl(),
                txtBackendUsuario.getText(),
                txtBackendSenha.getText());

        gravarConexao(unidade);
    }

    /**
     * Grava a conexao do CLP no documento da unidade, e so entao fecha a janela.
     *
     * <h2>Por que a janela nao fecha antes</h2>
     * O resto desta tela grava em arquivo local e nao falha na pratica. Esta parte vai a rede: fechar
     * junto com as outras faria uma gravacao recusada — {@code 409}, Backend fora, sessao expirada —
     * desaparecer sem que ninguem visse.
     *
     * <p>As configuracoes locais ja foram gravadas quando este metodo roda. Os enderecos internos
     * continuam preservados no arquivo e nao sao expostos nesta tela.
     */
    private void gravarConexao(UnidadeSondaOpcao unidade) {
        if (documentoCarregado == null || unidade == null || unidade.id() == null) {
            // Nada foi lido, entao nao ha o que gravar — e gravar sem base leria por cima do que
            // nao se conhece. O restante das configuracoes ja esta salvo.
            closeWindow();
            return;
        }

        long unidadeId = unidade.id();
        var base = documentoCarregado;
        com.geopetro.desktop.models.CardsDaUnidade.Conexao nova;
        try {
            nova = conexaoDigitada();
        } catch (IllegalArgumentException invalido) {
            lblConexaoStatus.setText(invalido.getMessage());
            return;
        }

        if (nova.equals(base.conexao())) {
            closeWindow();
            return;
        }

        btnSave.setDisable(true);
        lblConexaoStatus.setText("Gravando a conexão do CLP…");

        Task<com.geopetro.desktop.models.CardsDaUnidade> tarefa = new Task<>() {
            @Override
            protected com.geopetro.desktop.models.CardsDaUnidade call() {
                return cardsClient.salvarConexao(unidadeId, base, nova);
            }
        };
        tarefa.setOnSucceeded(e -> closeWindow());
        tarefa.setOnFailed(e -> {
            btnSave.setDisable(false);
            Throwable causa = tarefa.getException();
            lblConexaoStatus.setText(causa == null
                    ? "Não foi possível gravar a conexão do CLP."
                    : causa.getMessage());
        });

        Thread thread = new Thread(tarefa, "gravar-conexao-clp");
        thread.setDaemon(true);
        thread.start();
    }

    private String texto(TextField campo) {
        String valor = campo.getText();
        return valor == null ? "" : valor.trim();
    }

    private void closeWindow() {
        Stage stage = (Stage) txtPlcIp.getScene().getWindow();
        stage.close();
    }
}
