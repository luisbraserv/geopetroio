package com.example.demo;

import com.example.demo.config.InstanciaUnica;
import com.example.demo.config.JavaFXConfiguration;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.ComponentScan;

// A poda do historico local roda agendada; sem isto ela nunca dispararia e a tabela voltaria a
// crescer sem limite — que era o estado anterior, e o motivo de ela existir.
@org.springframework.scheduling.annotation.EnableScheduling
@SpringBootApplication
@ComponentScan(basePackages = {"com.example.demo"})
public class DesktopSondaGeopetroIoApplication {

	public static void main(String[] args) {
		// Antes de qualquer coisa: o aplicativo continua na bandeja com a janela fechada, e abrir
		// de novo deve trazer a janela existente, nao subir um segundo processo — que disputaria
		// o CLP e o banco H2 de arquivo unico. A verificacao vem primeiro para que a duplicata
		// encerre sem pagar o custo de subir Spring e JavaFX.
		if (!InstanciaUnica.reservar()) {
			return;
		}

		// Chamar JavaFXConfiguration que vai iniciar Spring + JavaFX
		JavaFXConfiguration.main(args);
	}

}
