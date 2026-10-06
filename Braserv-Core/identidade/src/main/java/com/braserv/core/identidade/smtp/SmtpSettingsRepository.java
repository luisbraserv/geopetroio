package com.braserv.core.identidade.smtp;

import org.springframework.data.jpa.repository.JpaRepository;
public interface SmtpSettingsRepository extends JpaRepository<SmtpSettingsEntity, Long> {}
