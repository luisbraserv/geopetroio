package com.geopetro.desktop.repositories;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import com.geopetro.desktop.models.LeituraLocal;

/** Consultas do H2 local — série por janela é a única forma que gráfico e carta de operação pedem. */
@Repository
public interface LeituraLocalRepository extends JpaRepository<LeituraLocal, Long> {

	/** Tudo o que foi lido na janela, em ordem — o gráfico separa por dispositivo em memória. */
	List<LeituraLocal> findByTimestampBetweenOrderByTimestampAsc(LocalDateTime inicio, LocalDateTime fim);

	/** Uma série específica. Usa o índice {@code (dispositivoId, timestamp)}. */
	List<LeituraLocal> findByDispositivoIdAndTimestampBetweenOrderByTimestampAsc(
			String dispositivoId, LocalDateTime inicio, LocalDateTime fim);

	/** Quais dispositivos aparecem na janela — o gráfico monta as séries a partir disto. */
	@Query("select distinct l.dispositivoId from LeituraLocal l "
			+ "where l.timestamp between :inicio and :fim order by l.dispositivoId")
	List<String> dispositivosNaJanela(@Param("inicio") LocalDateTime inicio, @Param("fim") LocalDateTime fim);

	/**
	 * Apaga o que é mais antigo que o limite — ver {@code PodaDeLeiturasLocais}.
	 *
	 * @return quantas linhas saíram
	 */
	@Modifying
	@Transactional
	@Query("delete from LeituraLocal l where l.timestamp < :limite")
	int apagarAnterioresA(@Param("limite") LocalDateTime limite);

	long countByTimestampLessThan(LocalDateTime limite);
}
