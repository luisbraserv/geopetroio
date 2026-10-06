# ---- build (projeto multi-modulo; o artefato executavel e o modulo app) ----
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# Copia os POMs primeiro para aproveitar o cache de dependencias.
COPY pom.xml .
COPY comum/pom.xml comum/
COPY regional/pom.xml regional/
COPY setor/pom.xml setor/
COPY unidade/pom.xml unidade/
COPY empresa/pom.xml empresa/
COPY usuario/pom.xml usuario/
COPY identidade/pom.xml identidade/
COPY interno/pom.xml interno/
COPY app/pom.xml app/
RUN mvn -q -B -pl app -am dependency:go-offline -DskipTests || true

COPY . .
RUN mvn -q -B -pl app -am -DskipTests package

# ---- runtime ----
FROM eclipse-temurin:21-jre-jammy
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 braserv \
 && useradd --system --uid 1001 --gid braserv --shell /usr/sbin/nologin braserv \
 && mkdir -p /app/secrets \
 && chown braserv:braserv /app/secrets \
 && chmod 700 /app/secrets

COPY --from=build --chown=braserv:braserv /build/app/target/*.jar app.jar

# A configuracao SMTP foi movida com os dados; esta chave precisa ser a mesma
# usada antes pelo backend para que senhas ja cifradas continuem legiveis.
ENV SMTP_SETTINGS_KEY_FILE=/app/secrets/smtp-settings.key
ENV SPRING_PROFILES_ACTIVE=prod
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75 -XX:InitialRAMPercentage=50 -XX:+ExitOnOutOfMemoryError"

USER braserv

EXPOSE 8082

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["sh", "-c", "curl -fsS http://localhost:8082/actuator/health/readiness || exit 1"]

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
