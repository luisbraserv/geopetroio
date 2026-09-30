import { defineConfig } from 'vitest/config';

/**
 * Configuração do runner de testes, carregada pelo builder `@angular/build:unit-test`
 * via `runnerConfig` em `angular.json`.
 *
 * ## Por que `testTimeout` existe aqui
 *
 * O padrão do vitest é 5.000 ms. Os specs que montam a página inteira da cimentação
 * primária (`simulador-primaria.*.spec.ts`, `primary-regression.spec.ts`) passam desse
 * limite quando a suíte roda em paralelo: o componente é o maior do bundle, e a montagem
 * disputa CPU com os outros arquivos de teste.
 *
 * O sintoma enganava — `Error: Test timed out in 5000ms` no `create()`, antes de qualquer
 * `expect`, e **quais** specs estouravam mudava a cada execução: 4 arquivos com a suíte
 * inteira em paralelo, 2 em lotes de 15, nenhum rodando só a pasta da primária. Parecia
 * teste intermitente e era orçamento de tempo apertado demais para o que esses specs fazem.
 *
 * 30.000 ms é folga para a montagem mais lenta observada (~10,5 s) sem deixar de falhar
 * um teste que de fato travou.
 */
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
