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

  // go to Catálogo
  await abrirAba(page, 'catalogo');
  await page.waitForSelector('.item-card');

  const cardPriceText = async () => (await page.textContent('.item-card .price')).trim();

  const priceBefore = await cardPriceText();
  console.log('Preço inicial no card:', priceBefore);

  // open Editar
  await page.click('[data-edit]');
  await page.waitForSelector('#epEmb');

  // sanity: checkbox should start UNCHECKED (no prior manual adjustment) and box hidden
  const chkCheckedInitially = await page.isChecked('#epUsarAjuste');
  assert(chkCheckedInitially === false, 'checkbox "ajuste manual" começa desmarcado quando a peça não tem ajuste');
  const boxDisplay = await page.$eval('#epAjusteBox', el => getComputedStyle(el).display);
  assert(boxDisplay === 'none', 'campo de preço manual começa escondido');

  // ---- Scenario 1 (the bug report): add embalagem, leave the manual box untouched (unchecked), save ----
  await page.fill('#epEmb', '1.5');
  await page.waitForTimeout(50);
  const calculadoText = (await page.textContent('#epCalculado')).trim();
  console.log('Preço calculado após embalagem R$1,50:', calculadoText);

  await page.click('#epSave');
  await page.waitForSelector('.item-card'); // modal closes, list re-renders

  const priceAfterEmb = await cardPriceText();
  console.log('Preço no card depois de salvar (sem marcar ajuste manual):', priceAfterEmb);
  assert(priceAfterEmb === calculadoText, `card deveria mostrar o preço calculado (${calculadoText}), não ficar preso no valor antigo (${priceBefore}) — obtido: ${priceAfterEmb}`);

  const ajusteLineVisible = await page.$('.item-card .meta:has-text("de ajuste")');
  assert(ajusteLineVisible === null, 'não deve aparecer linha "de ajuste" quando nenhum ajuste manual foi definido');

  // ---- Scenario 2: turn ON manual adjustment, set an explicit final price ----
  await page.click('[data-edit]');
  await page.waitForSelector('#epEmb');
  await page.check('#epUsarAjuste');
  const boxDisplay2 = await page.$eval('#epAjusteBox', el => getComputedStyle(el).display);
  assert(boxDisplay2 !== 'none', 'campo de preço manual aparece ao marcar a caixa');
  await page.fill('#epPrecoFinal', '15');
  await page.click('#epSave');
  await page.waitForSelector('.item-card');
  const priceAfterManual = await cardPriceText();
  assert(priceAfterManual === 'R$ 15,00' || priceAfterManual.replace(/\s/g,'') === 'R$15,00', `card deveria mostrar R$ 15,00 após ajuste manual — obtido: ${priceAfterManual}`);
  const ajusteLineNow = await page.$('.item-card .meta:has-text("de ajuste")');
  assert(ajusteLineNow !== null, 'deve aparecer a linha "Calculado ... de ajuste" quando há ajuste manual');

  // ---- Scenario 3: reopen, checkbox should be pre-checked and field pre-filled with 15.00, then change embalagem again ----
  await page.click('[data-edit]');
  await page.waitForSelector('#epEmb');
  const chkCheckedNow = await page.isChecked('#epUsarAjuste');
  assert(chkCheckedNow === true, 'reabrir a peça com ajuste deve vir com a caixa marcada');
  const precoFinalFieldVal = await page.inputValue('#epPrecoFinal');
  assert(precoFinalFieldVal === '15.00', `campo "Preço final" deveria vir preenchido com 15.00 — obtido: ${precoFinalFieldVal}`);

  await page.fill('#epEmb', '2.5');
  await page.waitForTimeout(50);
  const calculadoText2 = (await page.textContent('#epCalculado')).trim();
  console.log('Novo preço calculado (embalagem R$2,50):', calculadoText2);
  const precoFinalFieldValAfter = await page.inputValue('#epPrecoFinal');
  assert(precoFinalFieldValAfter === '15.00', 'o ajuste manual (R$15,00) deve permanecer intacto mesmo mudando o custo de embalagem');
  await page.click('#epSave');
  await page.waitForSelector('.item-card');
  const priceAfterEmbChangeWithManual = await cardPriceText();
  assert(priceAfterEmbChangeWithManual.replace(/\s/g,'') === 'R$15,00', `preço final deve continuar R$15,00 (ajuste persistindo sobre novo cálculo) — obtido: ${priceAfterEmbChangeWithManual}`);

  // ---- Scenario 4: uncheck the manual adjustment -> price should revert to calculated ----
  await page.click('[data-edit]');
  await page.waitForSelector('#epEmb');
  await page.uncheck('#epUsarAjuste');
  await page.click('#epSave');
  await page.waitForSelector('.item-card');
  const priceAfterUncheck = await cardPriceText();
  const calculadoText3 = calculadoText2; // embalagem stayed at 2.5 from previous save
  console.log('Preço após desmarcar ajuste manual:', priceAfterUncheck, '| esperado (calculado):', calculadoText3);
  assert(priceAfterUncheck === calculadoText3, `ao desmarcar o ajuste manual, o preço deve voltar a ser o calculado — obtido: ${priceAfterUncheck}, esperado: ${calculadoText3}`);

  // ---- Scenario 5: set a manual adjustment again, then check it flows correctly into an Orçamento ----
  await page.click('[data-edit]');
  await page.waitForSelector('#epEmb');
  await page.check('#epUsarAjuste');
  await page.fill('#epPrecoFinal', '12');
  await page.click('#epSave');
  await page.waitForSelector('.item-card');

  await page.click('[data-add-orc]'); // "+ Orçamento" straight from the catálogo card
  await page.waitForSelector('#oItensList');
  const orcLineText = (await page.textContent('#oItensList')).trim();
  console.log('Linha do item no orçamento:', orcLineText);
  assert(orcLineText.includes('R$'), 'orçamento deve mostrar um valor em R$ para o item adicionado');
  const orcTotalText = (await page.textContent('#oTotal')).trim();
  assert(orcTotalText.replace(/\s/g,'') === 'R$12,00', `total do orçamento deveria ser R$ 12,00 (preço ajustado da peça), obtido: ${orcTotalText}`);
  await page.click('#oSalvar');
  await page.waitForTimeout(200);

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== ALGUM TESTE FALHOU ===' : '\n=== TODOS OS TESTES PASSARAM ===');
})();
