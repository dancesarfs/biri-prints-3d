const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { loginStandalone, passarPeloGateVendedorStandalone, abrirAbaStandalone } = require('./test_helpers_standalone');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('OK:', msg);
}

const FAKE_FIREBASE_JS = fs.readFileSync(path.resolve(__dirname, 'fake_firebase.js'), 'utf8');

// Integração Clientes<->Orçamento na standalone: buscar/selecionar um cliente já cadastrado, ou
// cadastrar um novo direto na tela de orçamento (fica salvo de verdade em Clientes, não só como
// texto solto) — mesmo comportamento da versão principal (test_clientes.js, seções 4-6).
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page.addInitScript(FAKE_FIREBASE_JS);
  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'app', 'biri-prints-3d-standalone.html');
  await page.goto(fileUrl);
  await loginStandalone(page);
  await passarPeloGateVendedorStandalone(page);

  // ---------- setup: cadastra um cliente direto na aba Clientes ----------
  await abrirAbaStandalone(page, 'clientes');
  await page.waitForSelector('#fabNovoCliente');
  await page.click('#fabNovoCliente');
  await page.waitForSelector('#clNome');
  await page.fill('#clNome', 'João Pereira');
  await page.click('#clSave');
  await page.waitForSelector('.item-card h3:has-text("João Pereira")');

  // ---------- 1. no orçamento, modo "Cliente existente": buscar e selecionar ----------
  await abrirAbaStandalone(page, 'orcamentos');
  await page.waitForSelector('#fabNovoOrc');
  await page.click('#fabNovoOrc');
  await page.waitForSelector('[data-cliente-modo="buscar"]');
  // já deve abrir em modo "buscar" por padrão pra um orçamento novo
  const modoBuscarAtivo = await page.$eval('[data-cliente-modo="buscar"]', el => el.className.includes('btn-primary'));
  assert(modoBuscarAtivo, 'orçamento novo deve abrir com "Cliente existente" já selecionado por padrão');
  await page.waitForSelector('#oClienteBusca');
  await page.fill('#oClienteBusca', 'João');
  await page.waitForSelector('[data-cliente-sel]');
  await page.click('[data-cliente-sel]');
  await page.waitForSelector('#oClienteTrocar');
  const nomeSelecionado = await page.$eval('#oClienteBox h3', el => el.textContent);
  assert(nomeSelecionado.includes('João'), `cliente selecionado deve aparecer no card — obtido: ${nomeSelecionado}`);

  await page.fill('#oAvulsoNome', 'Item Teste');
  await page.fill('#oAvulsoPreco', '25');
  await page.click('#oAddItem');
  await page.click('#oSalvar');
  await page.waitForSelector('.card h3:has-text("João Pereira")');

  // ---------- 2. no orçamento, modo "Novo cliente": cadastra e vincula ao mesmo tempo ----------
  await page.click('#fabNovoOrc');
  await page.waitForSelector('[data-cliente-modo="novo"]');
  await page.click('[data-cliente-modo="novo"]');
  await page.waitForSelector('#oClienteNome');
  await page.fill('#oClienteNome', 'Cliente Novo Do Orçamento');
  await page.fill('#oClienteTelNovo', '(11) 90000-1111');
  await page.fill('#oAvulsoNome', 'Item Teste 2');
  await page.fill('#oAvulsoPreco', '30');
  await page.click('#oAddItem');
  await page.click('#oSalvar');
  await page.waitForSelector('.card h3:has-text("Cliente Novo Do Orçamento")');
  // confirma que esse cliente realmente foi parar no cadastro (não só como texto solto)
  await abrirAbaStandalone(page, 'clientes');
  await page.waitForSelector('.item-card h3:has-text("Cliente Novo Do Orçamento")');

  // ---------- 3. abrir esse mesmo orçamento pra edição -> já deve vir com o cliente selecionado ----------
  await abrirAbaStandalone(page, 'orcamentos');
  await page.waitForSelector('.card h3:has-text("Cliente Novo Do Orçamento")');
  const orcId = await page.evaluate(() => state.orcamentos.find(o => o.cliente === 'Cliente Novo Do Orçamento').id);
  await page.evaluate((id) => openOrcamentoBuilder(id, null), orcId);
  await page.waitForSelector('#oClienteTrocar');
  const modoAoEditar = await page.$eval('[data-cliente-modo="buscar"]', el => el.className.includes('btn-primary'));
  assert(modoAoEditar, 'reabrindo um orçamento com cliente vinculado, deve entrar direto em "Cliente existente"');
  const nomeAoEditar = await page.$eval('#oClienteBox h3', el => el.textContent);
  assert(nomeAoEditar.includes('Cliente Novo Do Orçamento'), `deve mostrar o cliente já vinculado, sem precisar buscar de novo — obtido: ${nomeAoEditar}`);
  await page.evaluate(() => { const el = document.getElementById('modalBackdrop'); if (el) el.remove(); });

  // ---------- 4. trocar de cliente selecionado ----------
  await page.click('#fabNovoOrc');
  await page.waitForSelector('#oClienteBusca');
  await page.fill('#oClienteBusca', 'João');
  await page.waitForSelector('[data-cliente-sel]');
  await page.click('[data-cliente-sel]');
  await page.waitForSelector('#oClienteTrocar');
  await page.click('#oClienteTrocar');
  await page.waitForSelector('#oClienteBusca');
  assert(true, '"Trocar" deve voltar pra busca sem cliente selecionado');
  await page.evaluate(() => { const el = document.getElementById('modalBackdrop'); if (el) el.remove(); });

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== ALGUM TESTE FALHOU ===' : '\n=== TODOS OS TESTES PASSARAM ===');
})();
