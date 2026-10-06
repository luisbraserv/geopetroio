package com.example.demo.controllers;

import java.util.Optional;

import com.example.demo.services.AlarmesDaEstacao;
import com.example.demo.services.AlarmesDaEstacao.AlarmeLocal;

import javafx.geometry.Insets;
import javafx.scene.control.ButtonBar;
import javafx.scene.control.ButtonType;
import javafx.scene.control.CheckBox;
import javafx.scene.control.Dialog;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.layout.GridPane;
import javafx.scene.layout.VBox;
import javafx.stage.Window;

/**
 * O ajuste do alarme desta estação, atrás do sininho do card —
 * {@code specs/SDD/negocio/requisitos/configuracao-da-estacao.md §3.1}.
 *
 * <h2>⚠️ Sem login, e é o único assim</h2>
 * Todo o resto da configuração do Desktop exige {@code ADMIN} ou {@code SUPORTE}. Este não, e a
 * razão é a mesma que sustenta o alarme local existir: quem está no equipamento precisa poder dizer
 * "me avise se passar disto" no momento em que precisa, e um portão de rede ali anularia a feature
 * no cenário que a motiva — a sonda sem internet (RN-109).
 *
 * <p>A linha que separa: <b>o sininho não altera o que a unidade lê nem o que ela publica</b>. Ele
 * só decide quando esta máquina apita. Errar aqui não produz dado errado no histórico de cinco anos.
 *
 * <h2>Dois campos, e o tempo mínimo fora</h2>
 * Mínimo, máximo e liga/desliga. O tempo mínimo continua valendo — 3 s para abrir, 5 s para fechar —
 * e não aparece: quem quer ser avisado não quer configurar histerese, e o padrão é o mesmo do
 * servidor para os dois lados não divergirem por acidente (RN-108).
 *
 * <h2>Janela feita em código</h2>
 * Três campos não justificam um par FXML + controller. As janelas de calibração têm FXML porque têm
 * dezenas de campos e desenho próprio.
 */
public final class AlarmeLocalDialog {

	private AlarmeLocalDialog() {
	}

	/** Aplicar grava a faixa; Remover apaga a configuração inteira. */
	private static final ButtonType REMOVER = new ButtonType("Remover", ButtonBar.ButtonData.OTHER);

	/**
	 * Abre o ajuste e grava o que o operador escolher.
	 *
	 * @param rotulo  o nome do card, para a janela dizer de que grandeza se trata
	 * @return {@code true} se algo foi gravado ou removido — a tela precisa saber para atualizar o
	 *         sininho sem esperar o próximo ciclo
	 */
	public static boolean abrir(Window dono, AlarmesDaEstacao alarmes, String dispositivoId, String serie,
			String rotulo, String unidade) {
		AlarmeLocal atual = alarmes.para(dispositivoId, serie);

		var dialogo = new Dialog<ButtonType>();
		dialogo.initOwner(dono);
		dialogo.setTitle("Alarme desta estação");
		dialogo.setHeaderText(rotulo);

		var minimo = campo(atual == null ? null : atual.minimo(), "sem mínimo");
		var maximo = campo(atual == null ? null : atual.maximo(), "sem máximo");
		var ativo = new CheckBox("Alarme ligado");

		// ⚠️ Ligado sem faixa nenhuma nao vigia coisa alguma (RN-108). Em vez de aceitar esse estado
		// e mostrar o sino apagado depois, a caixa fica INDISPONIVEL enquanto nao houver limiar: o
		// engano deixa de ser possivel, em vez de ser corrigido em silencio na gravacao.
		boolean tinhaFaixa = atual != null && (atual.minimo() != null || atual.maximo() != null);
		ativo.setSelected(tinhaFaixa && atual.ativo());
		ativo.setDisable(!tinhaFaixa);

		Runnable acompanharFaixa = () -> {
			boolean temFaixa = numero(minimo) != null || numero(maximo) != null;
			if (temFaixa && ativo.isDisabled()) {
				// Quem acabou de digitar um limiar quer o alarme ligado; pedir um segundo clique
				// para confirmar o obvio e o caminho para alguem sair achando que configurou.
				ativo.setSelected(true);
			}
			ativo.setDisable(!temFaixa);
			if (!temFaixa) {
				ativo.setSelected(false);
			}
		};
		minimo.textProperty().addListener((observavel, antes, agora) -> acompanharFaixa.run());
		maximo.textProperty().addListener((observavel, antes, agora) -> acompanharFaixa.run());

		var grade = new GridPane();
		grade.setHgap(10);
		grade.setVgap(10);
		grade.add(new Label("Mínimo (" + unidade + ")"), 0, 0);
		grade.add(minimo, 1, 0);
		grade.add(new Label("Máximo (" + unidade + ")"), 0, 1);
		grade.add(maximo, 1, 1);
		grade.add(ativo, 1, 2);

		// O aviso e permanente, e nao um erro que aparece ao salvar: explica por que a caixa esta
		// indisponivel antes de alguem tentar clicar nela.
		var nota = new Label("Deixe em branco o lado que não deve alarmar. Sem nenhum dos dois "
				+ "não há o que vigiar, e o alarme fica desligado.\n"
				+ "O aviso espera 3 s fora da faixa para tocar, e 5 s dentro dela para calar.");
		nota.setWrapText(true);
		nota.getStyleClass().add("ajuda");
		nota.setMaxWidth(320);

		var conteudo = new VBox(12, grade, nota);
		conteudo.setPadding(new Insets(4));
		dialogo.getDialogPane().setContent(conteudo);
		dialogo.getDialogPane().getButtonTypes().addAll(ButtonType.APPLY, REMOVER, ButtonType.CANCEL);
		aplicarEstilo(dialogo, dono);

		Optional<ButtonType> escolha = dialogo.showAndWait();
		if (escolha.isEmpty() || escolha.get() == ButtonType.CANCEL) {
			return false;
		}
		if (escolha.get() == REMOVER) {
			alarmes.remover(dispositivoId, serie);
			return true;
		}

		Double min = numero(minimo);
		Double max = numero(maximo);

		// Segunda linha de defesa da mesma invariante: a caixa ja fica indisponivel sem faixa, mas
		// gravar `ativo` sem limiar deixaria no disco um estado que RN-108 nao admite.
		alarmes.gravar(new AlarmeLocal(dispositivoId, serie, min, max,
				ativo.isSelected() && (min != null || max != null)));
		return true;
	}

	private static TextField campo(Double valor, String dica) {
		var campo = new TextField(valor == null ? "" : formatar(valor));
		campo.setPromptText(dica);
		campo.setPrefColumnCount(10);
		return campo;
	}

	/** Sem notação científica e sem casas inventadas: o operador digitou 120, vê 120. */
	private static String formatar(double valor) {
		return valor == Math.rint(valor) ? String.valueOf((long) valor) : String.valueOf(valor);
	}

	/**
	 * Campo vazio é <b>ausência de limiar</b>, não zero.
	 *
	 * <p>⚠️ Texto ilegível também vira ausência, e de propósito: interpretar "12o" como 12 criaria
	 * um alarme que o operador não pediu, na faixa errada — e ele sairia da tela achando que
	 * configurou.
	 */
	private static Double numero(TextField campo) {
		String texto = campo.getText() == null ? "" : campo.getText().trim().replace(',', '.');
		if (texto.isEmpty()) {
			return null;
		}
		try {
			double valor = Double.parseDouble(texto);
			return Double.isFinite(valor) ? valor : null;
		} catch (NumberFormatException naoENumero) {
			return null;
		}
	}

	/** Herda a folha de estilo da janela que abriu, para o diálogo não destoar do resto. */
	private static void aplicarEstilo(Dialog<?> dialogo, Window dono) {
		if (dono != null && dono.getScene() != null) {
			dialogo.getDialogPane().getStylesheets().addAll(dono.getScene().getStylesheets());
		}
	}
}
