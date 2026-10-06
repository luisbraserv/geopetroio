package com.example.braservhorusdesktop;

import javafx.application.Application;

public class Launcher {
    public static void main(String[] args) {
        // O aplicativo continua na bandeja com a janela fechada: abrir de novo deve trazer a
        // janela existente, nao subir um segundo processo que disputaria o CLP e o arquivo de
        // historico. Verificado antes do launch para a duplicata encerrar sem custo.
        if (!InstanciaUnica.reservar()) {
            return;
        }

        Application.launch(JavaFxApp.class, args);
    }
}
