package com.braserv.core.usuario.application.port.in;

import com.braserv.core.usuario.application.command.CriarUsuarioClienteCommand;
import com.braserv.core.usuario.application.command.CriarUsuarioInternoCommand;
import com.braserv.core.usuario.application.dto.UsuarioOutput;

public interface CriarUsuarioInputPort {

	UsuarioOutput criarCliente(CriarUsuarioClienteCommand command);

	UsuarioOutput criarInterno(CriarUsuarioInternoCommand command);
}
