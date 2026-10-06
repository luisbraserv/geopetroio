# Instrução para o agente: implantar o GeopetroIO nesta VM

Você está numa VM de produção. A tarefa é colocar **toda** a aplicação GeopetroIO no ar **nesta
máquina**, com Docker, servindo o front em `https://geopetro.braservpetroleo.com.br`.

## Repositório

O repositório **já está clonado na VM em `~/projeto/geopetroio`**. Trabalhe nessa pasta; não clone de
novo em outro lugar.

| | |
|---|---|
| Pasta na VM | `~/projeto/geopetroio` |
| URL | `https://github.com/luisbraserv/geopetroio.git` (público, sem credencial) |
| Branch | `feat/simulador-poco-geometria` (use outra só se o usuário indicar) |

Primeiro, garanta a branch certa. Um clone sem `--branch` fica na `main`, que ainda não tem esta pasta:

```bash
cd ~/projeto/geopetroio
git status                      # com alterações locais, pare e pergunte
git fetch origin
git checkout feat/simulador-poco-geometria
git pull --ff-only
git log --oneline -1            # anote o commit implantado
cd deploy/vm-unica
```

Os arquivos de implantação já existem e foram testados: `deploy/vm-unica/`. O roteiro passo a passo é
[`deploy/vm-unica/README.md`](README.md). Leia-o inteiro antes de começar e siga a ordem dele. Esta
instrução diz o que é seu trabalho, o que não pode ser tocado e quando parar para perguntar.

## O que entregar

1. Os sete serviços do `docker-compose.yml` rodando e saudáveis: `caddy`, `front`, `backend`,
   `telemetria`, `mysql`, `influxdb`, `mosquitto`.
2. `https://geopetro.braservpetroleo.com.br` abrindo a tela de login com certificado válido, e `http://`
   redirecionando para `https://`.
3. Login funcionando com um usuário real (passo 5 do README).
4. Volta automática depois de reiniciar a VM, backup diário agendado e firewall configurado (passos 8 a 10).
5. Um relatório final (modelo no fim desta instrução).

## Restrições — não negocie estas

- **Não altere** `start-dev.cmd`, `stop-dev.cmd`, nada em `deploy/dev/`,
  `apps/geopetro-backend/app/src/main/resources/application-dev.properties`,
  `apps/geopetro-frontend/src/environments/environment.ts` nem `apps/geopetro-frontend/proxy.conf.json`. São o ambiente de
  desenvolvimento e precisam continuar funcionando como estão.
- **Não altere o código das aplicações** nem as migrations. Se algo só funcionar mudando código, pare e
  descreva o problema; não contorne.
- Mudanças nos arquivos de `deploy/vm-unica/` só se forem necessárias para esta VM. Registre cada uma
  no relatório, com o motivo.
- **Segredos:** gere cada um na VM com o comando indicado no `.env.example`. Não reaproveite valores de
  desenvolvimento (`bilzao90`, `dev-token-...`, `devpassword123`). Não imprima segredos no terminal nem
  no relatório. `.env` e `mosquitto/passwd` ficam fora do Git (já estão no `.gitignore`) com `chmod 600`.
- **Não destrua dados:** nunca rode `docker compose down -v`, `docker volume rm` ou `docker system prune
  --volumes`. Para reiniciar, use `docker compose restart <serviço>` ou `docker compose up -d`.
- **Não publique portas** além de 80, 443 e 1883. MySQL, InfluxDB, backend e telemetria ficam só na rede
  interna do compose.
- Não faça `git commit` nem `git push` sem o usuário pedir.

## Pare e pergunte ao usuário quando

- O sistema não for Linux. Em Windows Server, confirme com o usuário antes de instalar WSL2: o roteiro
  é o de `deploy/vm1-transacional/windows/`, e a VM vai pedir reinicialização.
- O DNS de `geopetro.braservpetroleo.com.br` não resolver para o IP público desta VM (passo 3).
- As portas 80, 443 ou 1883 já estiverem em uso por outro serviço. Não pare nem remova o serviço que
  ocupa a porta sem autorização.
- A VM tiver menos de 8 GB de RAM ou menos de 40 GB livres em disco.
- **Antes do passo 5:** pergunte se há um dump do banco atual para importar (5A, recomendado) ou se a
  produção começa com base vazia (5B). No 5B, peça o usuário, o nome, o e-mail e a senha do primeiro
  administrador. Não invente credenciais.
- O Let's Encrypt falhar (`docker compose logs caddy`). Não tente outra autoridade nem certificado
  autoassinado por conta própria. Pergunte se há certificado da empresa (comentário no `Caddyfile`).
- For preencher o `ACME_EMAIL`: pergunte qual e-mail usar.
- For instalar qualquer pacote além de Docker Engine, plugin compose, `git`, `curl`, `openssl` e `ufw`.

## Como trabalhar

- Siga os passos 1 a 10 do README na ordem. Rode as verificações de cada passo e confira o resultado
  esperado antes de seguir.
- O passo 1 do README é o clone da seção "Repositório" acima.
- A primeira subida (`docker compose up -d --build`) compila Maven e Angular dentro da VM e leva vários
  minutos. Acompanhe com `docker compose logs -f backend`.
- Se um container reiniciar em laço, leia `docker compose logs <serviço>` antes de mexer em qualquer
  coisa. Causas comuns já conhecidas estão no README (`JWT_SECRET` vazio, `mosquitto/passwd` ausente,
  DNS ou porta 80 impedindo o certificado).
- Faça o teste final de fora da VM sempre que possível: peça ao usuário para abrir o endereço no
  navegador dele e entrar.

## Relatório final

```text
Sistema / RAM / disco:
Branch e commit implantados:
Serviços (docker compose ps):
Verificações do passo 7 (cada comando → resultado):
Banco: importado de <origem> | base nova com admin <usuário>
Certificado: emissor e validade
Reinício testado: sim/não
Backup: agendado em <horário>, primeiro arquivo em <caminho>
Firewall: regras aplicadas
Arquivos alterados em deploy/vm-unica (e por quê):
Pendências e riscos (inclua os da seção "Riscos que ficam" do README que se aplicam):
```
