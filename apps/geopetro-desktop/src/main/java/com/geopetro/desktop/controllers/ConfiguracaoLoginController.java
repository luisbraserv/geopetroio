package com.geopetro.desktop.controllers;

import java.io.IOException;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Controller;

import com.geopetro.desktop.services.SessaoConfiguracao;

import javafx.application.Platform;
import javafx.concurrent.Task;
import javafx.fxml.FXML;
import javafx.fxml.FXMLLoader;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.PasswordField;
import javafx.scene.control.TextField;
import javafx.stage.Modality;
import javafx.stage.Stage;
import javafx.stage.Window;

/**
 * O login que libera as janelas de configuração — RN-086, RN-087.
 *
 * <p>Não é o login do app: o Desktop não pede credencial para iniciar, ler o CLP ou publicar. Esta
 * janela aparece quando alguém vai <b>abrir</b> uma configuração, e a sessão vale até o app fechar.
 *
 * <p>Use {@link #exigirSessao(Window, ApplicationContext)} — ele não abre janela nenhuma se a sessão
 * já estiver liberada, que é o caso a partir da segunda vez.
 */
@Controller
public class ConfiguracaoLoginController {

	@Autowired
	private SessaoConfiguracao sessao;

	@FXML private TextField txtUsuario;
	@FXML private PasswordField txtSenha;
	@FXML private Label lblErro;
	@FXML private Label lblAguarde;
	@FXML private Button btnEntrar;
	@FXML private Button btnCancelar;

	private boolean liberada;

	/**
	 * Garante uma sessão de configuração aberta, pedindo login se preciso.
	 *
	 * @return {@code true} se pode configurar. {@code false} se a pessoa desistiu, errou a
	 *         credencial, não tem perfil, ou está sem rede — nos quatro casos a janela de
	 *         configuração não deve abrir
	 */
	public static boolean exigirSessao(Window dono, ApplicationContext contexto) {
		SessaoConfiguracao sessao = contexto.getBean(SessaoConfiguracao.class);
		if (sessao.liberada()) {
			return true;
		}
		try {
			FXMLLoader loader = new FXMLLoader(
					ConfiguracaoLoginController.class.getResource("/views/configuracao-login.fxml"));
			loader.setControllerFactory(contexto::getBean);
			Parent raiz = loader.load();

			Stage janela = new Stage();
			janela.setTitle("Entrar para configurar");
			janela.setScene(new Scene(raiz));
			janela.initModality(Modality.APPLICATION_MODAL);
			if (dono != null) {
				janela.initOwner(dono);
			}
			janela.setResizable(false);
			janela.showAndWait();

			return loader.<ConfiguracaoLoginController>getController().liberada;
		} catch (IOException e) {
			// Sem a janela nao ha como autenticar, e sem autenticar nao se configura.
			return false;
		}
	}

	@FXML
	public void initialize() {
		btnEntrar.setOnAction(evento -> entrar());
		btnCancelar.setOnAction(evento -> fechar());

		Platform.runLater(txtUsuario::requestFocus);
	}

	/**
	 * O login vai para uma thread de fora: ele fala com o Core, e um Core lento congelaria a
	 * janela inteira se rodasse na thread da interface.
	 */
	private void entrar() {
		String usuario = txtUsuario.getText();
		String senha = txtSenha.getText();
		ocupado(true);

		Task<SessaoConfiguracao.Resultado> tarefa = new Task<>() {
			@Override
			protected SessaoConfiguracao.Resultado call() {
				return sessao.abrir(usuario, senha);
			}
		};
		tarefa.setOnSucceeded(evento -> {
			ocupado(false);
			tratar(tarefa.getValue());
		});
		tarefa.setOnFailed(evento -> {
			ocupado(false);
			mostrarErro("Não foi possível entrar: " + tarefa.getException().getMessage());
		});
		new Thread(tarefa, "login-configuracao").start();
	}

	/**
	 * Cada recusa tem uma mensagem própria de propósito.
	 *
	 * <p>Quem digitou a senha certa mas não tem o perfil ficaria tentando de novo se a tela dissesse
	 * "credencial inválida"; e quem está sem rede precisa saber que não adianta redigitar. Nada
	 * disso vaza informação: a pessoa já conhece o próprio perfil.
	 */
	private void tratar(SessaoConfiguracao.Resultado resultado) {
		switch (resultado) {
			case SessaoConfiguracao.Resultado.Liberada ignorado -> {
				liberada = true;
				fechar();
			}
			case SessaoConfiguracao.Resultado.CredencialInvalida ignorado ->
				mostrarErro("Usuário ou senha incorretos.");
			case SessaoConfiguracao.Resultado.PerfilSemPermissao perfil ->
				mostrarErro("O usuário " + perfil.usuario()
						+ " não tem perfil de configuração. Só ADMIN ou SUPORTE alteram a configuração.");
			case SessaoConfiguracao.Resultado.CoreIndisponivel indisponivel ->
				mostrarErro("Sem conexão com o Braserv-Core, e não há validação local: não é possível "
						+ "configurar agora. (" + indisponivel.motivo() + ")");
			case SessaoConfiguracao.Resultado.CoreNaoConfigurado ignorado ->
				mostrarErro("O servidor do aplicativo não está configurado. Reinstale o aplicativo.");
		}
	}

	private void mostrarErro(String mensagem) {
		lblErro.setText(mensagem);
		lblErro.setVisible(true);
		lblErro.setManaged(true);
		txtSenha.clear();
		txtSenha.requestFocus();
	}

	private void ocupado(boolean ocupado) {
		btnEntrar.setDisable(ocupado);
		lblAguarde.setVisible(ocupado);
		lblAguarde.setManaged(ocupado);
		if (ocupado) {
			lblErro.setVisible(false);
			lblErro.setManaged(false);
		}
	}

	private void fechar() {
		((Stage) btnEntrar.getScene().getWindow()).close();
	}
}
