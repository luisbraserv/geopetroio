package com.geopetro.alarmes;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * As linhas de extremo, lidas por episódio.
 *
 * <p>Chave primária é o {@code episodioId}: gravar de novo o mesmo episódio <b>substitui</b> a
 * linha, que é a semântica desejada — o extremo é o valor corrente, não um histórico de picos.
 */
public interface ExtremoDoEpisodioRepository extends JpaRepository<ExtremoDoEpisodioEntity, String> {

	List<ExtremoDoEpisodioEntity> findByEpisodioIdIn(Collection<String> episodioIds);
}
