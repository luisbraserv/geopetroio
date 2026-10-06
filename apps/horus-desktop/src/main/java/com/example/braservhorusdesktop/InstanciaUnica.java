package com.example.braservhorusdesktop;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Garante uma unica instancia do aplicativo e traz a existente para a frente.
 *
 * <h2>Por que existe</h2>
 * O aplicativo continua rodando na bandeja quando a janela e fechada. Sem esta guarda, clicar no
 * atalho de novo sobe um segundo processo: duas janelas, duas conexoes com o CLP, duas gravacoes no
 * mesmo banco H2 — que e de arquivo unico e trava para o segundo processo.
 *
 * <h2>Como funciona</h2>
 * Um {@link ServerSocket} preso ao loopback serve de fechadura e de campainha ao mesmo tempo:
 *
 * <ul>
 *   <li>Se o bind funciona, este processo e o primeiro. Fica escutando; cada conexao recebida
 *       significa "alguem tentou me abrir de novo" e dispara a restauracao da janela.</li>
 *   <li>Se o bind falha porque a porta esta ocupada, ja existe instancia. Este processo conecta,
 *       toca a campainha e encerra.</li>
 * </ul>
 *
 * <p>Preso a {@code 127.0.0.1} de proposito: a porta nao fica exposta na rede e nao dispara pedido
 * de liberacao no firewall.
 *
 * <p>Preferido a um arquivo de lock porque um lock deixado para tras por um encerramento abrupto
 * bloquearia o aplicativo ate alguem apagar o arquivo na mao. Porta liberada pelo sistema operacional
 * quando o processo morre, aconteca o que acontecer.
 */
public final class InstanciaUnica {

    private static final Logger logger = LoggerFactory.getLogger(InstanciaUnica.class);

    /** Porta alta e fixa, exclusiva deste aplicativo. */
    private static final int PORTA = 51838;

    private static ServerSocket fechadura;

    /**
     * O que fazer quando outra abertura e pedida.
     *
     * <p>Registrado depois da reserva: a porta precisa ser tomada no inicio do {@code main}, para o
     * processo duplicado encerrar antes de subir Spring e JavaFX, mas a janela so existe minutos de
     * CPU depois. Ate la, pedidos sao apenas registrados no log.
     */
    private static volatile Runnable aoReceberPedido;

    private InstanciaUnica() {
    }

    /**
     * Tenta reservar a instancia para este processo.
     *
     * @return {@code true} se este processo e o unico e pode seguir; {@code false} se ja havia
     *         instancia — nesse caso o chamador deve encerrar imediatamente.
     */
    public static boolean reservar() {
        try {
            fechadura = new ServerSocket(PORTA, 1, InetAddress.getLoopbackAddress());
        } catch (IOException portaOcupada) {
            avisarInstanciaExistente();
            return false;
        }

        Thread porteiro = new Thread(InstanciaUnica::escutar, "instancia-unica");
        porteiro.setDaemon(true);
        porteiro.start();

        // Libera a porta mesmo em encerramento pela bandeja ou pelo gerenciador de tarefas.
        Runtime.getRuntime().addShutdownHook(new Thread(InstanciaUnica::liberar));
        return true;
    }

    /** Liga a guarda a janela, assim que ela existe. */
    public static void aoPedirAbertura(Runnable acao) {
        aoReceberPedido = acao;
    }

    private static void escutar() {
        while (!fechadura.isClosed()) {
            try (Socket ignorado = fechadura.accept()) {
                logger.info("Outra tentativa de abertura detectada — restaurando a janela.");
                Runnable acao = aoReceberPedido;
                if (acao != null) {
                    acao.run();
                }
            } catch (IOException e) {
                if (!fechadura.isClosed()) {
                    logger.warn("Falha ao atender pedido de abertura: {}", e.getMessage());
                }
                return;
            }
        }
    }

    /** Toca a campainha da instancia que ja esta rodando. */
    private static void avisarInstanciaExistente() {
        try (Socket socket = new Socket(InetAddress.getLoopbackAddress(), PORTA)) {
            OutputStream saida = socket.getOutputStream();
            saida.write('1');
            saida.flush();
            logger.info("Aplicativo ja esta aberto — a janela existente foi trazida para a frente.");
        } catch (IOException e) {
            // A porta pode estar ocupada por outro programa qualquer. Avisar e seguir: melhor abrir
            // uma segunda janela do que impedir o operador de usar o aplicativo.
            logger.warn("Porta {} ocupada, mas sem instancia respondendo: {}", PORTA, e.getMessage());
        }
    }

    public static void liberar() {
        if (fechadura != null && !fechadura.isClosed()) {
            try {
                fechadura.close();
            } catch (IOException e) {
                logger.debug("Erro ao liberar a porta da instancia: {}", e.getMessage());
            }
        }
    }
}
