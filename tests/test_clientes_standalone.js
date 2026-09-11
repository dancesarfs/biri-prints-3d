const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { passarPeloGateVendedorStandalone } = require('./test_helpers_standalone');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('OK:', msg);
}

const FAKE_FIREBASE_JS = fs.readFileSync(path.resolve(__dirname, 'fake_firebase.js'), 'utf8');

// Cadastro de Clientes na standalone (listar/buscar/cadastrar/editar/excluir), com a mesma
// máscara e validação de telefone/e-mail já usadas na versão principal. A integração com a tela
// de Orçamentos (buscar/vincular cliente existente) fica pra uma etapa própria, mais adiante.
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const context = page.context();
  await context.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page.addInitScript(FAKE_FIREBASE_JS);

  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'app', 'biri-prints-3d-standalone.html');
  await page.goto(fileUrl);
  await page.waitForSelector('#loginScreen');
  await page.fill('#loginEmail', 'dono@teste.com');
  await page.fill('#loginSenha', 'senha123');
  await page.click('#loginBtn');
  await page.waitForSelector('#tabsBottom button');
  await passarPeloGateVendedorStandalone(page);

  // ---------- 1. aba Clientes: começa vazia ----------
  await page.click('#tabsBottom button:has-text("Clientes")');
  await page.waitForSelector('#fabNovoCliente');
  const vazio = await page.$('.empty h3');
  assert(vazio && (await vazio.textContent()).includes('Nenhum cliente'), 'lista de clientes deve começar vazia');

  // ---------- 2. validação: nome obrigatório, aceite sem contato bloqueia ----------
  await page.click('#fabNovoCliente');
  await page.waitForSelector('#clNome');
  await page.click('#clSave');
  await page.waitForTimeout(80);
  let invalidos = await page.$$eval('.ipt.invalid', els => els.map(e => e.id));
  assert(invalidos.includes('clNome'), `salvar cliente sem nome deve marcar #clNome como inválido — obtido: ${invalidos.join(', ')}`);

  await page.fill('#clNome', 'Maria da Silva');
  await page.check('#clAceitaEmail');
  await page.click('#clSave');
  await page.waitForTimeout(80);
  invalidos = await page.$$eval('.ipt.invalid', els => els.map(e => e.id));
  assert(invalidos.includes('clEmail'), `marcar "aceita e-mail" sem preencher e-mail deve marcar #clEmail como inválido — obtido: ${invalidos.join(', ')}`);

  // ---------- 3. máscara automática de telefone ----------
  await page.fill('#clTelefone', '11991234567');
  let v = await page.$eval('#clTelefone', el => el.value);
  assert(v === '(11) 99123-4567', `celular (11 dígitos) deve ficar mascarado como (11) 99123-4567 — obtido: ${v}`);
  await page.fill('#clTelefone', '1133334444');
  v = await page.$eval('#clTelefone', el => el.value);
  assert(v === '(11) 3333-4444', `fixo (10 dígitos) deve ficar mascarado como (11) 3333-4444 — obtido: ${v}`);

  // ---------- 4. validação de formato: telefone incompleto e e-mail sem @ bloqueiam salvar ----------
  await page.fill('#clTelefone', '11999');
  await page.fill('#clEmail', 'nao-e-email');
  await page.click('#clSave');
  await page.waitForTimeout(120);
  invalidos = await page.$$eval('.ipt.invalid', els => els.map(e => e.id));
  assert(invalidos.includes('clTelefone'), `telefone incompleto deve marcar #clTelefone como inválido — obtido: ${invalidos.join(', ')}`);
  assert(invalidos.includes('clEmail'), `e-mail sem @ nem domínio deve marcar #clEmail como inválido — obtido: ${invalidos.join(', ')}`);
  assert(await page.$('#modalBackdrop') !== null, 'com campos inválidos, o modal não deve fechar');

  // ---------- 5. preenchendo tudo certinho, salva (e mostra os selos de aceite) ----------
  await page.fill('#clTelefone', '11991234567');
  await page.fill('#clEmail', 'maria@example.com');
  await page.check('#clAceitaWhatsapp');
  await page.click('#clSave');
  await page.waitForSelector('.item-card h3:has-text("Maria da Silva")');
  const badges = await page.$$eval('.item-card .badge', els => els.map(e => e.textContent));
  assert(badges.some(b => b.includes('e-mail')) && badges.some(b => b.includes('WhatsApp')), `card do cliente deve mostrar os dois selos de aceite — obtido: ${badges.join(', ')}`);

  // confere que foi gravado de fato no Firestore (mock), não só na tela
  const store = await page.evaluate(() => JSON.parse(JSON.stringify(window.__fakeDb.store)));
  const clientesNoStore = Object.values(store.clientes || {});
  assert(clientesNoStore.some(c => c.nome === 'Maria da Silva' && c.telefone === '(11) 99123-4567'), 'cliente deve ter sido gravado no Firestore (mock), com o telefone já mascarado');

  // ---------- 6. busca por nome ----------
  await page.click('#fabNovoCliente');
  await page.waitForSelector('#clNome');
  await page.fill('#clNome', 'João Pereira');
  await page.click('#clSave');
  await page.waitForSelector('.item-card h3:has-text("João Pereira")');
  await page.fill('#clienteBusca', 'maria');
  await page.waitForTimeout(80);
  let nomesVisiveis = await page.$$eval('.item-card h3', els => els.map(e => e.textContent));
  assert(nomesVisiveis.length === 1 && nomesVisiveis[0].includes('Maria'), `busca por "maria" deve mostrar só a Maria — obtido: ${nomesVisiveis.join(', ')}`);
  await page.fill('#clienteBusca', '');
  await page.waitForTimeout(80);
  nomesVisiveis = await page.$$eval('.item-card h3', els => els.map(e => e.textContent));
  assert(nomesVisiveis.length === 2, `busca vazia deve mostrar os 2 clientes — obtido: ${nomesVisiveis.length}`);

  // ---------- 7. reabrir pra editar: telefone salvo continua mascarado ----------
  const editBtn = await page.$('.item-card:has(h3:has-text("Maria da Silva")) [data-edit-cliente]');
  await editBtn.click();
  await page.waitForSelector('#clTelefone');
  v = await page.$eval('#clTelefone', el => el.value);
  assert(v === '(11) 99123-4567', `reabrir pra editar deve mostrar o telefone salvo, mascarado — obtido: ${v}`);
  const nomeAtual = await page.$eval('#clNome', el => el.value);
  await page.fill('#clNome', nomeAtual + ' (editado)');
  await page.click('#clSave');
  await page.waitForSelector('.item-card h3:has-text("(editado)")');

  // ---------- 8. excluir cliente (confirmação de 2 cliques) ----------
  const totalAntes = (await page.$$('.item-card')).length;
  const delBtn = await page.$('[data-del-cliente]');
  await delBtn.click();
  await page.waitForTimeout(150);
  const delBtnConfirma = await page.$('[data-del-cliente]');
  if (delBtnConfirma) await delBtnConfirma.click();
  await page.waitForTimeout(150);
  const totalDepois = (await page.$$('.item-card')).length;
  assert(totalDepois === totalAntes - 1, `excluir cliente deve reduzir a lista em 1 — antes: ${totalAntes}, depois: ${totalDepois}`);

  // ---------- 9. a aba Ajustes (e o resto do app) continua acessível com a aba nova no meio ----------
  await page.click('#tabsBottom button:has-text("Ajustes")');
  await page.waitForSelector('#importarBackupInput');
  assert(true, 'aba Ajustes continua alcançável depois de inserir Clientes na barra de abas');

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== ALGUM TESTE FALHOU ===' : '\n=== TODOS OS TESTES PASSARAM ===');
})();
