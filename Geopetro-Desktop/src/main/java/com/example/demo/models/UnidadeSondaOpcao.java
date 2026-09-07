package com.example.demo.models;

/**
 * Uma Unidade/Sonda do cadastro do Backend-Sonda, como oferecida na tela de Configuracoes.
 *
 * <p><b>Por que os dois identificadores andam juntos:</b> a mesma sonda e enderecada de duas formas
 * no sistema. O historico (MQTT -> InfluxDB) usa o {@code idSondaUnidade}, um texto como
 * {@code UC-01}; o tempo real (WebSocket) usa o {@code id} numerico do cadastro. Pedir os dois ao
 * usuario convidava a erro de digitacao: bastava um deles nao bater com o cadastro para um dos dois
 * canais silenciosamente parar de funcionar, sem erro visivel.
 *
 * <p>Trazendo o par direto do backend, o usuario escolhe a sonda uma vez e os dois enderecos ficam
 * coerentes por construcao.
 */
public record UnidadeSondaOpcao(Long id, String idSondaUnidade, String nome, String apelido) {

    /** Texto exibido na lista: nome e apelido quando houver, com o codigo do historico ao final. */
    public String rotulo() {
        StringBuilder sb = new StringBuilder();
        sb.append(nome == null || nome.isBlank() ? "(sem nome)" : nome);
        if (apelido != null && !apelido.isBlank()) {
            sb.append(" - ").append(apelido);
        }
        if (idSondaUnidade != null && !idSondaUnidade.isBlank()) {
            sb.append("  [").append(idSondaUnidade).append("]");
        }
        return sb.toString();
    }

    @Override
    public String toString() {
        return rotulo();
    }
}
