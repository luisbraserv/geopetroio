package com.example.demo.services;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

import com.example.demo.models.CardsDaUnidade;
import com.example.demo.models.CardsDaUnidade.Card;
import com.example.demo.services.LeituraDeCards.Grandeza;

/** A configuração define a tela; a leitura apenas preenche os valores. */
public final class CardsDoMonitoramento {
    private CardsDoMonitoramento() {}

    public static List<Grandeza> montar(CardsDaUnidade documento, List<Grandeza> leituras,
                                       boolean conectado) {
        if (documento == null) return List.of();
        List<Grandeza> resultado = new ArrayList<>();
        for (Card card : LeituraDeCards.ativos(documento.cards()).stream()
                .sorted(Comparator.comparingInt(Card::ordem)).toList()) {
            if (card.tipo() == CardsDaUnidade.Tipo.CONTADOR_STROKE) {
                adicionar(resultado, card, LeituraDeCards.SERIE_STROKE, "stroke", leituras, conectado);
                adicionar(resultado, card, LeituraDeCards.SERIE_VAZAO, "bbl/min", leituras, conectado);
                adicionar(resultado, card, LeituraDeCards.SERIE_VOLUME, "bbl", leituras, conectado);
            } else {
                String unidade = switch (card.tipo()) {
                    case PESO -> "lbf";
                    case TORQUE -> "lbf.ft";
                    case PRESSAO -> "psi";
                    case TEMPERATURA -> ConversaoTemperatura.unidade(card.parametros());
                    case NIVEL_TANQUE -> "bbl";
                    default -> throw new IllegalStateException("Tipo sem unidade");
                };
                adicionar(resultado, card, "", unidade, leituras, conectado);
            }
        }
        return List.copyOf(resultado);
    }

    private static void adicionar(List<Grandeza> resultado, Card card, String serie, String unidade,
                                  List<Grandeza> leituras, boolean conectado) {
        Grandeza leitura = !conectado || leituras == null ? null : leituras.stream()
                .filter(g -> Objects.equals(g.dispositivoId(), card.dispositivoId())
                        && Objects.equals(g.serie() == null ? "" : g.serie(), serie)
                        && g.tipo() == card.tipo())
                .findFirst().orElse(null);
        resultado.add(new Grandeza(card.dispositivoId(), card.nome(), card.tipo(), serie,
                card.tipo().enderecoLegivel(card.byteInicial()), card.visivel(),
                leitura == null ? null : leitura.valor(), unidade,
                leitura == null ? Double.NaN : leitura.bruto(),
                leitura == null ? (conectado ? "Aguardando a primeira leitura" : "CLP desconectado")
                        : leitura.semValorPorque()));
    }
}
