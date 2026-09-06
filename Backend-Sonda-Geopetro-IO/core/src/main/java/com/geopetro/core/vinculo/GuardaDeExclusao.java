package com.geopetro.core.vinculo;

import java.util.ArrayList;
import java.util.List;

import org.springframework.http.HttpStatus;

import com.geopetro.core.exception.BusinessException;
import com.geopetro.core.port.VinculoCadastroPort;
import com.geopetro.core.port.VinculoCadastroPort.Cadastro;

/**
 * Aplica RN-063: exclusao recusada quando ha vinculo, com mensagem dizendo <b>o que</b> impede.
 *
 * <p><b>Sem exclusao logica.</b> Nada de {@code ativo=false} como substituto de apagar — a decisao
 * foi bloquear, nao esconder.
 *
 * <p>Consulta <b>todas</b> as fontes antes de recusar, em vez de parar na primeira. Recusar tres
 * vezes seguidas, cada uma revelando um impedimento novo, e pior que recusar uma vez dizendo os
 * tres.
 */
public class GuardaDeExclusao {

	private final List<VinculoCadastroPort> portas;

	public GuardaDeExclusao(List<VinculoCadastroPort> portas) {
		this.portas = portas == null ? List.of() : List.copyOf(portas);
	}

	/**
	 * @param cadastro qual cadastro esta sendo excluido
	 * @param id       registro a excluir
	 * @param rotulo   como nomear o registro na mensagem — ex.: {@code "a regional"}
	 * @throws BusinessException {@code 409} quando existe ao menos um vinculo
	 */
	public void garantirSemVinculo(Cadastro cadastro, Long id, String rotulo) {
		List<String> impedimentos = new ArrayList<>();
		for (VinculoCadastroPort porta : portas) {
			if (porta.cadastro() == cadastro) {
				porta.descreverVinculo(id).ifPresent(impedimentos::add);
			}
		}

		if (!impedimentos.isEmpty()) {
			throw new BusinessException(
					"Nao e possivel excluir " + rotulo + ": " + juntar(impedimentos) + ".",
					HttpStatus.CONFLICT);
		}
	}

	/** Junta com virgulas e um "e" antes do ultimo, para a mensagem ler como frase. */
	private static String juntar(List<String> itens) {
		if (itens.size() == 1) {
			return itens.get(0);
		}
		String todosMenosUltimo = String.join(", ", itens.subList(0, itens.size() - 1));
		return todosMenosUltimo + " e " + itens.get(itens.size() - 1);
	}
}
