package com.example.braservhorusdesktop.service;

import java.io.File;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.example.braservhorusdesktop.model.UnidadePressao;
import com.example.braservhorusdesktop.service.PdfService.PdfGeracaoException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Cobre o contrato de que a tela depende: o progresso avanca ate o fim e as falhas chegam a quem
 * chamou.
 */
class PdfServiceTest {

    @TempDir
    Path tempDir;

    private record Evento(String etapa, int concluidas, int total) { }

    private List<Evento> gerarCapturandoProgresso(String caminhoSaida, UnidadePressao unidade) {
        List<Evento> eventos = new ArrayList<>();
        LocalDateTime inicio = LocalDateTime.now().minusHours(1);
        LocalDateTime fim = LocalDateTime.now();

        new PdfService().gerarPdfComGraficos(
                "POÇO-TESTE", inicio, fim, "00:00:00", "23:59:59", caminhoSaida, unidade,
                (etapa, concluidas, total) -> eventos.add(new Evento(etapa, concluidas, total)));

        return eventos;
    }

    @Test
    @DisplayName("reporta progresso do início ao fim")
    void reportaProgresso() {
        File destino = tempDir.resolve("relatorio.pdf").toFile();

        List<Evento> eventos = gerarCapturandoProgresso(destino.getAbsolutePath(), UnidadePressao.PSI);

        assertFalse(eventos.isEmpty(), "a tela precisa de pelo menos um evento para mover a barra");

        Evento ultimo = eventos.get(eventos.size() - 1);
        assertEquals(ultimo.total(), ultimo.concluidas(),
                "a barra precisa chegar a 100%; parar antes deixaria a tela com aparência de travada");

        // O progresso nunca pode retroceder — uma barra que anda para tras parece defeito.
        int anterior = -1;
        for (Evento evento : eventos) {
            assertTrue(evento.concluidas() >= anterior,
                    "progresso retrocedeu em: " + evento.etapa());
            assertTrue(evento.total() > 0, "total zerado dividiria por zero na barra");
            anterior = evento.concluidas();
        }
    }

    @Test
    @DisplayName("grava o arquivo no destino informado")
    void gravaArquivo() {
        File destino = tempDir.resolve("saida.pdf").toFile();

        gerarCapturandoProgresso(destino.getAbsolutePath(), UnidadePressao.PSI);

        assertTrue(destino.exists(), "o PDF deveria existir após a geração");
        assertTrue(destino.length() > 0, "o PDF não pode sair vazio");
    }

    @Test
    @DisplayName("gera nas duas unidades de pressão")
    void geraNasDuasUnidades() {
        File emPsi = tempDir.resolve("psi.pdf").toFile();
        File emKgf = tempDir.resolve("kgf.pdf").toFile();

        gerarCapturandoProgresso(emPsi.getAbsolutePath(), UnidadePressao.PSI);
        gerarCapturandoProgresso(emKgf.getAbsolutePath(), UnidadePressao.KGF_CM2);

        assertTrue(emPsi.exists() && emPsi.length() > 0);
        assertTrue(emKgf.exists() && emKgf.length() > 0);
    }

    @Test
    @DisplayName("falha ao gravar vira exceção, não sucesso silencioso")
    void falhaAoGravarPropaga() {
        // Caminho inexistente: antes o erro era apenas impresso e a tela anunciava
        // "PDF gerado com sucesso" sem que arquivo nenhum tivesse sido escrito.
        String caminhoInvalido = tempDir.resolve("pasta-que-nao-existe")
                .resolve("sub")
                .resolve("arquivo.pdf")
                .toString();

        assertThrows(PdfGeracaoException.class,
                () -> gerarCapturandoProgresso(caminhoInvalido, UnidadePressao.PSI));
    }

    @Test
    @DisplayName("aceita geração sem ouvinte de progresso")
    void progressoOpcional() {
        File destino = tempDir.resolve("sem-progresso.pdf").toFile();
        LocalDateTime inicio = LocalDateTime.now().minusHours(1);

        new PdfService().gerarPdfComGraficos(
                "POÇO", inicio, LocalDateTime.now(), "00:00:00", "23:59:59",
                destino.getAbsolutePath(), UnidadePressao.PSI, null);

        assertTrue(destino.exists());
    }
}
