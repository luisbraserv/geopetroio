package com.braserv.core.identidade.recuperacao;

import java.time.Clock;
import java.util.concurrent.*;
import org.springframework.context.annotation.*;

@Configuration
public class RecoveryConfiguration {
    @Bean Clock recoveryClock() { return Clock.systemUTC(); }
    @Bean(destroyMethod = "shutdown") ExecutorService recoveryExecutor() {
        return new ThreadPoolExecutor(1, 1, 0, TimeUnit.SECONDS, new ArrayBlockingQueue<>(100),
            Thread.ofPlatform().daemon().name("password-recovery-", 0).factory(), new ThreadPoolExecutor.AbortPolicy());
    }
}
