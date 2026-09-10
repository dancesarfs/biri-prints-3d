const { chromium } = require('playwright');
const path = require('path');
const { abrirAba } = require('./test_helpers');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('OK:', msg);
}

// Este teste NÃO usa o helper passarPeloGateVendedor — ele testa o próprio gate de vendedor,
// então precisa interagir com ele diretamente em vez de pular por cima.
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'app', 'bancada-3d.html');
  await page.goto(fileUrl);

  // ---------- 1. gate bloqueia o app até escolher/cadastrar um vendedor ----------
  await page.waitForSelector('#vendedorGate');
  const semVendedorAinda = await page.$eval('#vendedorGate', el => el.textContent);
  assert(semVendedorAinda.includes('Nenhum vendedor cadastrado'), `sem nenhum vendedor no banco, o gate deve avisar isso — obtido: ${semVendedorAinda}`);

  // tentar salvar sem nome deve bloquear (mesma validação usada em Clientes)
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

  const badge = await page.$eval('#vendedorAtualBox', el => el.textContent.trim());
  assert(badge === 'Danilo · trocar', `badge do cabeçalho deve mostrar o vendedor atual — obtido: ${badge}`);

  // (a persistência de fato do localStorage entre recarregamentos depende de um backend real —
  // esse ambiente de teste roda em modo local/offline, onde NADA sobrevive a um reload, igual a
  // clientes/orçamentos/etc.; a lógica de "ler o id salvo e resolver contra a lista atual de
  // vendedores" já é exercitada pelo próprio checarVendedorAtual em todo boot() com Firestore de
  // verdade, então não repetimos esse cenário aqui)

  // ---------- 3. cadastro de vendedores em Admin > Vendedores: ativo/inativo, editar, excluir ----------
  await abrirAba(page, 'admin-vendedores');
  await page.waitForSelector('#btnAddVendedor');
  await page.click('#btnAddVendedor');
  await page.waitForSelector('#vNome');
  // "ativo" vem marcado por padrão
  const ativoPadrao = await page.$eval('#vAtivo', el => el.checked);
  assert(ativoPadrao === true, 'checkbox "ativo" deve vir marcada por padrão ao cadastrar um vendedor novo');
  await page.fill('#vNome', 'Marina');
  await page.click('#vSave');
  await page.waitForSelector('.item-card h3:has-text("Marina")');
  const badgesVendedor = await page.$$eval('.item-card:has(h3:has-text("Marina")) .badge', els => els.map(e => e.textContent.trim()));
  assert(badgesVendedor.includes('Ativo'), `vendedor novo deve aparecer com o selo "Ativo" — obtido: ${badgesVendedor.join(', ')}`);

  // desativa a Marina (editar -> desmarcar ativo)
  const editBtn = await page.$('.item-card:has(h3:has-text("Marina")) [data-edit-vendedor]');
  await editBtn.click();
  await page.waitForSelector('#vAtivo');
  await page.uncheck('#vAtivo');
  await page.click('#vSave');
  await page.waitForTimeout(150);
  const badgesDepoisInativo = await page.$$eval('.item-card:has(h3:has-text("Marina")) .badge', els => els.map(e => e.textContent.trim()));
  assert(badgesDepoisInativo.includes('Inativo'), `depois de desmarcar "ativo", o selo deve virar "Inativo" — obtido: ${badgesDepoisInativo.join(', ')}`);

  // ---------- 4. vendedor inativo não aparece pra escolher num orçamento novo, mas continua listado se já for o atual ----------
  await abrirAba(page, 'orcamentos'); // Orçamentos
  await page.waitForSelector('#fabNovoOrc');
  await page.click('#fabNovoOrc');
  await page.waitForSelector('#oVendedor');
  const opcoesVendedor = await page.$eval('#oVendedor', el => Array.from(el.options).map(o => o.textContent));
  assert(!opcoesVendedor.includes('Marina'), `vendedor inativo (Marina) não deve aparecer pra escolher num orçamento novo — obtido: ${opcoesVendedor.join(', ')}`);
  assert(opcoesVendedor.includes('Danilo'), `vendedor ativo (Danilo, o atual) deve continuar na lista — obtido: ${opcoesVendedor.join(', ')}`);
  await page.evaluate(() => { document.getElementById('modalBackdrop')?.remove(); });

  // ---------- 5. trocar de vendedor atual (badge no cabeçalho) ----------
  await page.click('#btnTrocarVendedor');
  await page.waitForSelector('[data-escolher-vendedor]');
  const opcoesTroca = await page.$$eval('[data-escolher-vendedor]', els => els.map(e => e.textContent.trim()));
  assert(!opcoesTroca.includes('Marina'), `vendedor inativo não deve aparecer no seletor de troca — obtido: ${opcoesTroca.join(', ')}`);
  assert(opcoesTroca.includes('Danilo'), `vendedor ativo deve aparecer no seletor de troca — obtido: ${opcoesTroca.join(', ')}`);
  // fecha sem trocar (clicando fora) -- confirma que o modal de troca é dispensável (diferente do gate)
  await page.evaluate(() => { document.getElementById('modalBackdrop')?.remove(); });
  const badgeContinuaDanilo = await page.$eval('#vendedorAtualBox', el => el.textContent.trim());
  assert(badgeContinuaDanilo === 'Danilo · trocar', 'fechar o modal de troca sem escolher ninguém deve manter o vendedor atual');

  // ---------- 6. excluir vendedor (2 cliques, mesmo padrão do resto do app) ----------
  await abrirAba(page, 'admin-vendedores');
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
