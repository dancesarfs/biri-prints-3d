const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { abrirAbaStandalone } = require('./test_helpers_standalone');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('OK:', msg);
}

const FAKE_FIREBASE_JS = fs.readFileSync(path.resolve(__dirname, 'fake_firebase.js'), 'utf8');

// Vendedores na standalone: cadastro (ativo/inativo), gate de "vendedor atual" (bloqueia o app
// além do login do Firebase, que só identifica QUEM pode acessar, não QUEM está cadastrando),
// badge/troca no cabeçalho, exclusão. Este teste NÃO usa nenhum helper de "pular o gate" — ele
// testa o próprio gate diretamente.
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

  // ---------- 1. gate bloqueia o app (além do login) até escolher/cadastrar um vendedor ----------
  await page.waitForSelector('#vendedorGate');
  const semVendedorAinda = await page.$eval('#vendedorGate', el => el.textContent);
  assert(semVendedorAinda.includes('Nenhum vendedor cadastrado'), `sem nenhum vendedor no banco, o gate deve avisar isso — obtido: ${semVendedorAinda}`);

  await page.click('#btnNovoVendedorGate');
  await page.waitForSelector('#vNome');
  await page.click('#vSave');
  await page.waitForTimeout(80);
  let invalidos = await page.$$eval('.ipt.invalid', els => els.map(e => e.id));
  assert(invalidos.includes('vNome'), `salvar vendedor sem nome deve marcar #vNome como inválido — obtido: ${invalidos.join(', ')}`);

  await page.fill('#vNome', 'Danilo');
  await page.click('#vSave');
  await page.waitForSelector('#vendedorGate', { state: 'detached' });
  assert(true, 'gate some depois de cadastrar e escolher o primeiro vendedor');

  // A badge só reflete o nome depois que o onSnapshot de "vendedores" atualiza state.vendedores
  // (um ciclo depois de escolher, já que o registro acabou de ser criado) — espera o texto certo
  // em vez de ler uma vez só.
  await page.waitForFunction(() => document.getElementById('vendedorAtualBox')?.textContent.trim() === 'Danilo · trocar');
  const badge = await page.$eval('#vendedorAtualBox', el => el.textContent.trim());
  assert(badge === 'Danilo · trocar', `badge do cabeçalho deve mostrar o vendedor atual — obtido: ${badge}`);

  // ---------- 2. cadastro em Admin > Vendedores: ativo por padrão, badge Ativo/Inativo, editar ----------
  await abrirAbaStandalone(page, 'admin-vendedores');
  await page.waitForSelector('#btnAddVendedor');
  await page.click('#btnAddVendedor');
  await page.waitForSelector('#vNome');
  const ativoPadrao = await page.$eval('#vAtivo', el => el.checked);
  assert(ativoPadrao === true, 'checkbox "ativo" deve vir marcada por padrão ao cadastrar um vendedor novo');
  await page.fill('#vNome', 'Marina');
  await page.click('#vSave');
  await page.waitForSelector('.item-card h3:has-text("Marina")');
  const badgesVendedor = await page.$$eval('.item-card:has(h3:has-text("Marina")) .badge', els => els.map(e => e.textContent.trim()));
  assert(badgesVendedor.includes('Ativo'), `vendedor novo deve aparecer com o selo "Ativo" — obtido: ${badgesVendedor.join(', ')}`);

  const editBtn = await page.$('.item-card:has(h3:has-text("Marina")) [data-edit-vendedor]');
  await editBtn.click();
  await page.waitForSelector('#vAtivo');
  await page.uncheck('#vAtivo');
  await page.click('#vSave');
  await page.waitForTimeout(150);
  const badgesDepoisInativo = await page.$$eval('.item-card:has(h3:has-text("Marina")) .badge', els => els.map(e => e.textContent.trim()));
  assert(badgesDepoisInativo.includes('Inativo'), `depois de desmarcar "ativo", o selo deve virar "Inativo" — obtido: ${badgesDepoisInativo.join(', ')}`);

  // ---------- 3. vendedor inativo não aparece pra escolher num orçamento novo, mas o atual continua ----------
  await abrirAbaStandalone(page, 'orcamentos');
  await page.waitForSelector('#fabNovoOrc');
  await page.click('#fabNovoOrc');
  await page.waitForSelector('#oVendedor');
  const opcoesVendedor = await page.$eval('#oVendedor', el => Array.from(el.options).map(o => o.textContent));
  assert(!opcoesVendedor.includes('Marina'), `vendedor inativo (Marina) não deve aparecer pra escolher num orçamento novo — obtido: ${opcoesVendedor.join(', ')}`);
  assert(opcoesVendedor.includes('Danilo'), `vendedor ativo (Danilo, o atual) deve continuar na lista — obtido: ${opcoesVendedor.join(', ')}`);
  await page.evaluate(() => { document.getElementById('modalBackdrop')?.remove(); });

  // ---------- 3b. já no filtro por vendedor (Orçamentos/Pedidos), vendedor inativo CONTINUA
  // aparecendo — esse filtro serve pra achar histórico, não só pra escolher alguém pra uma venda
  // nova (diferente do seletor #oVendedor testado acima).
  await abrirAbaStandalone(page, 'orcamentos');
  await page.waitForSelector('#filtroOrcVendedor');
  const opcoesFiltroOrc = await page.$eval('#filtroOrcVendedor', el => Array.from(el.options).map(o => o.textContent));
  assert(opcoesFiltroOrc.some(t => t.includes('Marina')), `filtro de vendedor em Orçamentos deve continuar listando vendedor inativo (Marina) — obtido: ${opcoesFiltroOrc.join(', ')}`);

  await abrirAbaStandalone(page, 'pedidos');
  await page.waitForSelector('#filtroPedVendedor');
  const opcoesFiltroPed = await page.$eval('#filtroPedVendedor', el => Array.from(el.options).map(o => o.textContent));
  assert(opcoesFiltroPed.some(t => t.includes('Marina')), `filtro de vendedor em Pedidos deve continuar listando vendedor inativo (Marina) — obtido: ${opcoesFiltroPed.join(', ')}`);

  // ---------- 4. trocar de vendedor atual (badge no cabeçalho) ----------
  await page.click('#btnTrocarVendedor');
  await page.waitForSelector('[data-escolher-vendedor]');
  const opcoesTroca = await page.$$eval('[data-escolher-vendedor]', els => els.map(e => e.textContent.trim()));
  assert(!opcoesTroca.includes('Marina'), `vendedor inativo não deve aparecer no seletor de troca — obtido: ${opcoesTroca.join(', ')}`);
  assert(opcoesTroca.includes('Danilo'), `vendedor ativo deve aparecer no seletor de troca — obtido: ${opcoesTroca.join(', ')}`);
  await page.evaluate(() => { document.getElementById('modalBackdrop')?.remove(); });
  const badgeContinuaDanilo = await page.$eval('#vendedorAtualBox', el => el.textContent.trim());
  assert(badgeContinuaDanilo === 'Danilo · trocar', 'fechar o modal de troca sem escolher ninguém deve manter o vendedor atual');

  // ---------- 5. excluir vendedor (2 cliques) ----------
  await abrirAbaStandalone(page, 'admin-vendedores');
  await page.waitForSelector('#vendedorList');
  const totalAntes = (await page.$$('#vendedorList .item-card')).length;
  const delBtn = await page.$('.item-card:has(h3:has-text("Marina")) [data-del-vendedor]');
  await delBtn.click();
  await page.waitForTimeout(150);
  const delBtnConfirma = await page.$('.item-card:has(h3:has-text("Marina")) [data-del-vendedor]');
  if (delBtnConfirma) await delBtnConfirma.click();
  await page.waitForTimeout(150);
  const totalDepois = (await page.$$('#vendedorList .item-card')).length;
  assert(totalDepois === totalAntes - 1, `excluir vendedor deve reduzir a lista em 1 — antes: ${totalAntes}, depois: ${totalDepois}`);

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== ALGUM TESTE FALHOU ===' : '\n=== TODOS OS TESTES PASSARAM ===');
})();
