package com.geopetro.usuario.adapter.in.web.request;

import com.geopetro.usuario.application.command.AlterarSenhaCommand;

public record AlterarSenhaRequest(String senhaAtual, String novaSenha, String confirmacaoSenha) {

	public AlterarSenhaCommand toCommand() {
		return new AlterarSenhaCommand(senhaAtual, novaSenha, confirmacaoSenha);
	}
}
