# ---- build ----
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
# Baixa dependencias antes de copiar o fonte: mudanca de codigo nao invalida esta camada.
COPY pom.xml .
RUN mvn -q -B dependency:go-offline -DskipTests || true
COPY src ./src
RUN mvn -q -B -DskipTests package

# ---- runtime ----
FROM eclipse-temurin:21-jre-jammy
WORKDIR /app

# curl para o HEALTHCHECK (nao vem na imagem jre-jammy).
# Usuario sem privilegios: um comprometimento da aplicacao nao vira root no container.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 telemetria \
 && useradd --system --uid 1001 --gid telemetria --shell /usr/sbin/nologin telemetria

COPY --from=build --chown=telemetria:telemetria /build/target/*.jar app.jar

USER telemetria

# Respeita os limites de memoria do container em vez de enxergar a RAM do host.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75 -XX:InitialRAMPercentage=50 -XX:+ExitOnOutOfMemoryError"

EXPOSE 8081

# Liveness, nao readiness: os health indicators de MQTT/InfluxDB reportam UP mesmo
# degradados de proposito (ver TelemetriaHealthIndicators). Reiniciar o container
# porque o broker caiu nao corrigiria o broker e derrubaria a API de consulta junto.
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD ["sh", "-c", "curl -fsS http://localhost:8081/actuator/health/liveness || exit 1"]

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
