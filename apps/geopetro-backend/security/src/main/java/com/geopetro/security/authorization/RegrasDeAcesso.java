package com.geopetro.security.authorization;


/**
 * Quem alcanca cada modulo — <b>declaracao unica</b>, consumida pelo HTTP ({@code SecurityConfig}),
 * pelo canal WebSocket e pelos servicos que precisam da mesma resposta.
 *
 * <p><b>[DECIDIDO 2026-09-17]</b> O acesso deixou de ser "uma role da lista" e passou a ser
 * <b>tipo de conta + permissao de modulo</b> (ver {@link Role}). O que isso resolve: antes,
 * conceder monitoramento a um cliente exigia uma role que tambem valia para funcionario, e cada nova
 * area do produto acrescentava mais uma role a varias listas. Agora {@code CLIENTE} e
 * {@code INTERNO} dizem <i>de quem</i> e a conta, e {@code MONITORAMENTO}, {@code MONITORAMENTO_REAL},
 * {@code SIMULADOR} e {@code CIMENTACAO} dizem <i>o que</i> ela alcanca.
 *
 * <p>⚠️ <b>Espelhe no Front.</b> As mesmas combinacoes vivem em
 * {@code apps/geopetro-frontend/src/app/features/auth/models/user.model.ts}, onde servem para esconder menu
 * e barrar rota. Divergir nao abre brecha — quem decide e o servidor —, mas produz o pior sintoma
 * possivel para o usuario: um item de menu que leva a "acesso negado".
 */
public final class RegrasDeAcesso {

	/**
	 * Monitoramento da Unidade: a tela de series ({@code /api/monitoramento/unidades/*}{@code /series}).
	 *
	 * <p>{@code ADMIN} sozinho entra; os demais precisam da permissao de modulo somada ao tipo de
	 * conta. O <b>escopo</b> do que cada um ve continua em {@code UnidadeMonitoramentoService}: a frota
	 * inteira para conta interna, so as unidades concedidas para cliente (RN-047).
	 */
	public static final RegraDeAcesso MONITORAMENTO = RegraDeAcesso.exigindo(Role.ADMIN)
			.ou(Role.CLIENTE, Role.MONITORAMENTO)
			.ou(Role.INTERNO, Role.MONITORAMENTO);

	/**
	 * Tempo real, limites de alarme e historico de alarmes.
	 *
	 * <p>⚠️ <b>Nao exige {@code MONITORAMENTO}</b>, de proposito: sao concessoes independentes, e
	 * quem recebe so o ao vivo entra aqui sem passar pela tela de series. Somar as duas tornaria
	 * impossivel conceder apenas o tempo real.
	 *
	 * <p>Os tres andam juntos por RN-069: ver o historico e ajustar o limite sao a mesma autoridade
	 * que acompanhar o ao vivo.
	 */
	public static final RegraDeAcesso MONITORAMENTO_REAL = RegraDeAcesso.exigindo(Role.ADMIN)
			.ou(Role.CLIENTE, Role.MONITORAMENTO_REAL)
			.ou(Role.INTERNO, Role.MONITORAMENTO_REAL);

	/**
	 * Recursos comuns a <b>toda</b> a area de monitoramento: a lista de unidades do usuario
	 * ({@code /api/monitoramento/unidades/minhas}) e o documento de cards.
	 *
	 * <p>Qualquer uma das duas permissoes de monitoramento basta, e e por isso que existe. As quatro
	 * telas da area — series, tempo real, limites e historico — comecam escolhendo uma unidade e
	 * lendo os cards dela. Exigir {@code MONITORAMENTO} aqui deixaria quem recebeu apenas o tempo
	 * real com a tela liberada e a lista de unidades em 403: acesso concedido que nao funciona, com o
	 * sintoma longe da causa.
	 */
	public static final RegraDeAcesso AREA_MONITORAMENTO = MONITORAMENTO
			.ou(Role.CLIENTE, Role.MONITORAMENTO_REAL)
			.ou(Role.INTERNO, Role.MONITORAMENTO_REAL);

	/**
	 * Cards da unidade — RN-086. Leitura de quem esta na area, <b>mais</b> {@code SUPORTE}.
	 *
	 * <p>{@code SUPORTE} nao monitora (nao esta em {@link #AREA_MONITORAMENTO}), mas configura o que a
	 * borda le. Aqui se garante apenas que ele chega ao recurso; quem le e quem grava e decidido em
	 * {@code ConfiguracaoCardsAccess}.
	 */
	public static final RegraDeAcesso CARDS_DA_UNIDADE = AREA_MONITORAMENTO.ou(Role.SUPORTE);

	/**
	 * Simulador de Cimentacao: {@code /api/simulador/**}.
	 *
	 * <p>{@code SIMULADOR} abre a area; {@code CIMENTACAO} diz qual simulador. A separacao existe
	 * porque outros simuladores estao previstos — o proximo nasce exigindo {@code SIMULADOR} mais o
	 * seu proprio dominio, sem tocar nesta regra.
	 */
	public static final RegraDeAcesso SIMULADOR_CIMENTACAO = RegraDeAcesso.exigindo(Role.ADMIN)
			.ou(Role.CLIENTE, Role.SIMULADOR, Role.CIMENTACAO)
			.ou(Role.INTERNO, Role.SIMULADOR, Role.CIMENTACAO);

	/**
	 * Escopo: quem enxerga a <b>frota inteira</b>, sem recorte por vinculo — RN-047.
	 *
	 * <p>Nao e uma regra de porta como as demais; e a pergunta seguinte, feita a quem ja entrou:
	 * <i>quanto</i> ele ve. Vive aqui para que "conta interna com permissao de monitoramento" seja
	 * escrito uma vez so.
	 *
	 * <p>⚠️ Exige a permissao de modulo, e nao apenas {@code INTERNO}. Poderia bastar o tipo de
	 * conta — a porta ja barrou quem nao tem o modulo —, mas entao um endpoint novo que reusasse o
	 * servico sem declarar regra entregaria a frota a qualquer funcionario. O custo de repetir a
	 * permissao aqui e uma linha; o custo do descuido e a frota inteira.
	 */
	public static final RegraDeAcesso ESCOPO_FROTA_INTEIRA = RegraDeAcesso.exigindo(Role.ADMIN)
			.ou(Role.INTERNO, Role.MONITORAMENTO)
			.ou(Role.INTERNO, Role.MONITORAMENTO_REAL);

	private RegrasDeAcesso() {
	}
}
