package com.geopetro.cards;

import jakarta.persistence.*;
import java.time.Instant;

/** Um documento de cards por unidade, com lock otimista — a revisao vem do @Version. */
@Entity
@Table(name = "configuracao_cards")
public class ConfiguracaoCardsEntity {
    @Id @Column(name = "unidade_id") Long unidadeId;
    @Version Long version;
    @Column(name = "conexao_json", nullable = false, columnDefinition = "LONGTEXT") String conexaoJson;
    @Column(name = "cards_json", nullable = false, columnDefinition = "LONGTEXT") String cardsJson;
    @Column(name = "atualizado_por", nullable = false) String atualizadoPor;
    @Column(name = "atualizado_em", nullable = false) Instant atualizadoEm;
    public ConfiguracaoCardsEntity() {}
}
