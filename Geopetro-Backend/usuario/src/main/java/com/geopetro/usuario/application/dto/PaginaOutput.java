package com.geopetro.usuario.application.dto;

import java.util.List;

public record PaginaOutput<T>(List<T> conteudo, int pagina, int tamanho, long totalElementos, int totalPaginas,
		boolean primeira, boolean ultima) {
}
