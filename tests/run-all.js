// Roda todas as suítes de teste (Playwright, sem framework de teste — cada arquivo é
// um script IIFE que usa process.exitCode = 1 pra sinalizar falha) uma de cada vez, em
// processos separados, e imprime um resumo no final.
//
// Uso:
//   npm test
//   node tests/run-all.js
//   node tests/run-all.js test_clientes.js test_vendedores.js   (roda só alguns arquivos)

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const todos = fs.readdirSync(dir)
  .filter(f => f.startsWith('test_') && f.endsWith('.js'))
  .sort();

const alvo = process.argv.slice(2);
const arquivos = alvo.length ? alvo : todos;

console.log(`Rodando ${arquivos.length} suíte(s)...\n`);

const resultados = [];
for (const arquivo of arquivos) {
  const full = path.join(dir, arquivo);
  if (!fs.existsSync(full)) {
    console.log(`?? ${arquivo} não encontrado, pulando`);
    continue;
  }
  process.stdout.write(`=== ${arquivo} ===\n`);
  try {
    execFileSync(process.execPath, [full], { stdio: 'inherit' });
    resultados.push({ arquivo, ok: true });
  } catch (e) {
    resultados.push({ arquivo, ok: false });
  }
  process.stdout.write('\n');
}

console.log('==================== RESUMO ====================');
for (const r of resultados) {
  console.log(`${r.ok ? 'OK  ' : 'FAIL'}  ${r.arquivo}`);
}
const falhas = resultados.filter(r => !r.ok).length;
console.log(`\n${resultados.length - falhas}/${resultados.length} suítes passaram.`);
if (falhas > 0) process.exitCode = 1;
