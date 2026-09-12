const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { abrirAbaStandalone } = require('./test_helpers_standalone');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('OK:', msg);
}

const FAKE_FIREBASE_JS = fs.readFileSync(path.resolve(__dirname, 'fake_firebase.js'), 'utf8');

async function login(page) {
  await page.waitForSelector('#loginScreen');
  await page.fill('#loginEmail', 'dono@teste.com');
  await page.fill('#loginSenha', 'senha123');
  await page.click('#loginBtn');
  await page.waitForSelector('#sidebarNav [data-nav]');
}

async function cadastrarVendedor(page, nome) {
  await abrirAbaStandalone(page, 'admin-vendedores');
  await page.waitForSelector('#btnAddVendedor');
  await page.click('#btnAddVendedor');
  await page.waitForSelector('#vNome');
  await page.fill('#vNome', nome);
  await page.click('#vSave');
  await page.waitForSelector(`.item-card h3:has-text("${nome}")`);
}

async function trocarVendedorAtual(page, nome) {
  // No celular (viewport dos testes), "Danilo · trocar" fica escondido atrás do menu compacto
  // do usuário (ver leva de ajustes de UI/UX) — abre por ele em vez do botão direto no cabeçalho.
  await page.click('#btnUsuarioMenu');
  await page.click('#mnuTrocarVendedor');
  await page.waitForSelector('[data-escolher-vendedor]');
  const id = await page.$$eval('[data-escolher-vendedor]', (els, nome) => els.find(e => e.textContent.trim() === nome)?.getAttribute('data-escolher-vendedor'), nome);
  await page.click(`[data-escolher-vendedor="${id}"]`);
  await page.waitForFunction((nome) => document.getElementById('vendedorAtualBox')?.textContent.includes(nome), nome);
}

async function criarOrcamento(page, cliente, { preco = '10' } = {}) {
  await abrirAbaStandalone(page, 'orcamentos');
  await page.waitForSelector('#fabNovoOrc');
  await page.click('#fabNovoOrc');
  await page.waitForSelector('[data-cliente-modo="novo"]');
  await page.click('[data-cliente-modo="novo"]');
  await page.waitForSelector('#oClienteNome');
  await page.fill('#oClienteNome', cliente);
  await page.fill('#oAvulsoNome', 'Item ' + cliente);
  await page.fill('#oAvulsoPreco', preco);
  await page.click('#oAddItem');
  await page.click('#oSalvar');
  await page.waitForSelector(`.card h3:has-text("${cliente}")`);
}

// Conversão orçamento->pedido, sub-status de produção/entrega, pagamento, cancelar/reabrir,
// reverter, "Copiar orçamento", numeração sequencial e filtros por cliente/vendedor nas duas
// abas (Orçamentos filtra por quem CRIOU; Pedidos filtra por quem CONVERTEU — podem ser
// pessoas diferentes).
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page.addInitScript(FAKE_FIREBASE_JS);
  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'app', 'biri-prints-3d-standalone.html');
  await page.goto(fileUrl);
  await login(page);

  // gate: cadastra Ana como primeiro vendedor
  await page.waitForSelector('#vendedorGate');
  await page.click('#btnNovoVendedorGate');
  await page.waitForSelector('#vNome');
  await page.fill('#vNome', 'Ana');
  await page.click('#vSave');
  await page.waitForSelector('#vendedorGate', { state: 'detached' });
  await page.waitForFunction(() => document.getElementById('vendedorAtualBox')?.textContent.includes('Ana'));

  await cadastrarVendedor(page, 'Bruno');

  // ---------- monta 2 orçamentos: um com Ana atual, outro depois de trocar pra Bruno ----------
  await criarOrcamento(page, 'Maria Compradora');
  await trocarVendedorAtual(page, 'Bruno');
  await criarOrcamento(page, 'João Comprador');

  // ---------- 1. estado inicial na aba Orçamentos: chips contam certinho, numeração sequencial ----------
  let chipTexts = await page.$$eval('[data-filtro-orc]', els => els.map(e => e.textContent.trim()));
  assert(chipTexts.some(t => t === 'Todos (2)'), `chip "Todos" deve contar 2 — obtido: ${chipTexts.join(' | ')}`);
  assert(chipTexts.some(t => t === 'Rascunhos (2)'), `chip "Rascunhos" deve contar 2 — obtido: ${chipTexts.join(' | ')}`);
  assert(chipTexts.some(t => t === 'Encerrados (0)'), `chip "Encerrados" deve começar em 0 — obtido: ${chipTexts.join(' | ')}`);
  const textoJoao = await page.$eval('.card:has(h3:has-text("João Comprador"))', el => el.textContent);
  assert(textoJoao.includes('Orçamento #2'), `João (criado depois) deve ser o Orçamento #2 — obtido: ${textoJoao.replace(/\s+/g,' ')}`);

  // ---------- 2. filtro por cliente e por vendedor (vendedor_id = quem criou) na aba Orçamentos ----------
  await page.fill('#filtroOrcCliente', 'maria');
  await page.waitForTimeout(80);
  let nomes = await page.$$eval('#orcList .card h3', els => els.map(e => e.textContent));
  assert(nomes.length === 1 && nomes[0].includes('Maria'), `filtro de cliente "maria" deve mostrar só a Maria — obtido: ${nomes.join(', ')}`);
  await page.fill('#filtroOrcCliente', '');
  await page.waitForTimeout(80);

  await page.selectOption('#filtroOrcVendedor', { label: 'Bruno' });
  await page.waitForTimeout(80);
  nomes = await page.$$eval('#orcList .card h3', els => els.map(e => e.textContent));
  assert(nomes.length === 1 && nomes[0].includes('João'), `filtro de vendedor "Bruno" deve mostrar só o orçamento que ele criou (João) — obtido: ${nomes.join(', ')}`);
  await page.selectOption('#filtroOrcVendedor', 'todos');
  await page.waitForTimeout(80);

  // ---------- 3. converter "João" (criado com Bruno) em pedido, mas trocando de volta pra Ana antes ----------
  await trocarVendedorAtual(page, 'Ana');
  const toggles = await page.$$('[data-toggle-orc]');
  await toggles[0].click(); // João é o mais recente -> primeiro da lista
  await page.waitForSelector('[data-converter-pedido]');
  const badgeAntes = await page.$eval('.card.expanded .badge', el => el.textContent.trim());
  assert(badgeAntes === 'Rascunho', `antes de converter, o selo deve ser "Rascunho" — obtido: ${badgeAntes}`);

  await page.click('[data-converter-pedido]'); // 1º clique: confirmação
  await page.waitForTimeout(80);
  const textoConfirmando = await page.$eval('[data-converter-pedido]', el => el.textContent.trim());
  assert(textoConfirmando.includes('Confirmar'), `1º clique deve pedir confirmação — obtido: ${textoConfirmando}`);
  await page.click('[data-converter-pedido]'); // 2º clique: confirma
  await page.waitForTimeout(150);

  // ---------- 4. orçamento convertido fica "Encerrado" e travado na aba Orçamentos ----------
  const badgeDepois = await page.$eval('.card.expanded .badge', el => el.textContent.trim());
  assert(badgeDepois === 'Encerrado', `depois de converter, o selo deve virar "Encerrado" — obtido: ${badgeDepois}`);
  assert((await page.$('.card.expanded .badge-pedido')) !== null, 'o selo "Encerrado" deve usar a classe .badge-pedido (destaque final)');
  assert((await page.$('.card.expanded [data-editar-orc]')) === null, 'orçamento encerrado não deve ter botão "Editar"');
  assert((await page.$('.card.expanded [data-del-orc]')) === null, 'orçamento encerrado não deve ter botão "Excluir"');
  assert((await page.$('.card.expanded [data-converter-pedido]')) === null, 'orçamento encerrado não deve ter mais "Converter em pedido"');
  assert((await page.$('.card.expanded [data-copiar-orc]')) !== null, 'orçamento encerrado deve continuar com "Copiar orçamento"');
  const textoCardEncerrado = await page.$eval('.card.expanded', el => el.textContent);
  assert(textoCardEncerrado.includes('Pedido #1'), `card encerrado deve referenciar "Pedido #1" — obtido: ${textoCardEncerrado.replace(/\s+/g,' ')}`);

  // tentar editar diretamente (via função) deve ser bloqueado também
  const orcId = await page.evaluate(() => state.orcamentos.find(o => o.cliente === 'João Comprador').id);
  await page.evaluate((id) => openOrcamentoBuilder(id, null), orcId);
  await page.waitForTimeout(100);
  assert((await page.$('#modalBackdrop')) === null, 'abrir um orçamento encerrado pelo editor direto não deve abrir o modal');

  // ---------- 5. o pedido aparece na aba Pedidos, com todos os controles ----------
  await abrirAbaStandalone(page, 'pedidos');
  await page.waitForSelector('#pedList');
  await page.click('[data-toggle-orc]');
  await page.waitForSelector('[data-status-pedido]');
  const badgePed = await page.$eval('.card.expanded .badge', el => el.textContent.trim());
  assert(badgePed === 'Aberto', `pedido recém-convertido deve entrar em "Aberto" — obtido: ${badgePed}`);
  const textoCardPedido = await page.$eval('.card.expanded', el => el.textContent);
  assert(textoCardPedido.includes('Orçamento #2'), `card do pedido deve referenciar "Orçamento #2" — obtido: ${textoCardPedido.replace(/\s+/g,' ')}`);

  // ---------- 5b. sub-status Aberto -> Em produção -> Pronto -> Entregue ----------
  for (const [valor, label] of [['em_producao', 'Em produção'], ['pronto', 'Pronto'], ['entregue', 'Entregue']]) {
    await page.selectOption('.card.expanded [data-status-pedido]', valor);
    await page.waitForTimeout(80);
    const badgeSub = await page.$eval('.card.expanded .badge', el => el.textContent.trim());
    assert(badgeSub === label, `selecionar "${label}" deve mudar o selo — obtido: ${badgeSub}`);
  }
  assert((await page.$('.card.expanded .badge-pedido')) !== null, 'selo "Entregue" deve usar a classe .badge-pedido (destaque final)');

  // ---------- 5c. pagamento é independente do sub-status ----------
  await page.click('.card.expanded [data-toggle-pago]');
  await page.waitForTimeout(80);
  let badgePago = await page.$('.card.expanded .badge:has-text("Pago")');
  assert(badgePago !== null, 'depois de marcar como pago, deve aparecer o selo "Pago"');
  const statusAindaEntregue = await page.$eval('.card.expanded [data-status-pedido]', el => el.value);
  assert(statusAindaEntregue === 'entregue', 'marcar como pago não deve mudar o status de produção/entrega');
  await page.click('.card.expanded [data-toggle-pago]');
  await page.waitForTimeout(80);
  badgePago = await page.$('.card.expanded .badge:has-text("Pago")');
  assert(badgePago === null, 'desmarcar o pagamento deve remover o selo "Pago"');

  // ---------- 5d. cancelar e reabrir ----------
  await page.click('.card.expanded [data-cancelar-pedido]');
  await page.waitForTimeout(80);
  await page.click('.card.expanded [data-cancelar-pedido]');
  await page.waitForTimeout(150);
  const badgeCancelado = await page.$eval('.card.expanded .badge', el => el.textContent.trim());
  assert(badgeCancelado === 'Cancelado', `depois de cancelar, o selo deve virar "Cancelado" — obtido: ${badgeCancelado}`);
  assert((await page.$('.card.expanded [data-status-pedido]')) === null, 'com o pedido cancelado, o seletor de status não deve mais aparecer');
  await page.click('.card.expanded [data-reabrir-pedido]');
  await page.waitForTimeout(150);
  const badgeReaberto = await page.$eval('.card.expanded .badge', el => el.textContent.trim());
  assert(badgeReaberto === 'Aberto', `depois de reabrir, o selo deve voltar pra "Aberto" — obtido: ${badgeReaberto}`);

  // ---------- 6. filtro por vendedor do PEDIDO (quem converteu = Ana, não quem criou = Bruno) ----------
  await page.selectOption('#filtroPedVendedor', { label: 'Bruno' });
  await page.waitForTimeout(80);
  let nomesPed = await page.$$eval('#pedList .card h3', els => els.map(e => e.textContent));
  assert(nomesPed.length === 0, `filtro por vendedor do PEDIDO "Bruno" não deve achar nada — quem converteu foi a Ana — obtido: ${nomesPed.join(', ')}`);
  await page.selectOption('#filtroPedVendedor', { label: 'Ana' });
  await page.waitForTimeout(80);
  nomesPed = await page.$$eval('#pedList .card h3', els => els.map(e => e.textContent));
  assert(nomesPed.length === 1 && nomesPed[0].includes('João'), `filtro por vendedor do pedido "Ana" deve achar o pedido do João — obtido: ${nomesPed.join(', ')}`);
  await page.selectOption('#filtroPedVendedor', 'todos');
  await page.waitForTimeout(80);

  // ---------- 7. "Copiar orçamento" a partir de um pedido: cria um NOVO orçamento, recalculado ----------
  // "João Comprador" foi criado via "Novo cliente" no orçamento, então já existe cadastrado —
  // copiar o orçamento deve vir com o mesmo cliente já selecionado (modo "buscar").
  await page.click('.card.expanded [data-copiar-orc]');
  await page.waitForSelector('#oClienteBox');
  const clienteCopiado = await page.textContent('#oClienteBox');
  assert(clienteCopiado.includes('João Comprador'), `"Copiar orçamento" deve pré-preencher o cliente — obtido: ${clienteCopiado.replace(/\s+/g,' ')}`);
  await page.click('#oSalvar');
  await page.waitForTimeout(150);
  await page.evaluate(() => { document.getElementById('modalBackdrop')?.remove(); });

  await abrirAbaStandalone(page, 'orcamentos');
  await page.waitForTimeout(80);
  const totalJoao = (await page.$$('.card h3:has-text("João Comprador")')).length;
  assert(totalJoao === 2, `"Copiar orçamento" deve criar um orçamento NOVO, sem afetar o original — obtido: ${totalJoao} cards com "João Comprador"`);

  // ---------- 8. reverter o pedido -> some de Pedidos, volta a "Enviado" em Orçamentos ----------
  // Trocar de aba reseta state.expandedOrc — precisa expandir o card de novo.
  await abrirAbaStandalone(page, 'pedidos');
  await page.waitForSelector('#pedList [data-toggle-orc]');
  await page.click('#pedList [data-toggle-orc]');
  await page.waitForSelector('.card.expanded [data-reverter-pedido]');
  await page.click('.card.expanded [data-reverter-pedido]');
  await page.waitForTimeout(80);
  await page.click('.card.expanded [data-reverter-pedido]');
  await page.waitForTimeout(150);
  const semPedidoNaLista = await page.$('#pedList .card h3:has-text("João Comprador")');
  assert(semPedidoNaLista === null, 'depois de reverter, o pedido não deve mais aparecer na aba Pedidos');

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== ALGUM TESTE FALHOU ===' : '\n=== TODOS OS TESTES PASSARAM ===');
})();
