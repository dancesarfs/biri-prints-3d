// Confere que o FIREBASE_CONFIG do app standalone aponta pro projeto de PRODUÇÃO
// (biri-prints-3d), não pro de QA (biri-prints-3d-qa) — chamado só por um passo dedicado do
// workflow de CI (.github/workflows/tests.yml), condicionado a rodar apenas quando o alvo é a
// branch main (push direto nela, ou uma PR com base main — a promoção de QA pra produção).
//
// De propósito, esse arquivo NÃO casa o padrão "test_*.js" que tests/run-all.js roda sem filtro de
// branch em todo `npm test` — se entrasse nesse padrão, quebraria a suíte inteira ao rodar na
// própria branch qa, onde esse mesmo FIREBASE_CONFIG aponta pra QA de propósito.
const fs = require('fs');
const path = require('path');

const PROJECT_ID_PRODUCAO = 'biri-prints-3d';
const arquivo = path.resolve(__dirname, '..', 'app', 'biri-prints-3d-standalone.html');
const html = fs.readFileSync(arquivo, 'utf8');

const m = html.match(/const FIREBASE_CONFIG = \{[\s\S]*?projectId:\s*"([^"]+)"/);
if (!m) {
  console.error('FAIL: não encontrei "projectId" dentro do FIREBASE_CONFIG em', arquivo);
  process.exitCode = 1;
} else if (m[1] !== PROJECT_ID_PRODUCAO) {
  console.error(`FAIL: FIREBASE_CONFIG.projectId é "${m[1]}", mas a branch main precisa apontar pra produção ("${PROJECT_ID_PRODUCAO}") — parece que uma promoção de QA esqueceu de restaurar o config.`);
  process.exitCode = 1;
} else {
  console.log(`OK: FIREBASE_CONFIG.projectId aponta pra produção ("${PROJECT_ID_PRODUCAO}")`);
}
