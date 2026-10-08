package com.geopetro.desktop.services;

import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class SondaService {

    /**
     * As grandezas do último ciclo, já convertidas — a fonte da tela desde o passo 7.
     *
     * <p>Substitui os campos fixos: a tela monta os cards a partir <b>desta lista</b>, então uma
     * unidade com dois tanques e três torques aparece inteira, sem coluna reservada para nada.
     *
     * <p>Lista imutável trocada por referência: a thread de leitura do CLP escreve, a da interface
     * lê, e nenhuma das duas vê um estado pela metade.
     */
    private record Ciclo(com.geopetro.desktop.cards.CardsDaUnidade documento,
                         List<LeituraDeCards.Grandeza> grandezas) {}
    private volatile Ciclo ciclo = new Ciclo(null, List.of());

    public void atualizarGrandezas(com.geopetro.desktop.cards.CardsDaUnidade documento,
                                  List<LeituraDeCards.Grandeza> novas) {
        ciclo = new Ciclo(documento, novas == null ? List.of() : List.copyOf(novas));
    }

    public List<LeituraDeCards.Grandeza> grandezas(com.geopetro.desktop.cards.CardsDaUnidade documento) {
        Ciclo atual = ciclo;
        return documento != null && documento.equals(atual.documento()) ? atual.grandezas() : List.of();
    }

    public void limparGrandezas() { ciclo = new Ciclo(null, List.of()); }

    // ------------------------------------------------------------------
    // Valores brutos do CLP (diagnostico)
    // ------------------------------------------------------------------

    /**
     * Ultimo valor lido de cada endereco do DB1, sem conversao.
     *
     * <p>Estado transiente, de proposito: serve so a tela e nao deve entrar no historico gravado
     * nem na telemetria.
     *
     * <p>Existe porque a conversao para PSI limita a faixa 4-20 mA — canal em zero e pressao zero
     * de verdade chegam ambos como 0 PSI. O bruto e o que separa os dois casos.
     */
    private final java.util.Map<Integer, Long> valoresBrutos = new java.util.concurrent.ConcurrentHashMap<>();

    /** Escrito pela thread de leitura do CLP, lido pela thread da UI. */
    public void registrarValorBruto(int endereco, long valor) {
        valoresBrutos.put(endereco, valor);
    }

    /** {@code null} enquanto aquele endereco nunca foi lido — a tela mostra "--". */
    public Long getValorBruto(int endereco) {
        return valoresBrutos.get(endereco);
    }

    public void limparValoresBrutos() {
        valoresBrutos.clear();
    }
}
