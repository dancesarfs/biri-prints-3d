const { chromium } = require('playwright');
const path = require('path');
const { passarPeloGateVendedor, abrirAba } = require('./test_helpers');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('OK:', msg);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'app', 'bancada-3d.html');
  await page.goto(fileUrl);
  await passarPeloGateVendedor(page);
  await page.waitForSelector('#btnAbrirMenu');

  await abrirAba(page, 'catalogo'); // Catálogo
  await page.waitForSelector('.item-card');
  const cardCountBefore = (await page.$$('.item-card')).length;
  assert(cardCountBefore === 1, `deveria começar com 1 peça (TESTE, seed) — obtido: ${cardCountBefore}`);
  const originalPriceBefore = (await page.textContent('.item-card .price')).trim();

  // clica em Duplicar
  await page.click('[data-dup]');
  await page.waitForSelector('#epNome');

  const modalTitle = (await page.textContent('.modal h2')).trim();
  assert(modalTitle === 'Duplicar peça', `título do modal deveria ser "Duplicar peça" — obtido: "${modalTitle}"`);
  const nomePrefill = await page.inputValue('#epNome');
  assert(nomePrefill === 'TESTE (cópia)', `nome deveria vir como "TESTE (cópia)" — obtido: "${nomePrefill}"`);
  const gramPrefill = await page.inputValue('#epGram');
  assert(gramPrefill === '17', `gramatura deveria vir preenchida com 17 (copiada da original) — obtido: ${gramPrefill}`);
  const saveLabel = (await page.textContent('#epSave')).trim();
  assert(saveLabel === 'Salvar como nova peça', `botão deveria dizer "Salvar como nova peça" — obtido: "${saveLabel}"`);

  // edita nome e gramatura, salva
  await page.fill('#epNome', 'TESTE variante grande');
  await page.fill('#epGram', '40');
  await page.click('#epSave');
  await page.waitForTimeout(200);

  const cardCountAfter = (await page.$$('.item-card')).length;
  assert(cardCountAfter === 2, `deveria haver 2 peças no catálogo após duplicar — obtido: ${cardCountAfter}`);

  const cards = await page.$$('.item-card');
  let originalStillThere = false, novaEncontrada = false, novaMeta = '';
  for (const c of cards) {
    const txt = await c.textContent();
    if (txt.includes('TESTE variante grande')) { novaEncontrada = true; novaMeta = txt; }
    if (/^TESTE(?! variante)/.test(txt.trim()) || txt.includes('>TESTE<')) { /* noop, handled below */ }
  }
  assert(novaEncontrada, 'a nova peça duplicada e editada deve aparecer no catálogo');
  assert(novaMeta.includes('40g'), `a nova peça deve refletir a gramatura editada (40g) — obtido meta: ${novaMeta}`);

  // a original TESTE deve continuar intacta (mesmo preço de antes)
  let originalCardText = null, originalPriceAfter = null;
  for (const c of cards) {
    const h3 = await c.$eval('h3', el => el.textContent.trim());
    if (h3 === 'TESTE') { originalCardText = await c.textContent(); originalPriceAfter = (await c.$eval('.price', el => el.textContent)).trim(); }
  }
  assert(originalCardText !== null, 'a peça original TESTE ainda deve existir sem alteração');
  assert(originalPriceAfter === originalPriceBefore, `preço da peça original não deve mudar após duplicar — antes: ${originalPriceBefore}, depois: ${originalPriceAfter}`);

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== ALGUM TESTE FALHOU ===' : '\n=== TODOS OS TESTES PASSARAM ===');
})();
