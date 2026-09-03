package com.geopetro.usuario.application.port.in;

import com.geopetro.usuario.application.command.CriarUsuarioClienteCommand;
import com.geopetro.usuario.application.command.CriarUsuarioInternoCommand;
import com.geopetro.usuario.application.dto.UsuarioOutput;

public interface CriarUsuarioInputPort {

	UsuarioOutput criarCliente(CriarUsuarioClienteCommand command);

	UsuarioOutput criarInterno(CriarUsuarioInternoCommand command);
}
