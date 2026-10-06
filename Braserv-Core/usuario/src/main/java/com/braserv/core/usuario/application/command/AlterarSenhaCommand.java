package com.braserv.core.usuario.application.command;

public record AlterarSenhaCommand(String senhaAtual, String novaSenha, String confirmacaoSenha) {
}
