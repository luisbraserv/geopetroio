package com.geopetro.usuario.application.port.in;

import java.util.Optional;

import com.geopetro.usuario.application.dto.PaginaOutput;
import com.geopetro.usuario.application.dto.UsuarioOutput;

public interface BuscarUsuarioInputPort {

	Optional<UsuarioOutput> buscarPorUsername(String username);

	PaginaOutput<UsuarioOutput> listar(int pagina, int tamanho, String busca);
}
