#!/usr/bin/env bash
# =====================================================================
# Backup diario da VM unica: MySQL, InfluxDB e a chave SMTP.
#
#   ./backup.sh                       # grava em /var/backups/geopetro
#   BACKUP_DIR=/mnt/bk ./backup.sh
#
# Agendar (crontab -e do usuario que roda o docker):
#   30 2 * * * /caminho/para/deploy/vm-unica/backup.sh >> /var/log/geopetro-backup.log 2>&1
#
# Fica na mesma maquina: protege de erro humano e de migration ruim, nao
# de perder a VM. Copie a pasta para fora periodicamente.
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")"

DESTINO="${BACKUP_DIR:-/var/backups/geopetro}"
DIAS="${BACKUP_RETENCAO_DIAS:-14}"
stamp="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DESTINO"

# As credenciais ja estao no ambiente de cada container; nada do .env passa pela linha de comando.
docker compose exec -T mysql sh -c \
  'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers --databases "$MYSQL_DATABASE"' \
  | gzip > "$DESTINO/mysql-$stamp.sql.gz"

docker compose exec -T influxdb sh -c \
  'rm -rf /tmp/bk && influx backup /tmp/bk -t "$DOCKER_INFLUXDB_INIT_ADMIN_TOKEN" >/dev/null && tar -C /tmp -czf - bk && rm -rf /tmp/bk' \
  > "$DESTINO/influx-$stamp.tar.gz"

# Sem esta chave, a senha SMTP gravada no banco nao pode ser lida de volta.
docker run --rm --volumes-from "$(docker compose ps -q backend)" alpine \
  tar -C /app -czf - secrets > "$DESTINO/smtp-secrets-$stamp.tar.gz"

find "$DESTINO" -type f -name '*.gz' -mtime +"$DIAS" -delete
echo "$(date -Is) backup ok em $DESTINO ($stamp)"
