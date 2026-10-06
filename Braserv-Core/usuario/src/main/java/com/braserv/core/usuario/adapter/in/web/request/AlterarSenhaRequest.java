package com.braserv.core.usuario.adapter.in.web.request;

import com.braserv.core.usuario.application.command.AlterarSenhaCommand;

public record AlterarSenhaRequest(String senhaAtual, String novaSenha, String confirmacaoSenha) {

	public AlterarSenhaCommand toCommand() {
		return new AlterarSenhaCommand(senhaAtual, novaSenha, confirmacaoSenha);
	}
}
