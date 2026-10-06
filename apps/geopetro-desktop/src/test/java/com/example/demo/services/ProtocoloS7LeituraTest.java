package com.example.demo.services;

import static org.junit.jupiter.api.Assertions.*;

import java.io.DataInputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.HexFormat;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import com.sourceforge.snap7.moka7.S7;
import com.sourceforge.snap7.moka7.S7Client;

/** Exercita o driver real por TCP; o par simula apenas as respostas ISO/S7 de um PLC. */
class ProtocoloS7LeituraTest {
    @Test void driverRecebeSeisBytesDoDb1EDecodificaContadorEAnalogico() throws Exception {
        try (var servidor = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))) {
            servidor.setSoTimeout(5000);
            var concluido = new CompletableFuture<Void>();
            Thread.ofVirtual().start(() -> {
                try (Socket socket = servidor.accept()) {
                    socket.setSoTimeout(5000);
                    byte[] conexao = receber(socket);
                    assertEquals(0xe0, Byte.toUnsignedInt(conexao[5]));
                    responder(socket, "0300001611d00001000100c0010ac1020300c2020200");
                    receber(socket); // negociação do tamanho de PDU
                    responder(socket, "0300001b02f080320300000001000800000000f0000001000101e0");
                    byte[] leitura = receber(socket);
                    assertEquals(4, leitura[17], "Read Var, nunca Write Var");
                    assertEquals(6, leitura[24], "quatro bytes do contador e dois do peso");
                    assertEquals(1, leitura[26], "DB1");
                    assertEquals(S7.S7AreaDB, Byte.toUnsignedInt(leitura[27]));
                    assertEquals(0, leitura[28] | leitura[29] | leitura[30], "byte inicial zero");
                    responder(socket, "0300001f02f0803203000000020002000a00000401ff0400300000007b015e");
                    concluido.complete(null);
                } catch (Throwable erro) {
                    concluido.completeExceptionally(erro);
                }
            });
            var client = new S7Client();
            try {
                client.SetConnectionParams("127.0.0.1", servidor.getLocalPort(), 0x0300, 0x0200);
                assertEquals(0, client.Connect());
                byte[] bytes = new byte[6];
                assertEquals(0, client.ReadArea(S7.S7AreaDB, 1, 0, 6, bytes));
                var bloco = BlocoDeLeitura.de(bytes, 0);
                assertEquals(123, bloco.dword(0));
                assertEquals(350, bloco.word(4));
                concluido.get(5, TimeUnit.SECONDS);
            } finally {
                client.Disconnect();
            }
        }
    }

    private static byte[] receber(Socket socket) throws Exception {
        var entrada = new DataInputStream(socket.getInputStream());
        byte[] header = entrada.readNBytes(4);
        if (header.length != 4) throw new IllegalStateException("TPKT incompleto");
        int tamanho = (Byte.toUnsignedInt(header[2]) << 8) | Byte.toUnsignedInt(header[3]);
        byte[] pacote = new byte[tamanho];
        System.arraycopy(header, 0, pacote, 0, 4);
        entrada.readFully(pacote, 4, tamanho - 4);
        return pacote;
    }

    private static void responder(Socket socket, String hex) throws Exception {
        socket.getOutputStream().write(HexFormat.of().parseHex(hex));
        socket.getOutputStream().flush();
    }
}
