package com.geopetro.alarmes;

import java.security.Principal;
import java.time.Instant;
import java.util.List;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.geopetro.configuracaosonda.ConfiguracaoSondaAccess;

/**
 * O que está alarmando agora numa Unidade/Sonda.
 *
 * <h2>Por que existe, se o alarme já viaja no tempo real</h2>
 * A projeção acompanha cada ciclo de leituras, então quem está com a tela conectada já a recebe. O
 * que falta é o <b>primeiro instante</b>: ao abrir a tela, antes da primeira mensagem, e quando a
 * sonda <b>não está publicando</b>. Um episódio aberto de uma sonda que caiu continua sendo verdade,
 * e sem esta rota ele ficaria invisível justamente quando ninguém está olhando o CLP.
 *
 * <h2>Quem vê</h2>
 * A mesma regra dos limites — quem enxerga a sonda, inclusive {@code CLIENTE}
 * ([RN-069](../../../../../../specs/business-rules.md)). Reaproveita {@link ConfiguracaoSondaAccess}
 * de propósito: ver o alarme e ajustar o limite dele são a mesma autoridade, e duas verificações
 * separadas divergiriam na primeira mudança.
 */
@RestController
public class AlarmesController {

	private final MotorDeAlarmes motor;
	private final HistoricoDeAlarmes historico;
	private final ConfiguracaoSondaAccess access;

	public AlarmesController(MotorDeAlarmes motor, HistoricoDeAlarmes historico,
			ConfiguracaoSondaAccess access) {
		this.motor = motor;
		this.historico = historico;
		this.access = access;
	}

	/**
	 * Episódios abertos, do mais grave para o mais antigo.
	 *
	 * <p>Lista vazia é a resposta normal: sonda dentro dos limites, ou sem limite nenhum
	 * configurado. Não é erro nem pendência.
	 *
	 * <p>⚠️ <b>É projeção, não histórico.</b> Responde "o que está alarmando?", que é outra pergunta
	 * de "o que aconteceu?" — esta se responde pelo log de eventos, que ainda não tem rota.
	 */
	@GetMapping("/api/sondas/{id}/alarmes")
	public List<AlarmeAtivo> ativos(@PathVariable long id, Principal principal) {
		access.exigir(principal == null ? null : principal.getName(), id);
		return motor.ativos(id);
	}

	/**
	 * O histórico — <b>"o que aconteceu?"</b>, em excursões e não em linhas de log.
	 *
	 * <p>Um episódio que abriu em atenção, escalou e fechou são três fatos e <b>uma</b> excursão. A
	 * resposta agrupa: devolver os fatos soltos obrigaria cada tela a reconstruir o agrupamento, e a
	 * primeira que errasse contaria a mesma excursão como três alarmes.
	 *
	 * <p>⚠️ A janela é obrigatória e o resultado tem teto declarado — ver {@link HistoricoDeAlarmes}.
	 * O log cresce sem política de retenção, e uma consulta sem limite funcionaria por meses antes de
	 * derrubar a tela de uma sonda movimentada.
	 */
	@GetMapping("/api/sondas/{id}/alarmes/historico")
	public HistoricoDeAlarmes.Pagina historico(@PathVariable long id,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant inicio,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant fim,
			Principal principal) {
		access.exigir(principal == null ? null : principal.getName(), id);
		return historico.consultar(id, inicio, fim);
	}
}
