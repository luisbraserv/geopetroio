package com.braserv.core.usuario.domain.model;

/**
 * Papeis do sistema.
 *
 * <h2>Duas familias, e a diferenca importa</h2>
 * <ul>
 *   <li><b>Tipo de conta</b> — {@link #CLIENTE} ou {@link #INTERNO}. Aplicada automaticamente na
 *       criacao do usuario, conforme a subclasse. Diz <i>de quem</i> e a conta, nao o que ela
 *       alcanca.</li>
 *   <li><b>Permissao de modulo</b> — {@link #MONITORAMENTO}, {@link #MONITORAMENTO_REAL},
 *       {@link #SIMULADOR}, {@link #CIMENTACAO}, {@link #UNIDADE}. Sozinhas nao abrem nada: valem <b>somadas</b> a um
 *       tipo de conta.</li>
 * </ul>
 *
 * <p>{@link #ADMIN} atravessa tudo, e {@link #SUPORTE} e o caso a parte descrito abaixo.
 *
 * <p>As combinacoes que de fato liberam cada modulo estao declaradas em um unico lugar —
 * {@code com.braserv.core.identidade.authorization.RegrasDeAcesso}. Acrescentar um valor aqui nao concede
 * nada por si.
 *
 * <h2>⚠️ Removidas em 2026-09-17: SONDA, GERENCIA, DIRETORIA</h2>
 * As tres existiam apenas dentro de listas de permissao, sem nenhuma regra propria — quem tinha
 * {@code GERENCIA} podia exatamente o que {@code SONDA} podia. O acesso passou a ser expresso por
 * combinacao (tipo de conta + permissao de modulo), que era o que aquelas listas tentavam imitar.
 * A migration {@code V2026.09.17.1__roles_por_modulo.sql} converte as linhas existentes em
 * {@code MONITORAMENTO}.
 */
public enum Role {

	/** Conta de cliente: o escopo de sondas dela e o concedido no cadastro (RN-048). */
	CLIENTE,

	/** Conta de funcionario. Enxerga a frota inteira nos modulos que sua permissao abrir (RN-047). */
	INTERNO,

	/** Atravessa toda regra de acesso, sem precisar de permissao de modulo. */
	ADMIN,

	/** Monitoramento da Unidade: lista de sondas e series historicas. */
	MONITORAMENTO,

	/**
	 * Tempo real da Unidade: leituras ao vivo, limites de alarme e historico de alarmes.
	 *
	 * <p><b>Nao depende de {@link #MONITORAMENTO}</b>: sao duas concessoes independentes, e ha quem
	 * receba o ao vivo sem a tela de series.
	 */
	MONITORAMENTO_REAL,

	/** Habilita a area de simuladores. Qual simulador ainda depende da permissao do dominio. */
	SIMULADOR,

	/** Dominio de cimentacao. Com {@link #SIMULADOR}, abre o Simulador de Cimentacao. */
	CIMENTACAO,

	/**
	 * Gestao de unidades — RN-118. Com {@link #INTERNO}, cria, edita, inativa, reativa e exclui
	 * unidades. Sem ela, o interno so consulta o cadastro.
	 */
	UNIDADE,

	/**
	 * Suporte — RN-086. Configura o sistema sem administrar cadastro: alcanca as configuracoes
	 * ({@code /api/configuracoes/**}) e a gravacao dos cards da unidade.
	 *
	 * <p><b>Nao</b> enxerga usuarios, empresas nem os demais cadastros — isso segue exclusivo de
	 * {@link #ADMIN}. Tambem nao acompanha operacao: le os cards de uma unidade, mas nao entra no
	 * monitoramento dela.
	 */
	SUPORTE,
}
