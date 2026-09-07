package com.example.demo.config;

import com.example.demo.models.SondaReading;
import com.example.demo.repositories.SondaReadingRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * Insere 1000 registros de teste no banco apenas se ele estiver vazio.
 */
@Component
public class SondaReadingSeeder implements ApplicationRunner {

    private static final Logger logger = LoggerFactory.getLogger(SondaReadingSeeder.class);
    private static final int TOTAL = 1000;

    private final SondaReadingRepository repository;

    public SondaReadingSeeder(SondaReadingRepository repository) {
        this.repository = repository;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (repository.count() > 0) {
            logger.info("[Seeder] Banco ja possui {} registros. Seed ignorado.", repository.count());
            return;
        }

        logger.info("[Seeder] Inserindo {} registros de teste...", TOTAL);

        Random rng = new Random(42);
        LocalDateTime base = LocalDateTime.now().minusHours(TOTAL / 60).withSecond(0).withNano(0);

        List<SondaReading> batch = new ArrayList<>(TOTAL);
        double pesoBase    = 80_000;
        double torque1Base = 12_000;
        double torque2Base = 9_500;
        double pressaoBase = 1_200;
        double vazaoBase   = 3.5;
        long   stroke      = 0;

        for (int i = 0; i < TOTAL; i++) {
            LocalDateTime ts = base.plusSeconds(i * 6L); // 1 registro a cada 6s ≈ 1h40 de dados

            // simula curvas com ruído + tendência suave
            double t = i / (double) TOTAL;

            double peso    = pesoBase    + 15_000 * Math.sin(t * Math.PI * 4) + rng.nextGaussian() * 2_000;
            double torq1   = torque1Base + 3_000  * Math.sin(t * Math.PI * 6 + 1) + rng.nextGaussian() * 500;
            double torq2   = torque2Base + 2_500  * Math.sin(t * Math.PI * 5 + 2) + rng.nextGaussian() * 400;
            double pressao = pressaoBase + 400    * Math.sin(t * Math.PI * 8 + 0.5) + rng.nextGaussian() * 80;
            double vazao   = vazaoBase   + 1.5    * Math.sin(t * Math.PI * 3) + rng.nextGaussian() * 0.3;
            stroke        += rng.nextInt(3); // 0, 1 ou 2 strokes por intervalo

            batch.add(new SondaReading(
                    ts,
                    Math.max(0, peso),
                    Math.max(0, torq1),
                    Math.max(0, torq2),
                    Math.max(0, pressao),
                    Math.max(0, vazao),
                    stroke
            ));
        }

        repository.saveAll(batch);
        logger.info("[Seeder] {} registros inseridos. Periodo: {} ate {}",
                TOTAL, base, base.plusSeconds(TOTAL * 6L));
    }
}
