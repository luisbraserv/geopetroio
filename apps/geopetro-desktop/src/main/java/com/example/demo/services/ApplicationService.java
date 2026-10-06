package com.example.demo.services;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * Serviço de utilitários gerais da aplicação
 */
@Service
public class ApplicationService {

    private static final Logger logger = LoggerFactory.getLogger(ApplicationService.class);
    private final DateTimeFormatter formatter = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss");

    /**
     * Obtém informações do sistema
     */
    public SystemInfo getSystemInfo() {
        SystemInfo info = new SystemInfo();
        info.setAppName("Geopetro Desktop");
        info.setVersion("1.0.0");
        info.setStartupTime(LocalDateTime.now());
        info.setJavaVersion(System.getProperty("java.version"));
        info.setOsName(System.getProperty("os.name"));
        
        logger.info("Informações do sistema obtidas: {}", info.getAppName());
        return info;
    }

    /**
     * Obtém o horário formatado
     */
    public String getCurrentTime() {
        return LocalDateTime.now().format(formatter);
    }

    /**
     * Verifica a saúde da aplicação
     */
    public HealthStatus getHealthStatus() {
        HealthStatus status = new HealthStatus();
        status.setStatus("UP");
        status.setTimestamp(getCurrentTime());
        status.setMessage("Sistema operacional");
        
        try {
            // Verificar memória disponível
            Runtime runtime = Runtime.getRuntime();
            long freeMemory = runtime.freeMemory() / (1024 * 1024); // em MB
            long totalMemory = runtime.totalMemory() / (1024 * 1024); // em MB
            
            status.setFreeMemory(freeMemory + " MB");
            status.setTotalMemory(totalMemory + " MB");
        } catch (Exception e) {
            logger.error("Erro ao obter informações de memória", e);
        }
        
        return status;
    }

    /**
     * Classe interna para informações do sistema
     */
    public static class SystemInfo {
        private String appName;
        private String version;
        private LocalDateTime startupTime;
        private String javaVersion;
        private String osName;

        // Getters e Setters
        public String getAppName() { return appName; }
        public void setAppName(String appName) { this.appName = appName; }
        
        public String getVersion() { return version; }
        public void setVersion(String version) { this.version = version; }
        
        public LocalDateTime getStartupTime() { return startupTime; }
        public void setStartupTime(LocalDateTime startupTime) { this.startupTime = startupTime; }
        
        public String getJavaVersion() { return javaVersion; }
        public void setJavaVersion(String javaVersion) { this.javaVersion = javaVersion; }
        
        public String getOsName() { return osName; }
        public void setOsName(String osName) { this.osName = osName; }
        
        @Override
        public String toString() {
            return "SystemInfo{" +
                    "appName='" + appName + '\'' +
                    ", version='" + version + '\'' +
                    ", javaVersion='" + javaVersion + '\'' +
                    ", osName='" + osName + '\'' +
                    '}';
        }
    }

    /**
     * Classe interna para status de saúde
     */
    public static class HealthStatus {
        private String status;
        private String timestamp;
        private String message;
        private String freeMemory;
        private String totalMemory;

        // Getters e Setters
        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }
        
        public String getTimestamp() { return timestamp; }
        public void setTimestamp(String timestamp) { this.timestamp = timestamp; }
        
        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }
        
        public String getFreeMemory() { return freeMemory; }
        public void setFreeMemory(String freeMemory) { this.freeMemory = freeMemory; }
        
        public String getTotalMemory() { return totalMemory; }
        public void setTotalMemory(String totalMemory) { this.totalMemory = totalMemory; }
        
        @Override
        public String toString() {
            return "HealthStatus{" +
                    "status='" + status + '\'' +
                    ", timestamp='" + timestamp + '\'' +
                    ", message='" + message + '\'' +
                    ", freeMemory='" + freeMemory + '\'' +
                    ", totalMemory='" + totalMemory + '\'' +
                    '}';
        }
    }
}
