const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { passarPeloGateVendedorStandalone, abrirAbaStandalone, abrirNovoProdutoModalStandalone } = require('./test_helpers_standalone');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('OK:', msg);
}

const FAKE_FIREBASE_JS = fs.readFileSync(path.resolve(__dirname, 'fake_firebase.js'), 'utf8');

// Desconto manual (negociado) no orçamento: percentual editável, mutuamente exclusivo com
// desconto de kit (kit sempre tem prioridade — zera o manual e avisa por toast se ficar ativo
// enquanto havia um manual em uso), nunca herdado por "Copiar orçamento", e travado depois que o
// orçamento vira pedido (o modal de edição já bloqueia esse cenário pra todo o orçamento).
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page.addInitScript(FAKE_FIREBASE_JS);
  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'app', 'biri-prints-3d-standalone.html');
  await page.goto(fileUrl);
  await page.waitForSelector('#loginScreen');
  await page.fill('#loginEmail', 'dono@teste.com');
  await page.fill('#loginSenha', 'senha123');
  await page.click('#loginBtn');
  await page.waitForSelector('#sidebarNav [data-nav]');
  await passarPeloGateVendedorStandalone(page, 'Vendedor Teste');

  // ---------- 1. aplicar desconto manual isolado -> total recalcula em tempo real ----------
  await abrirAbaStandalone(page, 'orcamentos');
  await page.click('#fabNovoOrc');
  await page.waitForSelector('[data-cliente-modo="novo"]');
  await page.click('[data-cliente-modo="novo"]');
  await page.waitForSelector('#oClienteNome');
  await page.fill('#oClienteNome', 'Cliente Desconto Manual');
  await page.fill('#oAvulsoNome', 'Item A');
  await page.fill('#oAvulsoPreco', '100');
  await page.click('#oAddItem');
  await page.waitForSelector('#oTotal');
  const totalAntes = await page.$eval('#oTotal', el => el.textContent);
  assert(totalAntes.includes('100,00'), `total sem desconto deve ser R$ 100,00 — obtido: ${totalAntes}`);

  await page.fill('#oDescontoManual', '10');
  await page.waitForTimeout(80);
  const totalDepois = await page.$eval('#oTotal', el => el.textContent);
  assert(totalDepois.includes('90,00'), `desconto manual de 10% sobre R$ 100 deve deixar o total em R$ 90,00 — obtido: ${totalDepois}`);
  const linhaManual = await page.$eval('#oDescontoManualLinha', el => el.textContent);
  assert(linhaManual.includes('10%') && linhaManual.includes('10,00'), `linha de desconto negociado deve mostrar o percentual e o valor — obtido: ${linhaManual}`);

  await page.click('#oSalvar');
  await page.waitForSelector('.card h3:has-text("Cliente Desconto Manual")');
  await page.click('[data-toggle-orc]');
  await page.waitForSelector('.card.expanded');
  const textoCardExpandido = await page.$eval('.card.expanded', el => el.textContent.replace(/\s+/g,' '));
  assert(textoCardExpandido.includes('Subtotal') && textoCardExpandido.includes('Desconto negociado (10%)'), `card salvo deve mostrar Subtotal + linha "Desconto negociado (10%)" — obtido: ${textoCardExpandido}`);

  // ---------- 2. copiar resumo / enviar por whatsapp usam o mesmo texto com a linha do desconto ----------
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.click('[data-copy]');
  await page.waitForTimeout(150);
  const clip = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\s+/g, ' ');
  assert(clip.includes('Desconto negociado (10%): − R$ 10,00'), `"Copiar resumo" deve incluir a linha de desconto negociado — obtido: ${clip}`);

  // ---------- 3. "Copiar orçamento" NUNCA herda o desconto manual (nasce zerado) ----------
  await page.click('[data-copiar-orc]');
  await page.waitForSelector('#oDescontoManual');
  const pctNaCopia = await page.$eval('#oDescontoManual', el => el.value);
  assert(pctNaCopia === '0', `"Copiar orçamento" não deve herdar o desconto manual — obtido: ${pctNaCopia}`);
  await page.evaluate(() => { document.getElementById('modalBackdrop')?.remove(); });

  // ---------- setup pra desconto de kit: material + impressora + 2 produtos + grupo + promoção ----------
  await abrirAbaStandalone(page, 'admin-materiais');
  await page.click('#btnAddMat');
  await page.waitForSelector('#mNome');
  await page.fill('#mNome', 'PLA Kit');
  await page.fill('#mPreco', '100');
  await page.click('#mSave');
  await page.waitForTimeout(100);

  await abrirAbaStandalone(page, 'admin-impressoras');
  await page.click('#btnAddImp');
  await page.waitForSelector('#iNome');
  await page.fill('#iNome', 'Impressora Kit');
  await page.fill('#iPreco', '3000');
  await page.fill('#iPotencia', '0.1');
  await page.fill('#iVidaUtil', '2000');
  await page.click('#iSave');
  await page.waitForTimeout(100);

  for (const nome of ['Peça Kit X', 'Peça Kit Y']) {
    await abrirNovoProdutoModalStandalone(page);
    await page.fill('#cNome', nome);
    await page.selectOption('#cMaterial', { index: 0 });
    await page.selectOption('#cImpressora', { index: 0 });
    await page.fill('#cGram', '10');
    await page.fill('#cTempoH', '0');
    await page.fill('#cTempoM', '30');
    await page.click('#btnSalvarCatalogo');
    await page.waitForSelector(`.item-card h3:has-text("${nome}")`);
  }

  await abrirAbaStandalone(page, 'admin-grupos');
  await page.click('#btnAddGrupo');
  await page.waitForSelector('#gNome');
  await page.fill('#gNome', 'Grupo Desconto Manual');
  const prodCheckboxes = await page.$$('.grupo-prod-chk');
  for (const c of prodCheckboxes) await c.click();
  await page.click('#gSave');
  await page.waitForTimeout(100);

  await abrirAbaStandalone(page, 'admin-promocoes');
  await page.click('#btnAddPromo');
  await page.waitForSelector('#pNome');
  await page.fill('#pNome', 'Promo Desconto Manual');
  await page.selectOption('#pGrupo', { label: 'Grupo Desconto Manual' });
  await page.fill('#pInicio', '2020-01-01');
  await page.fill('#pFim', '2030-01-01');
  await page.click('#pSave');
  await page.waitForTimeout(150);

  // ---------- 4. desconto manual + kit já ativo -> campo vem desabilitado desde o início ----------
  await abrirAbaStandalone(page, 'orcamentos');
  await page.click('#fabNovoOrc');
  await page.waitForSelector('[data-add-kit]');
  await page.click('[data-add-kit]');
  await page.waitForTimeout(100);
  let descDisabled = await page.$eval('#oDescontoManual', el => el.disabled);
  assert(descDisabled === true, 'com desconto de kit ativo, o campo de desconto negociado deve vir desabilitado');
  const msgDesabilitado = await page.$eval('#oDescontoManualMsg', el => el.textContent);
  assert(msgDesabilitado.length > 0, `deve mostrar uma mensagem explicando por que está desabilitado — obtido: "${msgDesabilitado}"`);
  await page.evaluate(() => { document.getElementById('modalBackdrop')?.remove(); });

  // ---------- 5. aplicar manual e DEPOIS ativar kit -> manual zera, kit assume, toast avisa ----------
  await page.click('#fabNovoOrc');
  await page.waitForSelector('#oDescontoManual');
  await page.fill('#oDescontoManual', '25');
  await page.waitForTimeout(80);
  let pctAntesDoKit = await page.$eval('#oDescontoManual', el => el.value);
  assert(pctAntesDoKit === '25', `desconto manual de 25% deve ficar aplicado antes do kit entrar — obtido: ${pctAntesDoKit}`);

  await page.waitForSelector('[data-add-kit]');
  await page.click('[data-add-kit]');
  await page.waitForTimeout(100);
  const toastTexto = await page.textContent('body');
  assert(toastTexto.includes('zerado') || toastTexto.includes('Desconto de kit ativado'), `deve avisar por toast que o desconto manual foi zerado — obtido algo com "zerado"? ${toastTexto.includes('zerado')}`);
  const pctDepoisDoKit = await page.$eval('#oDescontoManual', el => el.value);
  assert(pctDepoisDoKit === '0', `depois do kit assumir, o desconto manual deve estar zerado — obtido: ${pctDepoisDoKit}`);
  const descDisabledDepois = await page.$eval('#oDescontoManual', el => el.disabled);
  assert(descDisabledDepois === true, 'depois do kit assumir, o campo deve continuar (ou passar a ficar) desabilitado');
  await page.evaluate(() => { document.getElementById('modalBackdrop')?.remove(); });

  // ---------- 6. depois de converter em pedido, o orçamento (e o desconto negociado) trava ----------
  await abrirAbaStandalone(page, 'orcamentos');
  await page.click('#fabNovoOrc');
  await page.waitForSelector('[data-cliente-modo="novo"]');
  await page.click('[data-cliente-modo="novo"]');
  await page.waitForSelector('#oClienteNome');
  await page.fill('#oClienteNome', 'Cliente Trava Desconto');
  await page.fill('#oAvulsoNome', 'Item Trava');
  await page.fill('#oAvulsoPreco', '50');
  await page.click('#oAddItem');
  await page.fill('#oDescontoManual', '15');
  await page.waitForTimeout(80);
  await page.click('#oSalvar');
  await page.waitForSelector('.card h3:has-text("Cliente Trava Desconto")');
  await page.click('[data-toggle-orc]');
  await page.waitForSelector('[data-converter-pedido]');
  await page.click('[data-converter-pedido]');
  await page.waitForTimeout(80);
  await page.click('[data-converter-pedido]');
  await page.waitForTimeout(150);

  const orcId = await page.evaluate(() => state.orcamentos.find(o => o.cliente === 'Cliente Trava Desconto').id);
  await page.evaluate((id) => openOrcamentoBuilder(id, null), orcId);
  await page.waitForTimeout(100);
  assert((await page.$('#modalBackdrop')) === null, 'depois de virar pedido, não deve mais ser possível abrir o editor (o desconto negociado, junto com o resto do orçamento, fica travado)');

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== ALGUM TESTE FALHOU ===' : '\n=== TODOS OS TESTES PASSARAM ===');
})();
