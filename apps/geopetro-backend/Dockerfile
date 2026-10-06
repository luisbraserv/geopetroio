# ---- build (projeto multi-modulo; o artefato executavel e o modulo 'app') ----
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# Copia so os poms primeiro: mudanca de codigo nao invalida o cache de dependencias.
COPY pom.xml .
COPY core/pom.xml core/
COPY empresa/pom.xml empresa/
COPY regional/pom.xml regional/
COPY setor/pom.xml setor/
COPY usuario/pom.xml usuario/
COPY unidade-sonda/pom.xml unidade-sonda/
COPY simulador/pom.xml simulador/
COPY security/pom.xml security/
COPY app/pom.xml app/
RUN mvn -q -B -pl app -am dependency:go-offline -DskipTests || true

COPY . .
RUN mvn -q -B -pl app -am -DskipTests package

# ---- runtime ----
FROM eclipse-temurin:21-jre-jammy
WORKDIR /app

# curl para o HEALTHCHECK (nao vem na imagem jre-jammy).
# Usuario sem privilegios: um comprometimento da aplicacao nao vira root no container.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 geopetro \
 && useradd --system --uid 1001 --gid geopetro --shell /usr/sbin/nologin geopetro

COPY --from=build --chown=geopetro:geopetro /build/app/target/*.jar app.jar

# Chave SMTP fora do banco, em volume persistente com acesso do usuario da aplicacao.
RUN mkdir -p /app/secrets && chown geopetro:geopetro /app/secrets && chmod 700 /app/secrets
ENV SMTP_SETTINGS_KEY_FILE=/app/secrets/smtp-settings.key

USER geopetro

# A imagem e um artefato de PRODUCAO: o perfil correto e o default, nao algo a lembrar
# de passar. Sem isto, o application-prod.properties nao e lido e a aplicacao usaria o
# MySQL de localhost e o segredo JWT de desenvolvimento.
ENV SPRING_PROFILES_ACTIVE=prod

# Respeita os limites de memoria do container em vez de enxergar a RAM do host.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75 -XX:InitialRAMPercentage=50 -XX:+ExitOnOutOfMemoryError"

EXPOSE 8080

# Depende do actuator (spring-boot-starter-actuator) e de /actuator/health estar liberado
# no SecurityConfig. Em Kubernetes, prefira as probes do manifesto a este HEALTHCHECK.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["sh", "-c", "curl -fsS http://localhost:8080/actuator/health/readiness || exit 1"]

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
