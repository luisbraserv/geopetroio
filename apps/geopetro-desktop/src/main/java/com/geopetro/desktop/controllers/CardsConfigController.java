package com.geopetro.desktop.controllers;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Supplier;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Controller;

import com.geopetro.desktop.models.AppSettings;
import com.geopetro.desktop.models.CardsDaUnidade;
import com.geopetro.desktop.models.CardsDaUnidade.Card;
import com.geopetro.desktop.models.CardsDaUnidade.Conexao;
import com.geopetro.desktop.models.CardsDaUnidade.FormaTanque;
import com.geopetro.desktop.models.CardsDaUnidade.Parametros;
import com.geopetro.desktop.models.CardsDaUnidade.Tipo;
import com.geopetro.desktop.models.UnidadeSondaOpcao;
import com.geopetro.desktop.services.ConfiguracaoCardsClient;
import com.geopetro.desktop.services.CalibracaoDeCards;
import com.geopetro.desktop.services.CopiaDeCards;
import com.geopetro.desktop.services.SessaoConfiguracao;
import com.geopetro.desktop.services.SettingsService;
import com.geopetro.desktop.services.UnidadeSondaCatalogoService;

import javafx.application.Platform;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.concurrent.Task;
import javafx.fxml.FXML;
import javafx.fxml.FXMLLoader;
import javafx.scene.Node;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.control.Alert;
import javafx.scene.control.Button;
import javafx.scene.control.CheckBox;
import javafx.scene.control.ChoiceDialog;
import javafx.scene.control.ComboBox;
import javafx.scene.control.Label;
import javafx.scene.control.SplitPane;
import javafx.scene.control.TableColumn;
import javafx.scene.control.TableView;
import javafx.scene.control.TextField;
import javafx.scene.layout.VBox;
import javafx.stage.Modality;
import javafx.stage.Stage;
import javafx.stage.Window;

/**
 * A tela que configura os cards de uma Unidade — passo 6 de
 * {@code specs/SDD/negocio/requisitos/cards-configuraveis.md §13}.
 *
 * <h2>Edita um rascunho, não o documento</h2>
 * A lista da esquerda é um rascunho em memória. Nada sai daqui até <b>Salvar</b>, que manda o
 * documento inteiro com a revisão que foi lida — se alguém salvou nesse meio-tempo, o backend recusa
 * com 409 e a tela manda recarregar, em vez de sobrescrever o trabalho da outra pessoa.
 *
 * <h2>O que esta tela deliberadamente não faz</h2>
 * <ul>
 *   <li><b>Não lê o CLP enquanto se digita</b> (decisão de 2026-09-07). Confere-se no dashboard,
 *       onde o valor bruto de cada card revela canal mudo ou escala inesperada.</li>
 *   <li><b>Não exclui card</b> — RN-091. Desativar para de publicar e some da tela; excluir deixaria
 *       a série no InfluxDB sem nada que a explicasse.</li>
 *   <li><b>Não valida sozinha o que o backend valida.</b> Quem recusa configuração incompleta é o
 *       backend, e a mensagem dele nomeia o card e o campo. Repetir a regra aqui criaria duas
 *       versões dela para divergir.</li>
 * </ul>
 */
@Controller
public class CardsConfigController {

	private static final Logger logger = LoggerFactory.getLogger(CardsConfigController.class);

	@Autowired private ConfiguracaoCardsClient cliente;
	@Autowired private CalibracaoDeCards calibracoes;
	@Autowired private SettingsService settings;
	@Autowired private SessaoConfiguracao sessao;
	@Autowired private UnidadeSondaCatalogoService catalogo;
	@Autowired private ApplicationContext contexto;

	@FXML private VBox raiz;
	@FXML private SplitPane divisor;
	@FXML private Label lblTitulo;
	@FXML private Label lblSubtitulo;
	@FXML private Label lblStatus;

	@FXML private TableView<Card> tabela;
	@FXML private TableColumn<Card, String> colIdentificacao;
	@FXML private TableColumn<Card, String> colNome;
	@FXML private TableColumn<Card, String> colTipo;
	@FXML private TableColumn<Card, String> colEndereco;
	@FXML private TableColumn<Card, String> colEstado;

	@FXML private Button btnAdicionar;
	@FXML private Button btnSubir;
	@FXML private Button btnDescer;
	@FXML private Button btnAlternarAtivo;
	@FXML private Button btnCopiar;
	@FXML private Button btnRecarregar;
	@FXML private Button btnSalvar;
	@FXML private Button btnFechar;

	@FXML private Label lblSemSelecao;
	@FXML private VBox formulario;
	@FXML private TextField txtNome;
	@FXML private ComboBox<Tipo> cbTipo;
	@FXML private TextField txtByteInicial;
	@FXML private Label lblEndereco;
	@FXML private CheckBox chkAtivo;
	@FXML private CheckBox chkVisivel;
	@FXML private Label lblAvisoInvisivel;

	@FXML private VBox paramCalibracaoLocal;
	@FXML private Label lblCalibracaoAlvo;
	@FXML private Label lblCalibracaoValores;
	@FXML private Label lblCalibracaoEstado;
	@FXML private Button btnAbrirCalibracao;
	@FXML private VBox paramPressao;
	@FXML private TextField txtRangeBar;
	@FXML private VBox paramTemperatura;
	@FXML private TextField txtMinimoEscala;
	@FXML private TextField txtMaximoEscala;
	@FXML private ComboBox<String> cbUnidadeTemperatura;
	@FXML private VBox paramTanque;
	@FXML private ComboBox<FormaTanque> cbFormaTanque;
	@FXML private VBox campoRaio;
	@FXML private VBox campoAltura;
	@FXML private VBox campoComprimento;
	@FXML private VBox campoLargura;
	@FXML private TextField txtRaio;
	@FXML private TextField txtAltura;
	@FXML private TextField txtComprimento;
	@FXML private TextField txtLargura;
	@FXML private TextField txtDistanciaMinima;
	@FXML private TextField txtDistanciaMaxima;
	@FXML private VBox paramStroke;
	@FXML private TextField txtConstanteBomba;

	private final ObservableList<Card> rascunho = FXCollections.observableArrayList();

	private long unidadeId;
	private String dispositivoInicial;
	private boolean modoCardInicial;

	/**
	 * O documento como esta tela o leu — base da conferência de conflito na gravação.
	 *
	 * <p>Substituiu o campo {@code revisao} solto: a revisão sozinha não diz <b>o que</b> mudou
	 * debaixo da tela, e desde que a conexão saiu daqui é preciso distinguir uma alteração nos cards
	 * (conflito) de uma alteração na conexão feita pela engrenagem (que deve passar batida).
	 */
	private CardsDaUnidade documentoCarregado;

	/**
	 * A conexão que uma cópia entre unidades trouxe, e que ainda não foi gravada.
	 *
	 * <p>{@code null} no caso normal — esta tela não edita conexão. A cópia é a exceção: ela
	 * replica rack, slot, DB e intervalo por serem o <b>modelo</b> de CLP, e é o que faz valer a
	 * pena configurar uma sonda igual copiando de outra.
	 */
	private Conexao conexaoCopiada;

	/**
	 * Enquanto o formulário está sendo preenchido a partir do card selecionado, as escutas de
	 * edição não devem gravar de volta — senão o preenchimento se confunde com digitação.
	 */
	private boolean preenchendo;
	/** Evita recarregar o formulario quando uma tecla apenas substitui o card na mesma linha. */
	private boolean atualizandoRascunho;

	/**
	 * Abre a janela, exigindo antes uma sessão de configuração (RN-086).
	 *
	 * <p>Se ninguém autenticou, ou o perfil não configura, ou não há rede, a janela <b>não abre</b>
	 * — e o resto do app segue funcionando. É o desenho: só a configuração fica restrita.
	 */
	public static void abrir(Window dono, ApplicationContext contexto) {
		abrir(dono, contexto, null);
	}

	/** A engrenagem do dashboard abre a tela ja no card que foi clicado. */
	public static void abrir(Window dono, ApplicationContext contexto, String dispositivoId) {
		if (!ConfiguracaoLoginController.exigirSessao(dono, contexto)) {
			return;
		}
		try {
			FXMLLoader loader = new FXMLLoader(
					CardsConfigController.class.getResource("/views/cards-config.fxml"));
			loader.setControllerFactory(contexto::getBean);
			Parent conteudo = loader.load();

			Stage janela = new Stage();
			janela.setTitle(dispositivoId == null ? "Cards da Unidade" : "Calibração do Card");
			janela.setScene(new Scene(conteudo));
			janela.setMinWidth(dispositivoId == null ? 900 : 560);
			janela.setMinHeight(620);
			janela.initModality(Modality.APPLICATION_MODAL);
			if (dono != null) {
				janela.initOwner(dono);
			}
			CardsConfigController controller = loader.getController();
			controller.dispositivoInicial = dispositivoId;
			controller.modoCardInicial = dispositivoId != null;
			if (controller.modoCardInicial) {
				controller.divisor.getItems().remove(0);
			}
			controller.carregar();
			janela.showAndWait();
		} catch (IOException e) {
			logger.error("Erro ao abrir a configuracao de cards", e);
		}
	}

	@FXML
	public void initialize() {
		cbTipo.setItems(FXCollections.observableArrayList(Tipo.values()));
		cbFormaTanque.setItems(FXCollections.observableArrayList(FormaTanque.values()));
		cbUnidadeTemperatura.setItems(FXCollections.observableArrayList("°C", "°F"));

		configurarTabela();
		configurarEscutasDoFormulario();

		btnAdicionar.setOnAction(e -> adicionar());
		btnSubir.setOnAction(e -> mover(-1));
		btnDescer.setOnAction(e -> mover(1));
		btnAlternarAtivo.setOnAction(e -> alternarAtivo());
		btnCopiar.setOnAction(e -> copiarDeOutraUnidade());
		btnAbrirCalibracao.setOnAction(e -> abrirCalibracao());
		btnRecarregar.setOnAction(e -> carregar());
		btnSalvar.setOnAction(e -> salvar());
		btnFechar.setOnAction(e -> ((Stage) btnFechar.getScene().getWindow()).close());

		atualizarSelecao(null);
	}

	private void configurarTabela() {
		tabela.setItems(rascunho);
		// Sem isto as colunas somam uma largura fixa maior que o painel, e as duas ultimas ficam
		// fora da tela — junto com a largura preferida que a tabela impunha ao VBox inteiro.
		tabela.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_FLEX_LAST_COLUMN);
		tabela.setPlaceholder(new Label("Nenhum card configurado."));
		colIdentificacao.setCellValueFactory(c -> texto(c.getValue().identificacao()));
		colNome.setCellValueFactory(c -> texto(c.getValue().nome()));
		colTipo.setCellValueFactory(c -> texto(c.getValue().tipo().rotulo()));
		colEndereco.setCellValueFactory(
				c -> texto(c.getValue().tipo().enderecoLegivel(c.getValue().byteInicial())));
		colEstado.setCellValueFactory(c -> texto(c.getValue().ativo() ? "Ativo" : "Desativado"));

		tabela.getSelectionModel().selectedItemProperty()
				.addListener((obs, anterior, atual) -> {
					if (!atualizandoRascunho) {
						atualizarSelecao(atual);
					}
				});
	}

	private static SimpleStringProperty texto(String valor) {
		return new SimpleStringProperty(valor == null ? "" : valor);
	}

	/**
	 * Cada campo grava no card assim que muda.
	 *
	 * <p>Sem isto seria preciso um botão "aplicar" por card, ou gravar só ao trocar de seleção — e
	 * quem editasse o último card e clicasse direto em Salvar perderia o que digitou.
	 */
	private void configurarEscutasDoFormulario() {
		List<TextField> campos = List.of(txtNome, txtByteInicial, txtRangeBar, txtMinimoEscala,
				txtMaximoEscala, txtRaio, txtAltura, txtComprimento, txtLargura,
				txtDistanciaMinima, txtDistanciaMaxima, txtConstanteBomba);
		campos.forEach(campo -> campo.textProperty().addListener((obs, a, b) -> aplicarNoSelecionado()));

		chkAtivo.selectedProperty().addListener((obs, a, b) -> {
			atualizarAvisoDeInvisivel();
			aplicarNoSelecionado();
		});
		chkVisivel.selectedProperty().addListener((obs, a, b) -> {
			atualizarAvisoDeInvisivel();
			aplicarNoSelecionado();
		});
		cbUnidadeTemperatura.valueProperty().addListener((obs, a, b) -> aplicarNoSelecionado());

		cbTipo.valueProperty().addListener((obs, anterior, atual) -> {
			mostrarParametrosDe(atual);
			// Os campos de dimensao ja aparecem como cilindro vertical; deixar a combo vazia faria
			// a tela mostrar "Raio" e "Altura" sem dizer de que forma eles sao. E o backend exige a
			// forma de qualquer modo. Só ao escolher o tipo — nao ao preencher a partir de um card,
			// onde a forma gravada e quem manda.
			if (!preenchendo && atual == Tipo.NIVEL_TANQUE && cbFormaTanque.getValue() == null) {
				cbFormaTanque.setValue(FormaTanque.CILINDRICO_VERTICAL);
			}
			aplicarNoSelecionado();
		});
		cbFormaTanque.valueProperty().addListener((obs, anterior, atual) -> {
			mostrarDimensoesDe(atual);
			aplicarNoSelecionado();
		});
	}

	// ===================================================================== carga

	private void carregar() {
		long id = idDaUnidadeConfigurada();
		if (id <= 0) {
			status("Escolha a Unidade desta estação em Configurações antes de configurar os cards.");
			desabilitarEdicao(true);
			return;
		}
		unidadeId = id;
		lblTitulo.setText(modoCardInicial ? "Configuração do card" : "Cards da unidade " + id);

		emSegundoPlano("Carregando…", () -> cliente.ler(id), documento -> {
			documentoCarregado = documento;
			conexaoCopiada = null;
			rascunho.setAll(documento.cards());
			desabilitarEdicao(false);
			tabela.getSelectionModel().clearSelection();
			Card inicial = documento.cards().stream()
					.filter(card -> card.dispositivoId() != null
							&& card.dispositivoId().equals(dispositivoInicial))
					.findFirst().orElse(null);
			if (inicial == null) {
				atualizarSelecao(null);
			} else {
				tabela.getSelectionModel().select(inicial);
			}

			if (documento.configurada()) {
				lblSubtitulo.setText("Revisão %d · alterada por %s".formatted(
						documento.revisao(),
						documento.atualizadoPor() == null ? "—" : documento.atualizadoPor()));
				status("");
			} else {
				lblSubtitulo.setText("Esta unidade ainda não tem cards.");
				// A frota nasce vazia por decisao de produto (§10), e a copia e a mitigacao dela.
				status("Sem cards, a unidade não lê nada. Adicione um card ou copie de outra unidade.");
			}
		});
	}

	private long idDaUnidadeConfigurada() {
		AppSettings configuracoes = settings.loadSettings();
		Long id = configuracoes == null ? null : configuracoes.getUnidadeId();
		return id == null ? 0 : id;
	}

	// ===================================================================== seleção e formulário

	private void atualizarSelecao(Card card) {
		boolean temCard = card != null;
		formulario.setVisible(temCard);
		formulario.setManaged(temCard);
		lblSemSelecao.setVisible(!temCard);
		lblSemSelecao.setManaged(!temCard);
		btnSubir.setDisable(!temCard);
		btnDescer.setDisable(!temCard);
		btnAlternarAtivo.setDisable(!temCard);
		if (!temCard) {
			return;
		}

		btnAlternarAtivo.setText(card.ativo() ? "Desativar" : "Reativar");
		if (modoCardInicial) {
			lblTitulo.setText("Calibração — " + card.nome() + " (" + card.dispositivoId() + ")");
		}
		preenchendo = true;
		try {
			txtNome.setText(card.nome());
			cbTipo.setValue(card.tipo());
			txtByteInicial.setText(String.valueOf(card.byteInicial()));
			chkAtivo.setSelected(card.ativo());
			chkVisivel.setSelected(card.visivel());
			// Explicito: trocar para um card com os MESMOS dois valores nao dispara listener nenhum,
			// e o aviso ficaria com o estado do card anterior.
			atualizarAvisoDeInvisivel();

			Parametros p = card.parametros() == null ? Parametros.vazio() : card.parametros();
			txtRangeBar.setText(numero(p.rangeSensorBar()));
			txtMinimoEscala.setText(numero(p.minimoEscala()));
			txtMaximoEscala.setText(numero(p.maximoEscala()));
			cbUnidadeTemperatura.setValue(p.unidade() == null ? "°C" : p.unidade());
			cbFormaTanque.setValue(p.forma());
			txtRaio.setText(numero(p.raio()));
			txtAltura.setText(numero(p.altura()));
			txtComprimento.setText(numero(p.comprimento()));
			txtLargura.setText(numero(p.largura()));
			txtDistanciaMinima.setText(numero(p.distanciaMinima()));
			txtDistanciaMaxima.setText(numero(p.distanciaMaxima()));
			txtConstanteBomba.setText(numero(p.constanteBomba()));

			mostrarParametrosDe(card.tipo());
			mostrarDimensoesDe(p.forma());
			atualizarEnderecoLegivel(card.tipo(), card.byteInicial());
		} finally {
			preenchendo = false;
		}
	}

	/** Grava o formulário de volta no card selecionado, preservando o id, que é do servidor. */
	private void aplicarNoSelecionado() {
		if (preenchendo) {
			return;
		}
		int indice = tabela.getSelectionModel().getSelectedIndex();
		if (indice < 0) {
			return;
		}
		Card atual = rascunho.get(indice);
		Tipo tipo = cbTipo.getValue() == null ? atual.tipo() : cbTipo.getValue();
		int byteInicial = inteiro(txtByteInicial.getText(), atual.byteInicial());

		Card novo = new Card(
				atual.dispositivoId(),
				txtNome.getText(),
				tipo,
				byteInicial,
				chkAtivo.isSelected(),
				chkVisivel.isSelected(),
				atual.ordem(),
				lerParametros(tipo));

		atualizandoRascunho = true;
		try {
			rascunho.set(indice, novo);
			tabela.getSelectionModel().select(indice);
		} finally {
			atualizandoRascunho = false;
		}
		btnAlternarAtivo.setText(novo.ativo() ? "Desativar" : "Reativar");
		atualizarEnderecoLegivel(tipo, byteInicial);
	}

	/**
	 * Só os parâmetros do tipo escolhido são lidos.
	 *
	 * <p>Quem troca um card de tanque para pressão não deve mandar raio e altura junto: o backend os
	 * ignoraria, mas eles voltariam na próxima leitura como se ainda valessem.
	 */
	private Parametros lerParametros(Tipo tipo) {
		return switch (tipo) {
			case PRESSAO, PESO, TORQUE -> new Parametros(decimal(txtRangeBar.getText()),
					null, null, null, null, null, null, null, null, null, null, null);
			case TEMPERATURA -> new Parametros(null,
					decimal(txtMinimoEscala.getText()), decimal(txtMaximoEscala.getText()),
					cbUnidadeTemperatura.getValue(),
					null, null, null, null, null, null, null, null);
			case NIVEL_TANQUE -> new Parametros(null, null, null, null,
					cbFormaTanque.getValue(),
					decimal(txtRaio.getText()), decimal(txtAltura.getText()),
					decimal(txtComprimento.getText()), decimal(txtLargura.getText()),
					decimal(txtDistanciaMinima.getText()), decimal(txtDistanciaMaxima.getText()),
					null);
			case CONTADOR_STROKE -> new Parametros(null, null, null, null, null, null, null, null,
					null, null, null, decimal(txtConstanteBomba.getText()));
		};
	}

	private void mostrarParametrosDe(Tipo tipo) {
		Tipo escolhido = tipo == null ? Tipo.PESO : tipo;
		exibir(paramPressao, escolhido == Tipo.PRESSAO || escolhido == Tipo.PESO || escolhido == Tipo.TORQUE);
		exibir(paramTemperatura, escolhido == Tipo.TEMPERATURA);
		exibir(paramTanque, escolhido == Tipo.NIVEL_TANQUE);
		exibir(paramStroke, escolhido == Tipo.CONTADOR_STROKE);
		boolean calibracaoLocal = escolhido == Tipo.PESO || escolhido == Tipo.TORQUE;
		exibir(paramCalibracaoLocal, calibracaoLocal);
		if (calibracaoLocal) {
			mostrarCalibracaoLocal(escolhido);
		}
	}

	/** Mostra a calibracao local do dispositivo selecionado, identificada por dispositivoId. */
	private void mostrarCalibracaoLocal(Tipo tipo) {
		Card selecionado = tabela.getSelectionModel().getSelectedItem();
		if (selecionado == null || selecionado.novo()) {
			lblCalibracaoAlvo.setText("Calibração — " + tipo.rotulo());
			lblCalibracaoValores.setText("—");
			alertarCalibracao("Salve o card antes de calibrá-lo.");
			return;
		}
		var calibracao = calibracoes.para(selecionado.dispositivoId());

		if (tipo == Tipo.PESO) {
			var peso = calibracao.peso();
			lblCalibracaoAlvo.setText("Calibração — " + selecionado.nome());
			lblCalibracaoValores.setText(peso == null ? "—" : ("""
					área efetiva %.3f pol²  ·  braço %.3f pol
					tambor %.2f pol  ·  cabo %.3f pol  ·  %d linhas
					catarina %.0f lbf  ·  fator %.4f""")
					.formatted(peso.getAreaEfetivaSensorPol2(), peso.getBracoSensorPol(),
							peso.getDiametroTamborPol(), peso.getDiametroCaboPol(),
							peso.getNumeroLinhas(), peso.getPesoCatarinaLbf(),
							peso.getFatorCalibracao()));
			estadoDaCalibracao(peso != null && peso.isConfigurado());
			return;
		}

		var chave = calibracao.chave();
		lblCalibracaoAlvo.setText("Calibração — " + selecionado.nome());
		lblCalibracaoValores.setText(chave == null ? "—" : ("""
				pistão %.3f pol  ·  haste %.3f pol
				braço da alavanca %.3f ft  ·  %s""")
				.formatted(chave.getDiametroPistaoIn(), chave.getDiametroHasteIn(),
						chave.getBracoAlavancaFt(),
						chave.getTipoMovimento() == null ? "—" : chave.getTipoMovimento()));
		estadoDaCalibracao(chave != null && chave.isConfigurado());
	}

	private void estadoDaCalibracao(boolean configurada) {
		if (configurada) {
			trocarEstilo(lblCalibracaoEstado, "estado-ok");
			lblCalibracaoEstado.setText("Calibração preenchida nesta estação.");
		} else {
			alertarCalibracao("Ainda não calibrado — o card lê o CLP, mas não publica valor convertido.");
		}
	}

	private void alertarCalibracao(String mensagem) {
		trocarEstilo(lblCalibracaoEstado, "estado-atencao");
		lblCalibracaoEstado.setText(mensagem);
	}

	private static void trocarEstilo(Label rotulo, String estilo) {
		rotulo.getStyleClass().removeAll("estado-ok", "estado-atencao", "estado-erro");
		rotulo.getStyleClass().add(estilo);
	}

	/** Abre o mesmo editor por dispositivo que a engrenagem do dashboard. */
	private void abrirCalibracao() {
		Card selecionado = tabela.getSelectionModel().getSelectedItem();
		if (selecionado == null) {
			return;
		}
		if (selecionado.novo() || documentoCarregado == null
				|| !rascunho.equals(documentoCarregado.cards()) || conexaoCopiada != null) {
			status("Salve as alterações dos cards antes de abrir a calibração.");
			return;
		}
		dispositivoInicial = selecionado.dispositivoId();
		CalibracaoCardDialog.abrir(raiz.getScene().getWindow(), contexto,
				documentoCarregado, selecionado, Double.NaN);
		carregar();
	}

	/** RN-084: o cilindro horizontal não usa altura, e o retangular não usa raio. */
	private void mostrarDimensoesDe(FormaTanque forma) {
		FormaTanque escolhida = forma == null ? FormaTanque.CILINDRICO_VERTICAL : forma;
		exibir(campoRaio, escolhida != FormaTanque.RETANGULAR);
		exibir(campoAltura, escolhida != FormaTanque.CILINDRICO_HORIZONTAL);
		exibir(campoComprimento, escolhida != FormaTanque.CILINDRICO_VERTICAL);
		exibir(campoLargura, escolhida == FormaTanque.RETANGULAR);
	}

	private void atualizarEnderecoLegivel(Tipo tipo, int byteInicial) {
		int tamanho = tipo.tamanhoEmBytes();
		lblEndereco.setText("%s · %d bytes (%d a %d)".formatted(
				tipo.enderecoLegivel(byteInicial), tamanho, byteInicial, byteInicial + tamanho - 1));
	}

	private static void exibir(Node no, boolean visivel) {
		no.setVisible(visivel);
		no.setManaged(visivel);
	}

	/**
	 * Avisa quando o card fica <b>ativo e invisível</b> — OQ-050.
	 *
	 * <h2>O silêncio que duas regras certas produzem juntas</h2>
	 * Visibilidade controla <b>publicação</b>, não leitura (RN-037): o card invisível continua sendo
	 * lido e gravado nesta estação. Só que a avaliação de alarme do servidor roda sobre o canal de
	 * tempo real (RN-102), que carrega apenas os visíveis — então <b>o limite dele nunca dispara
	 * para a supervisão</b>. As duas regras estão certas isoladamente; o encontro delas é que
	 * desliga a vigilância remota sem dizer.
	 *
	 * <p>⚠️ <b>Avisa e não impede.</b> Esconder um card do dashboard é escolha legítima de quem
	 * configura, e recusá-la aqui acoplaria esta tela — de {@code ADMIN}/{@code SUPORTE} — à de
	 * limites, que é de quem enxerga a sonda, inclusive {@code CLIENTE} (RN-069).
	 *
	 * <p>Card <b>desativado</b> não recebe aviso: ele não é lido nem publicado, e a tela já diz o que
	 * desativar significa.
	 */
	private void atualizarAvisoDeInvisivel() {
		boolean lidoESemPublicar = chkAtivo.isSelected() && !chkVisivel.isSelected();
		if (lidoESemPublicar) {
			lblAvisoInvisivel.setText("""
					⚠️ Card ativo e invisível: continua sendo lido e gravado nesta estação, e não é \
					enviado ao monitoramento. Um limite de alarme sobre ele acende aqui na sonda e \
					não chega à supervisão.""");
		}
		exibir(lblAvisoInvisivel, lidoESemPublicar);
	}

	// ===================================================================== edição da lista

	private void adicionar() {
		int ordem = rascunho.stream().mapToInt(Card::ordem).max().orElse(-1) + 1;
		// Id nulo: quem numera e o backend, que enxerga todos os ids ja usados na unidade (RN-081).
		rascunho.add(new Card(null, "Novo card", Tipo.PRESSAO, 0, true, true, ordem, Parametros.vazio()));
		tabela.getSelectionModel().selectLast();
		txtNome.requestFocus();
		txtNome.selectAll();
	}

	private void mover(int direcao) {
		int indice = tabela.getSelectionModel().getSelectedIndex();
		int destino = indice + direcao;
		if (indice < 0 || destino < 0 || destino >= rascunho.size()) {
			return;
		}
		Card movido = rascunho.get(indice);
		rascunho.set(indice, rascunho.get(destino));
		rascunho.set(destino, movido);
		tabela.getSelectionModel().select(destino);
	}

	/** Desativar é o mais perto de excluir que existe aqui — RN-091. */
	private void alternarAtivo() {
		int indice = tabela.getSelectionModel().getSelectedIndex();
		if (indice < 0) {
			return;
		}
		Card card = rascunho.get(indice);
		rascunho.set(indice, card.comAtivo(!card.ativo()));
		tabela.getSelectionModel().select(indice);
		atualizarSelecao(rascunho.get(indice));
	}

	// ===================================================================== cópia entre unidades

	private void copiarDeOutraUnidade() {
		String base = settings.loadSettings() == null ? null : settings.loadSettings().getBackendUrl();
		String token = sessao.token().orElse(null);

		emSegundoPlano("Buscando unidades…", () -> catalogo.listarComToken(base, token), unidades -> {
			List<UnidadeSondaOpcao> outras = unidades.stream()
					.filter(u -> u.id() != null && u.id() != unidadeId)
					.toList();
			if (outras.isEmpty()) {
				status("Não há outra unidade disponível para copiar.");
				return;
			}
			escolher(outras).ifPresent(this::copiarDe);
		});
	}

	private Optional<UnidadeSondaOpcao> escolher(List<UnidadeSondaOpcao> opcoes) {
		ChoiceDialog<UnidadeSondaOpcao> dialogo = new ChoiceDialog<>(opcoes.get(0), opcoes);
		dialogo.setTitle("Copiar de outra unidade");
		dialogo.setHeaderText("De qual unidade copiar a configuração?");
		dialogo.setContentText("Unidade");
		dialogo.initOwner(raiz.getScene().getWindow());
		return dialogo.showAndWait();
	}

	private void copiarDe(UnidadeSondaOpcao origem) {
		emSegundoPlano("Lendo a configuração de " + origem.rotulo() + "…",
				() -> cliente.ler(origem.id()),
				documento -> {
					var destino = new CardsDaUnidade(1, unidadeId, documentoCarregado.revisao(),
							conexaoAtual(), List.copyOf(rascunho), null, null);
					try {
						var copia = CopiaDeCards.copiar(documento, destino);
						rascunho.setAll(copia.cards());
						conexaoCopiada = copia.conexao();
						atualizarSelecao(null);
						// O IP nao vem junto de proposito: veja CopiaDeCards#conexaoPara. E como o
						// painel de conexao saiu desta tela, o que a copia trouxe precisa ser DITO —
						// gravar rack/slot/DB novos sem mostra-los seria alterar o que ninguem viu.
						status("Copiado de " + origem.rotulo() + ": cards, e também rack "
								+ copia.conexao().rack() + ", slot " + copia.conexao().slot()
								+ ", DB " + copia.conexao().dbNumero() + " e intervalo "
								+ copia.conexao().intervaloLeituraMs() + " ms. O IP não vem junto — "
								+ "confira-o na engrenagem. Salve para aplicar.");
					} catch (CopiaDeCards.CopiaRecusadaException recusada) {
						alertar("Não foi possível copiar", recusada.getMessage());
						status("");
					}
				});
	}

	// ===================================================================== gravação

	/**
	 * ⚠️ Grava <b>só os cards</b>, salvo quando uma cópia trouxe a conexão junto.
	 *
	 * <p>A conexão saiu desta tela ({@code configuracao-da-estacao.md §4}) mas continua no mesmo
	 * documento, e o {@code PUT} leva o documento inteiro. Reenviar a conexão que esta tela leu ao
	 * abrir apontaria a estação para o CLP anterior se alguém tivesse corrigido o IP na engrenagem
	 * no intervalo — por isso quem decide o que vai no campo {@code conexao} é o cliente, relendo.
	 */
	private void salvar() {
		if (documentoCarregado == null) {
			status("Recarregue antes de salvar.");
			return;
		}

		// A ordem e reatribuida pela posicao na lista: o backend recusa duas posicoes iguais, e
		// mover cards para cima e para baixo deixaria buracos e repeticoes se ela fosse mantida.
		List<Card> cards = new ArrayList<>();
		for (int i = 0; i < rascunho.size(); i++) {
			cards.add(rascunho.get(i).comOrdem(i));
		}

		var base = documentoCarregado;
		var conexao = conexaoCopiada;
		emSegundoPlano("Salvando…",
				() -> conexao == null
						? cliente.salvarCards(unidadeId, base, cards)
						: cliente.salvarTudo(unidadeId, base, conexao, cards),
				salvo -> {
					documentoCarregado = salvo;
					conexaoCopiada = null;
					rascunho.setAll(salvo.cards());
					atualizarSelecao(null);
					lblSubtitulo.setText("Revisão %d · alterada por %s".formatted(
							salvo.revisao(),
							salvo.atualizadoPor() == null ? "—" : salvo.atualizadoPor()));
					status("Salvo. A unidade passa a ler esta configuração no próximo ciclo.");
				});
	}

	/** A conexão vigente: a que a cópia trouxe, ou a do documento lido. */
	private Conexao conexaoAtual() {
		if (conexaoCopiada != null) {
			return conexaoCopiada;
		}
		return documentoCarregado == null || documentoCarregado.conexao() == null
				? Conexao.padrao()
				: documentoCarregado.conexao();
	}

	// ===================================================================== apoio

	/**
	 * Roda a chamada ao backend fora da thread da interface.
	 *
	 * <p>Rodando nela, um backend lento congelaria a janela — e é justamente quando o backend está
	 * ruim que a pessoa precisa conseguir fechar a tela.
	 */
	private <T> void emSegundoPlano(String aguardando, Supplier<T> chamada, java.util.function.Consumer<T> aoTerminar) {
		status(aguardando);
		ocupado(true);

		Task<T> tarefa = new Task<>() {
			@Override
			protected T call() {
				return chamada.get();
			}
		};
		tarefa.setOnSucceeded(evento -> {
			ocupado(false);
			aoTerminar.accept(tarefa.getValue());
		});
		tarefa.setOnFailed(evento -> {
			ocupado(false);
			Throwable causa = tarefa.getException();
			logger.warn("Falha na configuracao de cards da unidade {}: {}", unidadeId,
					causa == null ? "desconhecida" : causa.getMessage());
			if (causa instanceof ConfiguracaoCardsClient.CardsDesatualizadosException) {
				// Aqui nao adianta tentar de novo: e preciso recarregar e refazer sobre o gravado.
				// O status vem ANTES do alerta: alertar() bloqueia em showAndWait(), e o rodape
				// atras do modal continuaria dizendo "Salvando...", contradizendo o que o modal diz.
				status("Recarregue antes de salvar.");
				alertar("Configuração desatualizada", causa.getMessage());
			} else {
				status(causa == null ? "Falha inesperada." : causa.getMessage());
			}
		});
		new Thread(tarefa, "cards-config").start();
	}

	private void ocupado(boolean ocupado) {
		btnSalvar.setDisable(ocupado);
		btnRecarregar.setDisable(ocupado);
		btnCopiar.setDisable(ocupado);
	}

	private void desabilitarEdicao(boolean desabilitar) {
		btnAdicionar.setDisable(desabilitar);
		btnSalvar.setDisable(desabilitar);
		btnCopiar.setDisable(desabilitar);
		divisor.setDisable(desabilitar);
	}

	private void status(String mensagem) {
		if (Platform.isFxApplicationThread()) {
			lblStatus.setText(mensagem);
		} else {
			Platform.runLater(() -> lblStatus.setText(mensagem));
		}
	}

	private void alertar(String titulo, String mensagem) {
		Alert alerta = new Alert(Alert.AlertType.WARNING);
		alerta.setTitle(titulo);
		alerta.setHeaderText(titulo);
		alerta.setContentText(mensagem);
		alerta.initOwner(raiz.getScene().getWindow());
		alerta.showAndWait();
	}

	private static String numero(Double valor) {
		if (valor == null) {
			return "";
		}
		// Sem o ".0" quando e inteiro: "250" le melhor que "250.0" num campo de range.
		return valor == Math.floor(valor) && !valor.isInfinite()
				? String.valueOf(valor.longValue())
				: String.valueOf(valor);
	}

	/** Campo em branco ou meio digitado não é erro: vira {@code null} e o backend cobra. */
	private static Double decimal(String texto) {
		if (texto == null || texto.isBlank()) {
			return null;
		}
		try {
			return Double.valueOf(texto.trim().replace(',', '.'));
		} catch (NumberFormatException e) {
			return null;
		}
	}

	private static int inteiro(String texto, int padrao) {
		if (texto == null || texto.isBlank()) {
			return padrao;
		}
		try {
			return Integer.parseInt(texto.trim());
		} catch (NumberFormatException e) {
			return padrao;
		}
	}
}
