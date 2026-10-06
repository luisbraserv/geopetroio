package com.braserv.core.identidade.application.port.out;

import java.util.Set;

import com.braserv.core.usuario.domain.model.Usuario;

public interface TokenPort {

	String gerar(Usuario usuario);

	String extrairUsername(String token);

	Set<String> extrairRoles(String token);

	boolean tokenValido(String token);
}
