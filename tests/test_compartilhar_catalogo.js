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
  await page.waitForSelector('#btnAbrirMenu');

  // grava permissão de clipboard pra evitar prompt bloqueando o teste
  await browser.newContext; // no-op, mantém referência

  await abrirAba(page, 'catalogo'); // Catálogo
  await page.waitForSelector('.item-card');

  const cardCountInicial = (await page.$$('.item-card')).length;
  assert(cardCountInicial === 1, `catálogo deveria começar com 1 peça (seed TESTE) — obtido: ${cardCountInicial}`);

  await page.click('#btnCompartilharCatalogo');
  await page.waitForSelector('#shPreview');

  const chksIniciais = await page.$$eval('.share-prod-chk', els => els.map(e=>e.checked));
  assert(chksIniciais.length === 1 && chksIniciais.every(c=>c===true), 'todas as peças devem vir marcadas por padrão no modal de compartilhar');

  let preview = (await page.inputValue('#shPreview'));
  console.log('--- prévia com 1 peça ---\n' + preview + '\n---');
  assert(preview.includes('Catálogo Biri Prints 3D'), 'prévia deve ter o cabeçalho do catálogo');
  assert(preview.includes('TESTE'), 'prévia deve conter o nome da peça');
  assert(preview.includes('R$'), 'prévia deve conter o preço formatado em R$');
  assert(!preview.includes('Kits com desconto'), 'sem promoção ativa, não deve aparecer o aviso de kit com desconto');

  // desmarca a única peça -> prévia deve ficar vazia
  await page.click('.share-prod-chk');
  await page.waitForTimeout(50);
  const previewVazia = await page.inputValue('#shPreview');
  assert(previewVazia === '', `desmarcar a única peça deve deixar a prévia vazia — obtido: "${previewVazia}"`);

  // clicar em copiar sem nada marcado deve avisar, não travar
  await page.click('#shCopiar');
  await page.waitForTimeout(50);

  // remarca
  await page.click('.share-prod-chk');
  await page.waitForTimeout(50);

  await page.click('#shCopiar');
  await page.waitForTimeout(150);

  // fecha modal e cria mais uma peça pra testar múltiplas + seleção parcial
  await page.keyboard.press('Escape').catch(()=>{});
  await page.click('body', { position: { x: 5, y: 5 } }).catch(()=>{});
  await page.evaluate(() => { const el = document.getElementById('modalBackdrop'); if(el) el.remove(); });

  await abrirNovoProdutoModal(page);
  await page.fill('#cNome', 'Peça Extra Share');
  await page.selectOption('#cMaterial', { index: 0 });
  await page.fill('#cGram', '15');
  await page.fill('#cTempoH', '0');
  await page.fill('#cTempoM', '30');
  await page.fill('#cEmb', '0');
  await page.waitForTimeout(30);
  await page.click('#btnSalvarCatalogo');
  await page.waitForSelector('.item-card');

  await page.click('#btnCompartilharCatalogo');
  await page.waitForSelector('#shPreview');
  const chks2 = await page.$$('.share-prod-chk');
  assert(chks2.length === 2, `modal deve listar as 2 peças cadastradas — obtido: ${chks2.length}`);

  const preview2 = await page.inputValue('#shPreview');
  assert(preview2.includes('TESTE') && preview2.includes('Peça Extra Share'), 'prévia com as 2 peças marcadas deve conter os dois nomes');

  // desmarca só "Peça Extra Share" (a nova peça é prependada em modo local, então não assume índice fixo) -> prévia deve manter só TESTE
  const shareLabels = await page.$$eval('label:has(.share-prod-chk)', els => els.map(e=>e.textContent.trim()));
  const idxExtra = shareLabels.findIndex(t=>t.includes('Peça Extra Share'));
  assert(idxExtra !== -1, 'deve existir uma checkbox pra "Peça Extra Share" no modal');
  await chks2[idxExtra].click();
  await page.waitForTimeout(50);
  const preview3 = await page.inputValue('#shPreview');
  assert(preview3.includes('TESTE') && !preview3.includes('Peça Extra Share'), 'desmarcar uma peça deve tirá-la da prévia, mantendo a outra');

  await page.evaluate(() => { const el = document.getElementById('modalBackdrop'); if(el) el.remove(); });

  // ---- testa o aviso de promoção ativa injetando uma promoção vigente hoje ----
  await abrirAba(page, 'admin-grupos');
  await page.waitForSelector('#btnAddGrupo');
  await page.click('#btnAddGrupo');
  await page.waitForSelector('#gNome');
  await page.fill('#gNome', 'Grupo Share Promo');
  const gLabels = await page.$$eval('label:has(.grupo-prod-chk)', els => els.map(e=>e.textContent.trim()));
  const gChks = await page.$$('.grupo-prod-chk');
  for (let i=0;i<gLabels.length;i++){ if(/TESTE|Peça Extra Share/.test(gLabels[i])) await gChks[i].check(); }
  await page.click('#gSave');
  await page.waitForTimeout(150);

  // Grupos e Promoções agora são submenus separados dentro de Admin (antes eram a mesma página) —
  // precisa navegar de novo pra chegar em Promoções.
  await abrirAba(page, 'admin-promocoes');
  await page.waitForSelector('#btnAddPromo');
  await page.click('#btnAddPromo');
  await page.waitForSelector('#pNome');
  await page.fill('#pNome', 'Promo Share Ativa');
  await page.selectOption('#pGrupo', { label: 'Grupo Share Promo' });
  const hojeStr = new Date().toISOString().slice(0,10);
  const amanhaStr = new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  await page.fill('#pInicio', hojeStr);
  await page.fill('#pFim', amanhaStr);
  await page.click('#pSave');
  await page.waitForTimeout(150);

  await abrirAba(page, 'catalogo'); // Catálogo
  await page.waitForSelector('#btnCompartilharCatalogo');
  await page.click('#btnCompartilharCatalogo');
  await page.waitForSelector('#shPreview');
  const previewComPromo = await page.inputValue('#shPreview');
  console.log('--- prévia com promoção ativa ---\n' + previewComPromo + '\n---');
  assert(previewComPromo.includes('Kits com desconto'), 'com promoção ativa hoje, a prévia deve incluir o aviso de kits com desconto');

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== ALGUM TESTE FALHOU ===' : '\n=== TODOS OS TESTES PASSARAM ===');
})();
