package com.geopetro.prontidao;

import java.security.Principal;
import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Quais unidades da frota já foram configuradas — [OQ-049].
 *
 * <p>"A migração terminou" era, até aqui, uma afirmação <b>sem como conferir</b>. Esta rota é o que
 * permite olhar de fora e ver quem já virou, quem ficou para trás e quem está sem alarme.
 *
 * <p>⚠️ <b>Sem parâmetro de unidade, de propósito.</b> A pergunta é sobre a frota; pedir uma sonda
 * por vez devolveria o problema a quem pergunta — teria de saber de antemão quais existem, que é
 * exatamente o que falta saber.
 */
@RestController
public class ProntidaoController {

	private final ProntidaoService service;

	public ProntidaoController(ProntidaoService service) {
		this.service = service;
	}

	/**
	 * O escopo é o do monitoramento (RN-047), então não há verificação própria aqui: a lista já vem
	 * limitada às sondas que o usuário enxerga, e uma unidade fora do escopo não chega a existir na
	 * resposta.
	 */
	@GetMapping("/api/sondas/prontidao")
	public List<ProntidaoDaUnidade> daFrota(Principal principal) {
		return service.daFrota(principal == null ? null : principal.getName());
	}
}
