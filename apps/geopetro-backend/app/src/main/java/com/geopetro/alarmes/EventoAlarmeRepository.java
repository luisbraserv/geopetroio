package com.geopetro.alarmes;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.geopetro.alarmes.EventoAlarme.Tipo;

public interface EventoAlarmeRepository extends JpaRepository<EventoAlarmeEntity, Long> {

	/**
	 * O último fato de cada episódio que ainda não fechou — a matéria-prima da projeção.
	 *
	 * <p>Um episódio está aberto quando nenhum {@code FECHOU} foi gravado para ele. É isto que
	 * permite reconstruir o estado depois de um reinício: sem a reconstrução, o motor voltaria com a
	 * memória limpa e uma excursão em curso ganharia um segundo {@code ABRIU} — a mesma coisa
	 * contada duas vezes no histórico.
	 */
	@Query("""
			SELECT e FROM EventoAlarmeEntity e
			WHERE e.episodioId NOT IN (
			    SELECT f.episodioId FROM EventoAlarmeEntity f WHERE f.tipo = :fechou)
			  AND (e.id = (SELECT MIN(p.id) FROM EventoAlarmeEntity p WHERE p.episodioId = e.episodioId)
			    OR e.id = (SELECT MAX(u.id) FROM EventoAlarmeEntity u WHERE u.episodioId = e.episodioId))
			ORDER BY e.episodioId, e.id
			""")
	List<EventoAlarmeEntity> fatosDosEpisodiosAbertos(@Param("fechou") Tipo fechou);

	/**
	 * Primeiro e último fato de cada episódio aberto, nessa ordem.
	 *
	 * <p>São necessários os dois: o primeiro diz <b>quando a excursão começou</b>, que é o "desde" da
	 * tela e sobrevive à escalada; o último diz <b>em que severidade ela está</b>. Um episódio que
	 * nunca escalou devolve a mesma linha duas vezes, e agrupar resolve.
	 */
	default List<EventoAlarmeEntity> fatosDosEpisodiosAbertos() {
		return fatosDosEpisodiosAbertos(Tipo.FECHOU);
	}

	boolean existsByUnidadeId(Long unidadeId);

	/**
	 * Episódios com algum fato na janela, do mais recente para o mais antigo.
	 *
	 * <p>Ordena por {@code MAX(ocorridoEm)} — o fato mais recente do episódio — e não pela abertura:
	 * uma excursão que abriu ontem e escalou agora interessa mais que uma que abriu e fechou de manhã.
	 *
	 * <p>⚠️ Devolve <b>ids</b>, não fatos. Os fatos vêm depois, do episódio inteiro: filtrar os fatos
	 * pela janela faria um episódio que abriu antes dela aparecer começando por {@code ESCALOU}.
	 */
	@Query("""
			SELECT e.episodioId FROM EventoAlarmeEntity e
			WHERE e.unidadeId = :unidade
			  AND e.ocorridoEm >= :inicio AND e.ocorridoEm <= :fim
			GROUP BY e.episodioId
			ORDER BY MAX(e.ocorridoEm) DESC
			""")
	List<String> episodiosNaJanela(@Param("unidade") long unidade, @Param("inicio") Instant inicio,
			@Param("fim") Instant fim, Pageable pagina);

	List<EventoAlarmeEntity> findByEpisodioIdInOrderByIdAsc(Collection<String> episodioIds);
}
