# Braserv-Core

Cadastro organizacional e identidade da Braserv: Usuário, Empresa, Regional, Setor e Unidade, login e emissão de tokens. Os outros sistemas consomem o core e não guardam cópia desses dados (RN-115).

- Arquitetura e plano: [specs/SDD/software/backend/braserv-core.md](../../specs/SDD/software/backend/braserv-core.md)
- Contrato com as outras aplicações: [specs/SDD/software/apis/braserv-core.md](../../specs/SDD/software/apis/braserv-core.md)
- Specs exclusivas do core: [specs/](specs/README.md)

## Rodar localmente

Requisitos: Java 21+ e MySQL 8 em `localhost:3306`.

```bash
./mvnw -DskipTests package
DB_PASSWORD=<senha do root local> java -jar app/target/Braserv-Core-0.0.1-SNAPSHOT.jar
```

- Sobe na porta **8082**, com o perfil `dev`.
- Cria o database `braserv_core` se não existir, e o Flyway cria as tabelas.
- Gera a chave de assinatura de desenvolvimento em `~/.braserv-core/jwt-dev.pem` na primeira subida.

| Para conferir | Endereço |
|---|---|
| Saúde | `GET http://localhost:8082/actuator/health` |
| Chave pública dos tokens | `GET http://localhost:8082/.well-known/jwks.json` |
| Documentação da API | `http://localhost:8082/swagger-ui.html` |

## Testes

```bash
DB_PASSWORD=<senha do root local> ./mvnw test
```

`MigracaoFlywayTest` roda as migrations num database descartável (`braserv_core_migracao_teste`) do MySQL local e é pulado se o MySQL não responder.

## Produção

O perfil `prod` exige `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` e `JWT_CHAVE_PRIVADA`, que é o caminho do PEM da chave privada. A chave nunca é gerada em produção:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out jwt-privada.pem
```

Durante uma rotação, `JWT_CHAVES_PUBLICAS_ANTERIORES` lista os PEMs públicos das chaves anteriores, separados por vírgula.
