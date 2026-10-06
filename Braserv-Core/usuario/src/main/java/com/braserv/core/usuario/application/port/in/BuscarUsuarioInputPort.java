package com.braserv.core.usuario.application.port.in;

import java.util.Optional;

import com.braserv.core.usuario.application.dto.PaginaOutput;
import com.braserv.core.usuario.application.dto.UsuarioOutput;

public interface BuscarUsuarioInputPort {

	Optional<UsuarioOutput> buscarPorUsername(String username);

	PaginaOutput<UsuarioOutput> listar(int pagina, int tamanho, String busca);
}
