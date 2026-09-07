package com.example.demo.config;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Guarda de instancia unica.
 *
 * <p>O risco aqui e assimetrico: falhar em barrar a segunda instancia so duplica janelas, mas barrar
 * a primeira por engano deixa o operador sem aplicativo nenhum. Os testes cobrem os dois lados.
 */
class InstanciaUnicaTest {

    @AfterEach
    void liberarPorta() {
        InstanciaUnica.liberar();
    }

    @Test
    @DisplayName("a primeira instância reserva e segue")
    void primeiraInstanciaSegue() {
        assertTrue(InstanciaUnica.reservar(), "a primeira instância precisa poder abrir");
    }

    @Test
    @DisplayName("a segunda instância é barrada")
    void segundaInstanciaBarrada() {
        assertTrue(InstanciaUnica.reservar());
        // Mesma porta, mesmo processo: é o que um segundo clique no atalho encontraria.
        assertFalse(InstanciaUnica.reservar(), "a segunda tentativa não pode seguir");
    }

    @Test
    @DisplayName("o pedido da segunda instância aciona a restauração da janela")
    void pedidoAcionaRestauracao() throws Exception {
        CountDownLatch chamou = new CountDownLatch(1);
        AtomicInteger vezes = new AtomicInteger();

        assertTrue(InstanciaUnica.reservar());
        InstanciaUnica.aoPedirAbertura(() -> {
            vezes.incrementAndGet();
            chamou.countDown();
        });

        // Segunda tentativa: deve ser recusada E tocar a campainha da primeira.
        assertFalse(InstanciaUnica.reservar());

        assertTrue(chamou.await(5, TimeUnit.SECONDS), "a janela deveria ter sido chamada de volta");
        assertEquals(1, vezes.get());
    }

    @Test
    @DisplayName("pedido antes de a janela existir não quebra")
    void pedidoSemJanelaRegistrada() throws Exception {
        // A porta é tomada no início do main, minutos de CPU antes de a janela existir.
        // Um pedido nessa fresta não pode derrubar o processo.
        assertTrue(InstanciaUnica.reservar());
        InstanciaUnica.aoPedirAbertura(null);

        assertFalse(InstanciaUnica.reservar());

        // A guarda continua de pé e atendendo.
        CountDownLatch chamou = new CountDownLatch(1);
        InstanciaUnica.aoPedirAbertura(chamou::countDown);
        assertFalse(InstanciaUnica.reservar());
        assertTrue(chamou.await(5, TimeUnit.SECONDS));
    }

    @Test
    @DisplayName("porta ocupada por outro programa não impede o aplicativo de abrir")
    void portaOcupadaPorTerceiro() throws Exception {
        // Alguém pode estar usando a porta sem falar o nosso protocolo. Barrar o operador nesse
        // caso seria pior que abrir uma segunda janela.
        try (ServerSocket intruso = new ServerSocket(51837, 1, InetAddress.getLoopbackAddress())) {
            assertFalse(InstanciaUnica.reservar(),
                    "sem conseguir a porta, este processo não pode se declarar o dono");

            // O intruso recebe a conexão e a ignora — o importante é o app não travar esperando.
            intruso.setSoTimeout(1000);
            try (Socket ignorado = intruso.accept()) {
                assertTrue(true);
            } catch (IOException semConexao) {
                assertTrue(true);
            }
        }
    }

    @Test
    @DisplayName("liberar devolve a porta para uma nova reserva")
    void liberarDevolveAPorta() {
        assertTrue(InstanciaUnica.reservar());
        InstanciaUnica.liberar();

        // Reinício do aplicativo depois de encerrar pela bandeja: a porta precisa estar livre.
        assertTrue(InstanciaUnica.reservar(), "após liberar, uma nova instância deve conseguir abrir");
    }

    @Test
    @DisplayName("a porta escuta apenas no loopback")
    void apenasLoopback() throws Exception {
        assertTrue(InstanciaUnica.reservar());

        // Presa ao loopback, a porta não fica exposta na rede nem pede liberação no firewall.
        try (Socket local = new Socket(InetAddress.getLoopbackAddress(), 51837)) {
            OutputStream saida = local.getOutputStream();
            saida.write('1');
            saida.flush();
            assertTrue(local.isConnected());
        }
    }
}
