const { chromium } = require('playwright');
const path = require('path');
const { passarPeloGateVendedor, abrirAba } = require('./test_helpers');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('OK:', msg);
}

// Desde a separação das abas Orçamentos/Pedidos, converter um orçamento em pedido faz ele: (a)
// continuar aparecendo na aba Orçamentos, só que travado ("Encerrado", sem editar/excluir); e (b)
// passar a aparecer de verdade na aba Pedidos nova, com todos os controles de produção/pagamento
// que antes ficavam dentro da própria aba Orçamentos.
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'app', 'bancada-3d.html');
  await page.goto(fileUrl);
  await passarPeloGateVendedor(page);
  await page.waitForSelector('#btnAbrirMenu');

  await abrirAba(page, 'orcamentos'); // Orçamentos
  await page.waitForSelector('#fabNovoOrc');

  // cria 2 orçamentos (cliente novo cadastrado ali mesmo)
  for (const nome of ['Pedido Um', 'Pedido Dois']) {
    await page.click('#fabNovoOrc');
    await page.waitForSelector('[data-cliente-modo="novo"]');
    await page.click('[data-cliente-modo="novo"]');
    await page.waitForSelector('#oClienteNome');
    await page.fill('#oClienteNome', nome);
    await page.selectOption('#oProdSel', { label: 'TESTE' });
    await page.click('#oAddItem');
    await page.click('#oSalvar');
    await page.waitForSelector(`.card h3:has-text("${nome}")`);
  }

  // ---------- 1. estado inicial na aba Orçamentos: ambos rascunho, chips contam certinho ----------
  let chipTexts = await page.$$eval('[data-filtro-orc]', els => els.map(e => e.textContent.trim()));
  assert(chipTexts.some(t => t === 'Todos (2)'), `chip "Todos" deve contar 2 — obtido: ${chipTexts.join(' | ')}`);
  assert(chipTexts.some(t => t === 'Rascunhos (2)'), `chip "Rascunhos" deve contar 2 no início — obtido: ${chipTexts.join(' | ')}`);
  assert(chipTexts.some(t => t === 'Encerrados (0)'), `chip que antes era "Pedidos" agora deve dizer "Encerrados" e começar em 0 — obtido: ${chipTexts.join(' | ')}`);

  // ---------- 2. converter o primeiro (mais recente = "Pedido Dois") em pedido ----------
  const toggles = await page.$$('[data-toggle-orc]');
  await toggles[0].click();
  await page.waitForSelector('[data-converter-pedido]');

  const badgeAntes = await page.$eval('.card.expanded .badge', el => el.textContent.trim());
  assert(badgeAntes === 'Rascunho', `antes de converter, o selo deve ser "Rascunho" — obtido: ${badgeAntes}`);

  const btnConverter = await page.$('[data-converter-pedido]');
  await btnConverter.click(); // 1º clique: entra em modo confirmação
  await page.waitForTimeout(80);
  const textoConfirmando = await page.$eval('[data-converter-pedido]', el => el.textContent.trim());
  assert(textoConfirmando.includes('Confirmar'), `1º clique deve pedir confirmação — obtido: ${textoConfirmando}`);
  await page.click('[data-converter-pedido]'); // 2º clique: confirma
  await page.waitForTimeout(150);

  // ---------- 3. orçamento convertido continua na aba Orçamentos, mas "Encerrado" e travado ----------
  const badgeDepois = await page.$eval('.card.expanded .badge', el => el.textContent.trim());
  assert(badgeDepois === 'Encerrado', `depois de converter, o selo na aba Orçamentos deve virar "Encerrado" — obtido: ${badgeDepois}`);
  assert((await page.$('.card.expanded .badge-pedido')) !== null, 'o selo "Encerrado" deve usar a classe .badge-pedido');
  assert((await page.$('.card.expanded [data-editar-orc]')) === null, 'orçamento encerrado não deve ter botão "Editar"');
  assert((await page.$('.card.expanded [data-del-orc]')) === null, 'orçamento encerrado não deve ter botão "Excluir" na aba Orçamentos');
  assert((await page.$('.card.expanded [data-toggle-status]')) === null, 'orçamento encerrado não deve ter botão "Marcar como enviado/rascunho"');
  assert((await page.$('.card.expanded [data-converter-pedido]')) === null, 'orçamento encerrado não deve ter mais o botão "Converter em pedido"');
  const textoCardEncerrado = await page.$eval('.card.expanded', el => el.textContent);
  assert(textoCardEncerrado.includes('Pedido #1'), `card encerrado deve referenciar "Pedido #1" — obtido: ${textoCardEncerrado.replace(/\s+/g,' ')}`);
  // "Copiar orçamento" continua disponível mesmo travado
  assert((await page.$('.card.expanded [data-copiar-orc]')) !== null, 'orçamento encerrado deve continuar com o botão "Copiar orçamento"');

  chipTexts = await page.$$eval('[data-filtro-orc]', els => els.map(e => e.textContent.trim()));
  assert(chipTexts.some(t => t === 'Encerrados (1)'), `chip "Encerrados" deve subir para 1 — obtido: ${chipTexts.join(' | ')}`);
  assert(chipTexts.some(t => t === 'Rascunhos (1)'), `chip "Rascunhos" deve cair para 1 — obtido: ${chipTexts.join(' | ')}`);

  // ---------- 4. o mesmo pedido aparece de verdade na aba Pedidos, com todos os controles ----------
  await abrirAba(page, 'pedidos'); // Pedidos
  await page.waitForSelector('#pedList');
  await page.click('[data-toggle-orc]');
  await page.waitForSelector('[data-status-pedido]');

  const badgePed = await page.$eval('.card.expanded .badge', el => el.textContent.trim());
  assert(badgePed === 'Aberto', `pedido recém-convertido deve entrar em "Aberto" — obtido: ${badgePed}`);
  assert((await page.$('.card.expanded .badge-muted')) !== null, 'selo "Aberto" deve usar a classe .badge-muted');
  // "Pedido Dois" foi o SEGUNDO orçamento criado (Orçamento #2) — é o mais recente, por isso é o
  // primeiro item da lista e foi o convertido acima.
  const textoCardPedido = await page.$eval('.card.expanded', el => el.textContent);
  assert(textoCardPedido.includes('Orçamento #2'), `card do pedido deve referenciar "Orçamento #2" — obtido: ${textoCardPedido.replace(/\s+/g,' ')}`);

  const opcoesIniciais = await page.$eval('.card.expanded [data-status-pedido]', el => el.value);
  assert(opcoesIniciais === 'aberto', `o seletor de status do pedido deve começar em "aberto" — obtido: ${opcoesIniciais}`);

  // ---------- 4b. sub-status do pedido (Aberto -> Em produção -> Pronto -> Entregue) ----------
  await page.selectOption('.card.expanded [data-status-pedido]', 'em_producao');
  await page.waitForTimeout(80);
  let badgeSub = await page.$eval('.card.expanded .badge', el => el.textContent.trim());
  assert(badgeSub === 'Em produção', `selecionar "Em produção" deve mudar o selo — obtido: ${badgeSub}`);
  assert((await page.$('.card.expanded .badge-warn')) !== null, 'selo "Em produção" deve usar a classe .badge-warn');

  await page.selectOption('.card.expanded [data-status-pedido]', 'pronto');
  await page.waitForTimeout(80);
  badgeSub = await page.$eval('.card.expanded .badge', el => el.textContent.trim());
  assert(badgeSub === 'Pronto', `selecionar "Pronto" deve mudar o selo — obtido: ${badgeSub}`);
  assert((await page.$('.card.expanded .badge-accent')) !== null, 'selo "Pronto" deve usar a classe .badge-accent');

  await page.selectOption('.card.expanded [data-status-pedido]', 'entregue');
  await page.waitForTimeout(80);
  badgeSub = await page.$eval('.card.expanded .badge', el => el.textContent.trim());
  assert(badgeSub === 'Entregue', `selecionar "Entregue" deve mudar o selo — obtido: ${badgeSub}`);
  assert((await page.$('.card.expanded .badge-pedido')) !== null, 'selo "Entregue" deve usar a classe .badge-pedido (destaque final)');

  // ---------- 4c. pagamento é independente do sub-status ----------
  let nenhumPagoAinda = await page.$('.card.expanded .badge:has-text("Pago")');
  assert(nenhumPagoAinda === null, 'antes de marcar, não deve aparecer o selo "Pago"');
  await page.click('.card.expanded [data-toggle-pago]');
  await page.waitForTimeout(80);
  const badgePago = await page.$('.card.expanded .badge:has-text("Pago")');
  assert(badgePago !== null, 'depois de marcar como pago, deve aparecer o selo "Pago"');
  const textoBtnPago = await page.$eval('.card.expanded [data-toggle-pago]', el => el.textContent.trim());
  assert(textoBtnPago === 'Desmarcar pagamento', `botão deve virar "Desmarcar pagamento" — obtido: ${textoBtnPago}`);
  const statusAindaEntregue = await page.$eval('.card.expanded [data-status-pedido]', el => el.value);
  assert(statusAindaEntregue === 'entregue', 'marcar como pago não deve mudar o status de produção/entrega do pedido');

  await page.click('.card.expanded [data-toggle-pago]'); // desmarca de novo
  await page.waitForTimeout(80);
  const semPagoDeNovo = await page.$('.card.expanded .badge:has-text("Pago")');
  assert(semPagoDeNovo === null, 'desmarcar o pagamento deve remover o selo "Pago"');

  // ---------- 4d. cancelar e reabrir pedido ----------
  await page.selectOption('.card.expanded [data-status-pedido]', 'aberto');
  await page.waitForTimeout(80);
  const btnCancelar = await page.$('.card.expanded [data-cancelar-pedido]');
  assert(btnCancelar !== null, 'com o pedido em "Aberto", deve existir o botão "Cancelar pedido"');
  await btnCancelar.click();
  await page.waitForTimeout(80);
  await page.click('.card.expanded [data-cancelar-pedido]');
  await page.waitForTimeout(150);

  const badgeCancelado = await page.$eval('.card.expanded .badge', el => el.textContent.trim());
  assert(badgeCancelado === 'Cancelado', `depois de cancelar, o selo deve virar "Cancelado" — obtido: ${badgeCancelado}`);
  assert((await page.$('.card.expanded .badge-danger')) !== null, 'selo "Cancelado" deve usar a classe .badge-danger');
  assert((await page.$('.card.expanded [data-status-pedido]')) === null, 'com o pedido cancelado, o seletor de status não deve mais aparecer');
  assert((await page.$('.card.expanded [data-cancelar-pedido]')) === null, 'com o pedido já cancelado, o botão "Cancelar pedido" não deve mais aparecer');

  await page.click('.card.expanded [data-reabrir-pedido]');
  await page.waitForTimeout(150);
  const badgeReaberto = await page.$eval('.card.expanded .badge', el => el.textContent.trim());
  assert(badgeReaberto === 'Aberto', `depois de reabrir, o selo deve voltar pra "Aberto" — obtido: ${badgeReaberto}`);
  assert((await page.$('.card.expanded [data-status-pedido]')) !== null, 'depois de reabrir, o seletor de status deve reaparecer');

  // ---------- 5. filtro de status na aba Pedidos ----------
  let chipsPed = await page.$$eval('[data-filtro-ped]', els => els.map(e => e.textContent.trim()));
  assert(chipsPed.some(t => t === 'Todos (1)'), `chip "Todos" da aba Pedidos deve contar 1 — obtido: ${chipsPed.join(' | ')}`);
  assert(chipsPed.some(t => t === 'Aberto (1)'), `chip "Aberto" deve contar 1 — obtido: ${chipsPed.join(' | ')}`);
  await page.click('[data-filtro-ped="entregue"]');
  await page.waitForTimeout(80);
  let nomesPed = await page.$$eval('#pedList .card h3', els => els.map(e => e.textContent));
  assert(nomesPed.length === 0, `filtro "Entregue" não deve mostrar nada (pedido está "Aberto") — obtido: ${nomesPed.join(', ')}`);
  await page.click('[data-filtro-ped="todos"]');
  await page.waitForTimeout(80);

  // ---------- 6. reverter pedido -> some da aba Pedidos, volta a "Enviado" na aba Orçamentos ----------
  await page.waitForSelector('.card.expanded [data-reverter-pedido]');
  const btnReverter = await page.$('.card.expanded [data-reverter-pedido]');
  await btnReverter.click();
  await page.waitForTimeout(80);
  await page.click('.card.expanded [data-reverter-pedido]');
  await page.waitForTimeout(150);

  const semPedidoNaLista = await page.$('.card h3:has-text("Pedido Dois")');
  assert(semPedidoNaLista === null, 'depois de reverter, o pedido não deve mais aparecer na aba Pedidos');

  await abrirAba(page, 'orcamentos'); // Orçamentos
  await page.waitForSelector('[data-toggle-orc]');
  await page.click('[data-toggle-orc]');
  await page.waitForSelector('[data-toggle-status]');
  const badgeAposReverter = await page.$eval('.card.expanded .badge', el => el.textContent.trim());
  assert(badgeAposReverter === 'Enviado', `depois de reverter, o selo na aba Orçamentos deve virar "Enviado" (não volta a "Rascunho") — obtido: ${badgeAposReverter}`);
  assert((await page.$('.card.expanded [data-converter-pedido]')) !== null, 'depois de reverter, o botão "Converter em pedido" deve reaparecer');
  assert((await page.$('.card.expanded [data-editar-orc]')) !== null, 'depois de reverter, o botão "Editar" deve reaparecer');

  chipTexts = await page.$$eval('[data-filtro-orc]', els => els.map(e => e.textContent.trim()));
  assert(chipTexts.some(t => t === 'Encerrados (0)'), `chip "Encerrados" deve voltar para 0 depois de reverter — obtido: ${chipTexts.join(' | ')}`);
  assert(chipTexts.some(t => t === 'Enviados (1)'), `chip "Enviados" deve subir para 1 depois de reverter — obtido: ${chipTexts.join(' | ')}`);

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== ALGUM TESTE FALHOU ===' : '\n=== TODOS OS TESTES PASSARAM ===');
})();
