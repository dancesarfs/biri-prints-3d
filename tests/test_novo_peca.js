const { chromium } = require('playwright');
const path = require('path');
const { passarPeloGateVendedor, abrirAba, abrirNovoProdutoModal } = require('./test_helpers');

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
  await abrirNovoProdutoModal(page); // Catálogo é a tela inicial; "Adicionar Produto" abre o modal

  // preenche uma peça nova
  await page.fill('#cNome', 'Chaveiro gatinho');
  await page.selectOption('#cMaterial', { index: 0 });
  await page.fill('#cGram', '10');
  await page.fill('#cTempoH', '0');
  await page.fill('#cTempoM', '40');
  await page.fill('#cEmb', '0');
  await page.waitForTimeout(50);

  // checkbox começa desmarcada, caixa escondida
  assert((await page.isChecked('#cUsarAjuste')) === false, 'checkbox de ajuste começa desmarcada no modal Adicionar produto');
  assert((await page.$eval('#cAjusteBox', el => getComputedStyle(el).display)) === 'none', 'campo de ajuste começa escondido no modal Adicionar produto');

  const tileTextBefore = (await page.textContent('#priceTile')).trim();
  console.log('Tile de preço (sem ajuste):', tileTextBefore);
  assert(!tileTextBefore.includes('Calculado'), 'sem ajuste marcado, o tile não deve mostrar linha de "Calculado ±"');

  // marca o ajuste manual -> campo deve vir preenchido com o valor calculado
  await page.check('#cUsarAjuste');
  await page.waitForTimeout(50);
  assert((await page.$eval('#cAjusteBox', el => getComputedStyle(el).display)) !== 'none', 'campo de ajuste aparece ao marcar a caixa');
  const precoFinalPrefill = await page.inputValue('#cPrecoFinal');
  console.log('Campo Preço final pré-preenchido com:', precoFinalPrefill);

  // define um preço manual de R$20
  await page.fill('#cPrecoFinal', '20');
  await page.waitForTimeout(50);
  const tileTextAdjusted = (await page.textContent('#priceTile')).trim();
  console.log('Tile de preço (ajustado p/ R$20):', tileTextAdjusted);
  assert(tileTextAdjusted.replace(/\s/g,'').includes('R$20,00'), `tile deveria mostrar R$ 20,00 — obtido: ${tileTextAdjusted}`);
  assert(tileTextAdjusted.includes('Calculado'), 'tile deve mostrar a linha "Calculado ..." quando há ajuste manual definido');

  // salva no catálogo
  await page.click('#btnSalvarCatalogo');
  await page.waitForSelector('.item-card');
  const cardPrice = (await page.textContent('.item-card .price')).trim();
  console.log('Preço no card do catálogo:', cardPrice);
  assert(cardPrice.replace(/\s/g,'') === 'R$20,00', `card do catálogo deveria mostrar R$ 20,00 — obtido: ${cardPrice}`);
  const ajusteLine = await page.$('.item-card .meta:has-text("de ajuste")');
  assert(ajusteLine !== null, 'card do catálogo deve mostrar a linha de ajuste para a peça recém-criada');

  // ---- segunda peça: SEM marcar ajuste, preço final deve ser só o calculado ----
  await abrirNovoProdutoModal(page);
  await page.fill('#cNome', 'Porta-copos');
  await page.selectOption('#cMaterial', { index: 0 });
  await page.fill('#cGram', '25');
  await page.fill('#cTempoH', '1');
  await page.fill('#cTempoM', '0');
  await page.fill('#cEmb', '0');
  await page.waitForTimeout(50);
  const tileTextSemAjuste = (await page.textContent('#priceTile .num')).trim();
  await page.click('#btnSalvarCatalogo');
  await page.waitForSelector('.item-card');
  const cards = await page.$$('.item-card');
  // encontra o card "Porta-copos"
  let portaCoposPrice = null;
  for (const c of cards) {
    const txt = await c.textContent();
    if (txt.includes('Porta-copos')) { portaCoposPrice = (await c.$eval('.price', el => el.textContent)).trim(); }
  }
  console.log('Preço calculado na tela:', tileTextSemAjuste, '| preço no card:', portaCoposPrice);
  assert(portaCoposPrice === tileTextSemAjuste, `peça salva sem marcar ajuste deve ter o preço igual ao calculado na tela — tela: ${tileTextSemAjuste}, card: ${portaCoposPrice}`);

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== ALGUM TESTE FALHOU ===' : '\n=== TODOS OS TESTES PASSARAM ===');
})();
