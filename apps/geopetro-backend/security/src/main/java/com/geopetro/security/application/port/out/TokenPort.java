package com.geopetro.security.application.port.out;

import java.util.Set;

/**
 * Confere o token de pessoa. A emissao saiu deste backend: quem emite e o Braserv-Core (RN-117).
 */
public interface TokenPort {

	String extrairUsername(String token);

	Set<String> extrairRoles(String token);

	boolean tokenValido(String token);
}
