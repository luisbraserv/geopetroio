package com.braserv.core.identidade.servico;

import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Na primeira subida, cria o cliente {@value #ID} com o segredo de
 * {@code CORE_SEGREDO_INICIAL_BACKEND} — spec, secao 6.5.
 *
 * <p>Resolve o ovo e a galinha: o backend precisa de credencial para perguntar ao core quem pode
 * entrar, antes de qualquer ADMIN conseguir abrir a tela de sistemas. Depois que o cliente existe,
 * a variavel e ignorada e pode sair do {@code .env}; o segredo passa a ser gerido pela tela.
 */
@Component
public class ClienteInicialDoBackend implements ApplicationRunner {

	public static final String ID = "geopetro-backend";
	private static final int TAMANHO_MINIMO = 32;
	private static final Logger log = LoggerFactory.getLogger(ClienteInicialDoBackend.class);

	private final ServicoClienteService service;
	private final String segredo;

	public ClienteInicialDoBackend(ServicoClienteService service,
			@Value("${core.servicos.segredo-inicial-backend:}") String segredo) {
		this.service = service;
		this.segredo = segredo;
	}

	@Override
	public void run(ApplicationArguments args) {
		if (segredo == null || segredo.isBlank()) {
			return;
		}
		if (segredo.length() < TAMANHO_MINIMO) {
			log.error("CORE_SEGREDO_INICIAL_BACKEND tem menos de {} caracteres e foi ignorado.", TAMANHO_MINIMO);
			return;
		}
		boolean criou = service.garantir(ID, "Geopetro-Backend", Set.of(Escopo.ACESSO_LER, Escopo.UNIDADES_LER), segredo);
		if (criou) {
			log.info("Cliente de servico {} criado a partir de CORE_SEGREDO_INICIAL_BACKEND.", ID);
		}
	}
}
