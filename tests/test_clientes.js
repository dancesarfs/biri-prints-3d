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

  // ---------- 1. aba Clientes: cadastro exclusivo ----------
  await abrirAba(page, 'clientes'); // Clientes (última aba)
  await page.waitForSelector('#fabNovoCliente');
  const vazio = await page.$('.empty h3');
  assert(vazio && (await vazio.textContent()).includes('Nenhum cliente'), 'lista de clientes deve começar vazia');

  await page.click('#fabNovoCliente');
  await page.waitForSelector('#clNome');
  // tenta salvar sem nome -> deve marcar erro
  await page.click('#clSave');
  await page.waitForTimeout(80);
  let invalidos = await page.$$eval('.ipt.invalid', els => els.map(e => e.id));
  assert(invalidos.includes('clNome'), `salvar cliente sem nome deve marcar #clNome como inválido — obtido: ${invalidos.join(', ')}`);

  // marca "aceita novidades por e-mail" sem preencher e-mail -> deve bloquear também
  await page.fill('#clNome', 'Maria da Silva');
  await page.check('#clAceitaEmail');
  await page.click('#clSave');
  await page.waitForTimeout(80);
  invalidos = await page.$$eval('.ipt.invalid', els => els.map(e => e.id));
  assert(invalidos.includes('clEmail'), `marcar "aceita e-mail" sem preencher e-mail deve marcar #clEmail como inválido — obtido: ${invalidos.join(', ')}`);

  // preenche tudo certinho e salva
  await page.fill('#clEmail', 'maria@example.com');
  await page.fill('#clTelefone', '(11) 91234-5678');
  await page.check('#clAceitaWhatsapp');
  await page.click('#clSave');
  await page.waitForSelector('.item-card h3:has-text("Maria da Silva")');
  const badges = await page.$$eval('.item-card .badge', els => els.map(e => e.textContent));
  assert(badges.some(b => b.includes('e-mail')) && badges.some(b => b.includes('WhatsApp')), `card do cliente deve mostrar os dois selos de aceite — obtido: ${badges.join(', ')}`);

  // ---------- 2. busca por nome ----------
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

  // ---------- 3. editar e excluir cliente ----------
  const editBtn = await page.$('[data-edit-cliente]');
  await editBtn.click();
  await page.waitForSelector('#clNome');
  const nomeAtual = await page.$eval('#clNome', el => el.value);
  await page.fill('#clNome', nomeAtual + ' (editado)');
  await page.click('#clSave');
  await page.waitForSelector(`.item-card h3:has-text("(editado)")`);

  const totalAntes = (await page.$$('.item-card')).length;
  const delBtn = await page.$('[data-del-cliente]');
  await delBtn.click();
  await page.waitForTimeout(150); // confirmThenDelete tem um passo de confirmação
  // clica de novo pra confirmar (padrão usado no resto do app)
  const delBtnConfirma = await page.$('[data-del-cliente]');
  if (delBtnConfirma) await delBtnConfirma.click();
  await page.waitForTimeout(150);
  const totalDepois = (await page.$$('.item-card')).length;
  assert(totalDepois === totalAntes - 1, `excluir cliente deve reduzir a lista em 1 — antes: ${totalAntes}, depois: ${totalDepois}`);

  // ---------- 4. no orçamento, modo "Cliente existente": buscar e selecionar ----------
  await abrirAba(page, 'orcamentos'); // Orçamentos
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

  await page.selectOption('#oProdSel', { label: 'TESTE' });
  await page.click('#oAddItem');
  await page.click('#oSalvar');
  await page.waitForSelector('.card h3:has-text("João Pereira")');

  // ---------- 5. no orçamento, modo "Novo cliente": cadastra e vincula ao mesmo tempo ----------
  await page.click('#fabNovoOrc');
  await page.waitForSelector('[data-cliente-modo="novo"]');
  await page.click('[data-cliente-modo="novo"]');
  await page.waitForSelector('#oClienteNome');
  await page.fill('#oClienteNome', 'Cliente Novo Do Orçamento');
  await page.fill('#oClienteTelNovo', '(11) 90000-1111');
  await page.selectOption('#oProdSel', { label: 'TESTE' });
  await page.click('#oAddItem');
  await page.click('#oSalvar');
  await page.waitForSelector('.card h3:has-text("Cliente Novo Do Orçamento")');
  // confirma que esse cliente realmente foi parar no cadastro (não só como texto solto)
  await abrirAba(page, 'clientes'); // Clientes
  await page.waitForSelector('.item-card h3:has-text("Cliente Novo Do Orçamento")');

  // ---------- 6. abrir esse mesmo orçamento pra edição -> já deve vir com o cliente selecionado ----------
  // O app hoje não tem um botão de "editar orçamento" na lista (só no catálogo, pra criar um
  // orçamento novo a partir de uma peça) — chama openOrcamentoBuilder(id) diretamente, que é a
  // mesma função que um botão de editar chamaria, pra confirmar que a lógica de pré-preencher
  // o cliente vinculado (cliente_id) funciona.
  await abrirAba(page, 'orcamentos'); // Orçamentos
  await page.waitForSelector('.card h3:has-text("Cliente Novo Do Orçamento")');
  const orcId = await page.evaluate(() => state.orcamentos.find(o => o.cliente === 'Cliente Novo Do Orçamento').id);
  await page.evaluate((id) => openOrcamentoBuilder(id, null), orcId);
  await page.waitForSelector('#oClienteTrocar');
  const modoAoEditar = await page.$eval('[data-cliente-modo="buscar"]', el => el.className.includes('btn-primary'));
  assert(modoAoEditar, 'reabrindo um orçamento com cliente vinculado, deve entrar direto em "Cliente existente"');
  const nomeAoEditar = await page.$eval('#oClienteBox h3', el => el.textContent);
  assert(nomeAoEditar.includes('Cliente Novo Do Orçamento'), `deve mostrar o cliente já vinculado, sem precisar buscar de novo — obtido: ${nomeAoEditar}`);
  await page.evaluate(() => { const el = document.getElementById('modalBackdrop'); if (el) el.remove(); });

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== ALGUM TESTE FALHOU ===' : '\n=== TODOS OS TESTES PASSARAM ===');
})();
