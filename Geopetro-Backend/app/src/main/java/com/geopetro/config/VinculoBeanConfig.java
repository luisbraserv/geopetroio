package com.geopetro.config;

import java.util.List;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.geopetro.core.port.VinculoCadastroPort;
import com.geopetro.core.vinculo.GuardaDeExclusao;

/**
 * Monta a guarda de exclusao com todas as fontes de vinculo registradas — RN-063.
 *
 * <p>O bean vive aqui, e nao no modulo {@code core}, porque {@code core} depende apenas de
 * {@code spring-web} e nao conhece anotacoes de contexto. Mesmo motivo pelo qual os casos de uso de
 * usuario sao montados em {@link UsuarioBeanConfig}.
 *
 * <p>Adicionar uma fonte nova de vinculo nao exige tocar neste arquivo: basta um {@code @Component}
 * que implemente {@link VinculoCadastroPort}.
 */
@Configuration
public class VinculoBeanConfig {

	@Bean
	GuardaDeExclusao guardaDeExclusao(List<VinculoCadastroPort> portas) {
		return new GuardaDeExclusao(portas);
	}
}
