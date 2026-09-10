const { chromium } = require('playwright');
const path = require('path');
const { passarPeloGateVendedor, abrirAba } = require('./test_helpers');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('OK:', msg);
}

// Máscara automática e validação de telefone/e-mail, aplicadas nos 3 formulários que têm esses
// campos: cadastro de Cliente, cadastro de Vendedor, e o "novo cliente" dentro do Orçamento.
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'app', 'bancada-3d.html');
  await page.goto(fileUrl);
  await passarPeloGateVendedor(page, 'Vendedor Teste');
  await page.waitForSelector('#btnAbrirMenu');

  // ---------- Cliente: máscara + validação ----------
  await abrirAba(page, 'clientes'); // Clientes
  await page.waitForSelector('#fabNovoCliente');
  await page.click('#fabNovoCliente');
  await page.waitForSelector('#clTelefone');

  await page.fill('#clTelefone', '11991234567');
  let v = await page.$eval('#clTelefone', el => el.value);
  assert(v === '(11) 99123-4567', `celular (11 dígitos) deve ficar mascarado como (11) 99123-4567 — obtido: ${v}`);

  await page.fill('#clTelefone', '1133334444');
  v = await page.$eval('#clTelefone', el => el.value);
  assert(v === '(11) 3333-4444', `fixo (10 dígitos) deve ficar mascarado como (11) 3333-4444 — obtido: ${v}`);

  await page.fill('#clNome', 'Cliente Teste');
  await page.fill('#clTelefone', '11999'); // poucos dígitos -> inválido
  await page.fill('#clEmail', 'nao-e-email');
  await page.click('#clSave');
  await page.waitForTimeout(120);
  let invalidos = await page.$$eval('.ipt.invalid', els => els.map(e => e.id));
  assert(invalidos.includes('clTelefone'), `telefone incompleto deve marcar #clTelefone como inválido — obtido: ${invalidos.join(', ')}`);
  assert(invalidos.includes('clEmail'), `e-mail sem @ nem domínio deve marcar #clEmail como inválido — obtido: ${invalidos.join(', ')}`);
  assert(await page.$('#modalBackdrop') !== null, 'com campos inválidos, o modal não deve fechar');

  await page.fill('#clTelefone', '11991234567');
  await page.fill('#clEmail', 'cliente@teste.com');
  await page.click('#clSave');
  await page.waitForSelector('#modalBackdrop', { state: 'detached' });
  await page.waitForSelector('.item-card h3:has-text("Cliente Teste")');
  assert(true, 'com telefone e e-mail válidos, salva normalmente');

  // reabrir pra editar: o valor salvo (já mascarado, nesse caso) continua aparecendo mascarado
  const editBtn = await page.$('.item-card:has(h3:has-text("Cliente Teste")) [data-edit-cliente]');
  await editBtn.click();
  await page.waitForSelector('#clTelefone');
  v = await page.$eval('#clTelefone', el => el.value);
  assert(v === '(11) 99123-4567', `reabrir pra editar deve mostrar o telefone salvo, mascarado — obtido: ${v}`);
  await page.evaluate(() => { document.getElementById('modalBackdrop')?.remove(); });

  // ---------- Vendedor: máscara + validação ----------
  await abrirAba(page, 'admin-vendedores');
  await page.waitForSelector('#btnAddVendedor');
  await page.click('#btnAddVendedor');
  await page.waitForSelector('#vTelefone');

  await page.fill('#vTelefone', '21988887777');
  v = await page.$eval('#vTelefone', el => el.value);
  assert(v === '(21) 98888-7777', `telefone do vendedor deve ficar mascarado — obtido: ${v}`);

  await page.fill('#vNome', 'Vendedor Contato');
  await page.fill('#vEmail', 'vendedor-sem-arroba.com');
  await page.click('#vSave');
  await page.waitForTimeout(120);
  invalidos = await page.$$eval('.ipt.invalid', els => els.map(e => e.id));
  assert(invalidos.includes('vEmail'), `e-mail inválido do vendedor deve bloquear salvar — obtido: ${invalidos.join(', ')}`);

  await page.fill('#vEmail', 'vendedor@teste.com');
  await page.click('#vSave');
  await page.waitForSelector('#modalBackdrop', { state: 'detached' });
  await page.waitForSelector('.item-card h3:has-text("Vendedor Contato")');
  assert(true, 'vendedor com telefone e e-mail válidos salva normalmente');

  // ---------- Orçamento (novo cliente inline): máscara + validação ----------
  await abrirAba(page, 'orcamentos'); // Orçamentos
  await page.waitForSelector('#fabNovoOrc');
  await page.click('#fabNovoOrc');
  await page.waitForSelector('[data-cliente-modo="novo"]');
  await page.click('[data-cliente-modo="novo"]');
  await page.waitForSelector('#oClienteTelNovo');

  await page.fill('#oClienteTelNovo', '11955554444');
  v = await page.$eval('#oClienteTelNovo', el => el.value);
  assert(v === '(11) 95555-4444', `telefone do cliente novo no orçamento deve ficar mascarado — obtido: ${v}`);

  await page.fill('#oClienteNome', 'Cliente Do Orcamento');
  await page.fill('#oClienteEmailNovo', 'invalido-sem-ponto@dominio');
  await page.selectOption('#oProdSel', { label: 'TESTE' });
  await page.click('#oAddItem');
  await page.click('#oSalvar');
  await page.waitForTimeout(120);
  invalidos = await page.$$eval('#oClienteBox .ipt.invalid', els => els.map(e => e.id));
  assert(invalidos.includes('oClienteEmailNovo'), `e-mail inválido no orçamento deve bloquear salvar — obtido: ${invalidos.join(', ')}`);
  assert(await page.$('#modalBackdrop') !== null, 'orçamento não deve salvar com e-mail de cliente inválido');

  await page.fill('#oClienteEmailNovo', 'contato@dominio.com');
  await page.click('#oSalvar');
  await page.waitForSelector('#modalBackdrop', { state: 'detached' });
  await page.waitForSelector('.card h3:has-text("Cliente Do Orcamento")');
  assert(true, 'orçamento com e-mail/telefone de cliente válidos salva normalmente');

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== ALGUM TESTE FALHOU ===' : '\n=== TODOS OS TESTES PASSARAM ===');
})();
