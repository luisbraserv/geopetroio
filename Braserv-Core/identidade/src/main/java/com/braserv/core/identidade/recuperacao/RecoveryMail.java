package com.braserv.core.identidade.recuperacao;

public interface RecoveryMail {
    boolean available();
    void sendLink(String email, String token);
    void sendConfirmation(String email);
}
