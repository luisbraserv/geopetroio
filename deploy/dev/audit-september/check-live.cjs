const fs = require('fs');

// Read-only local checks. Stored station credentials and tokens never enter the output.
async function main() {
  const settings = JSON.parse(fs.readFileSync('apps/geopetro-desktop/config/app-settings.json', 'utf8'));
  const base = settings.backendUrl.replace(/\/$/, '');
  if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw Error('Local host required');
  const results = [];
  async function check(url, options = {}) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
      const body = await response.text();
      results.push({ method: options.method || 'GET', url, status: response.status });
      return { response, body };
    } catch (e) {
      results.push({ method: options.method || 'GET', url, status: 0, error: e.name });
      return null;
    }
  }
  for (const origin of ['http://localhost:4200', base, 'http://localhost:8081']) {
    await check(origin + (origin.endsWith('4200') ? '/' : '/actuator/health'));
  }
  const login = await check(base + '/api/auth/login', { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: settings.backendUsuario, password: settings.backendSenha }) });
  if (login?.response.ok) {
    const token = JSON.parse(login.body).token;
    if (typeof token !== 'string' || !token) throw Error('Login did not return a token');
    const headers = { Authorization: 'Bearer ' + token };
    const unit = settings.unidadeSondaId;
    const end = new Date().toISOString(), start = new Date(Date.now() - 86400000).toISOString();
    for (const path of ['/api/sondas/minhas', `/api/sondas/${unit}/cards`,
      `/api/sondas/${unit}/configuracao`, `/api/sondas/${unit}/alarmes`,
      `/api/sondas/${unit}/alarmes/historico?inicio=${start}&fim=${end}`,
      '/api/sondas/prontidao']) {
      await check(base + path, { headers });
    }
  }
  const docs = await check(base + '/v3/api-docs');
  let paths = [];
  if (docs?.response.ok) {
    try { paths = Object.keys(JSON.parse(docs.body).paths || {}).sort(); } catch { }
  }
  const output = { checkedAt: new Date().toISOString(), results, documentedPaths: paths };
  fs.writeFileSync('deploy/dev/audit-september/live.json', JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
}
main().catch(e => { console.error('Audit check failed:', e.name); process.exitCode = 1; });
