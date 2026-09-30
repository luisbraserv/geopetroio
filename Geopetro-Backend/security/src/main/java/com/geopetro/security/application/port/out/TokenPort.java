package com.geopetro.security.application.port.out;

import java.util.Set;

import com.geopetro.usuario.domain.model.Usuario;

public interface TokenPort {

	String gerar(Usuario usuario);

	String extrairUsername(String token);

	Set<String> extrairRoles(String token);

	boolean tokenValido(String token);
}
