package com.geopetro.comum.dto;

import java.util.List;

/**
 * Resposta paginada padrão da API (mesmo formato do PaginaOutput de usuários):
 * conteudo + metadados de paginação. Construída a partir de um Spring Data Page
 * pelo próprio controller (core não depende de spring-data).
 */
public record PaginaResponse<T>(List<T> conteudo, int pagina, int tamanho, long totalElementos, int totalPaginas,
		boolean primeira, boolean ultima) {

	public static <T> PaginaResponse<T> de(List<T> conteudo, int pagina, int tamanho, long totalElementos,
			int totalPaginas, boolean primeira, boolean ultima) {
		return new PaginaResponse<>(conteudo, pagina, tamanho, totalElementos, totalPaginas, primeira, ultima);
	}
}
