#!/usr/bin/env bash
# Executado pela imagem oficial do MySQL somente na criacao de um volume novo.
# Em uma instalacao existente, use o procedimento documentado no README da VM.
# O bloco roda em subshell porque a imagem oficial pode carregar arquivos .sh
# sem bit executavel com "source"; assim as opcoes de shell nao vazam para ela.
(
set -euo pipefail

: "${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD nao definido}"
: "${CORE_DB_NAME:?CORE_DB_NAME nao definido}"
: "${CORE_DB_USERNAME:?CORE_DB_USERNAME nao definido}"
: "${CORE_DB_PASSWORD:?CORE_DB_PASSWORD nao definido}"

case "$CORE_DB_NAME" in (*[!A-Za-z0-9_]*) echo "CORE_DB_NAME invalido" >&2; exit 1;; esac
case "$CORE_DB_USERNAME" in (*[!A-Za-z0-9_]*) echo "CORE_DB_USERNAME invalido" >&2; exit 1;; esac
case "$CORE_DB_PASSWORD" in (*"'"*|*\\*|*$'\n'*|*$'\r'*) echo "CORE_DB_PASSWORD contem caractere nao suportado" >&2; exit 1;; esac

mysql --protocol=socket -uroot -p"$MYSQL_ROOT_PASSWORD" <<SQL
CREATE DATABASE IF NOT EXISTS \`$CORE_DB_NAME\`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS '$CORE_DB_USERNAME'@'%' IDENTIFIED BY '$CORE_DB_PASSWORD';
ALTER USER '$CORE_DB_USERNAME'@'%' IDENTIFIED BY '$CORE_DB_PASSWORD';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM '$CORE_DB_USERNAME'@'%';
GRANT ALL PRIVILEGES ON \`$CORE_DB_NAME\`.* TO '$CORE_DB_USERNAME'@'%';
FLUSH PRIVILEGES;
SQL
)
