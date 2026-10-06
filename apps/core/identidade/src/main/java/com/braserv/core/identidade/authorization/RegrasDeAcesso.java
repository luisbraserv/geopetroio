package com.braserv.core.identidade.authorization;

import com.braserv.core.usuario.domain.model.Role;

/**
 * Quem alcanca cada area do Braserv-Core — <b>declaracao unica</b>, consumida pelo
 * {@code SecurityConfig}.
 *
 * <p>O acesso e <b>tipo de conta + permissao de modulo</b> (RN-099, ver {@link Role}). As regras de
 * monitoramento e simulador ficam no Geopetro-Backend, que e quem serve aquelas rotas; aqui ficam
 * so as dos cadastros e configuracoes que o core serve.
 *
 * <p>⚠️ <b>Espelhe no Front.</b> As mesmas combinacoes vivem em
 * {@code apps/geopetro-frontend/src/app/features/auth/models/user.model.ts}, onde servem para esconder menu
 * e barrar rota. Divergir nao abre brecha — quem decide e o servidor —, mas produz o pior sintoma
 * possivel para o usuario: um item de menu que leva a "acesso negado".
 */
public final class RegrasDeAcesso {

	/**
	 * Gestao de unidades — RN-118: criar, editar, inativar, reativar e excluir.
	 *
	 * <p>Consultar o cadastro continua aberto a qualquer {@code INTERNO}; so a escrita exige a
	 * permissao. {@code UNIDADE} sozinha nao concede nada, como as demais permissoes de modulo.
	 */
	public static final RegraDeAcesso GESTAO_UNIDADES = RegraDeAcesso.exigindo(Role.ADMIN)
			.ou(Role.INTERNO, Role.UNIDADE);

	/** Cadastros administrativos — usuarios, empresas, escrita de regionais. */
	public static final RegraDeAcesso ADMINISTRACAO = RegraDeAcesso.exigindo(Role.ADMIN);

	/**
	 * Configuracoes do sistema — RN-086.
	 *
	 * <p>Separada de {@link #ADMINISTRACAO} de proposito: {@code SUPORTE} <b>configura</b> o sistema,
	 * mas nao administra cadastro. Juntar as duas faria o suporte virar um segundo {@code ADMIN} por
	 * descuido.
	 */
	public static final RegraDeAcesso CONFIGURACAO = RegraDeAcesso.exigindo(Role.ADMIN)
			.ou(Role.SUPORTE);

	private RegrasDeAcesso() {
	}
}
