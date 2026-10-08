package com.geopetro.desktop.models;

/**
 * Uma Unidade do cadastro do Geopetro-Backend, como oferecida na tela de Configuracoes.
 *
 * <p><b>Por que os dois identificadores andam juntos:</b> a mesma sonda e enderecada de duas formas
	 * no sistema. O historico (MQTT -> InfluxDB) usa o {@code idUnidade}, um texto como
 * {@code UC-01}; o tempo real (WebSocket) usa o {@code id} numerico do cadastro. Pedir os dois ao
 * usuario convidava a erro de digitacao: bastava um deles nao bater com o cadastro para um dos dois
 * canais silenciosamente parar de funcionar, sem erro visivel.
 *
 * <p>Trazendo o par direto do backend, o usuario escolhe a sonda uma vez e os dois enderecos ficam
 * coerentes por construcao.
 */
public record UnidadeSondaOpcao(Long id, String nome, String apelido, String tipo) {

    /** Texto exibido na lista: nome e apelido quando houver, com o codigo do historico ao final. */
    public String rotulo() {
        StringBuilder sb = new StringBuilder();
        sb.append(nome == null || nome.isBlank() ? "(sem nome)" : nome);
        if (apelido != null && !apelido.isBlank()) {
            sb.append(" - ").append(apelido);
        }
        return sb.toString();
    }

    @Override
    public String toString() {
        return rotulo();
    }
}
