const fs = require('fs');
const vm = require('vm');
const ts = require('../../../Geopetro-Front/node_modules/typescript');
const file = 'Geopetro-Front/src/app/features/monitoramento/pages/limites-alarme-page/limites-alarme-page.component.ts';
const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
const component = source.statements.find(ts.isClassDeclaration);
// Execute the actual component methods with in-memory signals and controlled responses.
// Angular decorators, dependency injection and the template are outside this isolated probe.
const code = 'class Probe {\n' + component.members.filter(ts.isMethodDeclaration).map(m => m.getText(source)).join('\n')
  + '\n}\n' + source.statements.filter(ts.isFunctionDeclaration).map(f => f.getText(source)).join('\n')
  + '\nglobalThis.Probe = Probe;';
const context = { grandezasVigiaveis: () => [], parseApiError: () => 'request error' };
vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
function signal(initial) {
  let value = initial;
  const result = () => value;
  result.set = v => { value = v; };
  return result;
}
const page = new context.Probe();
for (const name of ['salvando', 'carregando', 'erro', 'aviso', 'salvo', 'cardsLidos']) page[name] = signal(false);
page.sondaSelecionada = signal({ id: 1 });
page.documento = signal({ revisao: 1 });
page.linhas = signal([]);
page.podeSalvar = () => true;
let pendingSave, requestedUnit;
page.limitesService = { salvar: () => ({ subscribe: callbacks => { pendingSave = callbacks; } }) };
page.cardsService = { ler: id => ({ subscribe: callbacks => {
  requestedUnit = id;
  callbacks.next({ cards: [] });
} }) };
page.salvar();
page.sondaSelecionada.set({ id: 2 }); // The UI allows changing selection while a save is in flight.
page.documento.set({ revisao: 2 }); // Unit 2 has already finished loading.
pendingSave.error({ status: 409 });
if (requestedUnit !== 1 || page.carregando() !== true || page.sondaSelecionada().id !== 2) {
  throw Error('Scenario not reproduced');
}
const evidence = 'REPRODUCED | old unit save conflict leaves current unit loading | selected=2; reload=1; loading=true';
fs.writeFileSync('deploy/dev/audit-september/frontend-probe.log', evidence + '\n');
console.log(evidence);
