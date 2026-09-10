const { chromium } = require('playwright');
const path = require('path');
const { passarPeloGateVendedor, abrirAba } = require('./test_helpers');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('OK:', msg);
}

// Filtros por cliente (texto) e vendedor (select), lado a lado com o filtro de status já
// existente — nas duas abas (Orçamentos e Pedidos), cada uma filtrando pelo vendedor que faz
// sentido pra ela: Orçamentos filtra por quem CRIOU o orçamento (vendedor_id); Pedidos filtra por
// quem CONVERTEU/toca a venda (vendedor_pedido_id) — podem ser pessoas diferentes.
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'app', 'bancada-3d.html');
  await page.goto(fileUrl);
  await passarPeloGateVendedor(page, 'Ana');
  await page.waitForSelector('#btnAbrirMenu');

  // cadastra um segundo vendedor (Bruno) em Ajustes
  await abrirAba(page, 'admin-vendedores');
  await page.waitForSelector('#btnAddVendedor');
  await page.click('#btnAddVendedor');
  await page.waitForSelector('#vNome');
  await page.fill('#vNome', 'Bruno');
  await page.click('#vSave');
  await page.waitForSelector('.item-card h3:has-text("Bruno")');

  // ---------- monta 2 orçamentos: um com Ana (vendedor atual), outro trocando pra Bruno antes ----------
  await abrirAba(page, 'orcamentos'); // Orçamentos
  await page.waitForSelector('#fabNovoOrc');
  await page.click('#fabNovoOrc');
  await page.waitForSelector('[data-cliente-modo="novo"]');
  await page.click('[data-cliente-modo="novo"]');
  await page.waitForSelector('#oClienteNome');
  await page.fill('#oClienteNome', 'Maria Compradora');
  await page.selectOption('#oProdSel', { label: 'TESTE' });
  await page.click('#oAddItem');
  await page.click('#oSalvar');
  await page.waitForSelector('.card h3:has-text("Maria Compradora")');

  // troca vendedor atual pra Bruno antes do 2º orçamento
  await page.click('#btnTrocarVendedor');
  await page.waitForSelector('[data-escolher-vendedor]');
  const brunoId = await page.$$eval('[data-escolher-vendedor]', els => els.find(e => e.textContent.trim() === 'Bruno')?.getAttribute('data-escolher-vendedor'));
  await page.click(`[data-escolher-vendedor="${brunoId}"]`);
  await page.waitForTimeout(80);

  await page.click('#fabNovoOrc');
  await page.waitForSelector('[data-cliente-modo="novo"]');
  await page.click('[data-cliente-modo="novo"]');
  await page.waitForSelector('#oClienteNome');
  await page.fill('#oClienteNome', 'João Comprador');
  await page.selectOption('#oProdSel', { label: 'TESTE' });
  await page.click('#oAddItem');
  await page.click('#oSalvar');
  await page.waitForSelector('.card h3:has-text("João Comprador")');

  // ---------- filtro por cliente na aba Orçamentos ----------
  await page.fill('#filtroOrcCliente', 'maria');
  await page.waitForTimeout(80);
  let nomes = await page.$$eval('#orcList .card h3', els => els.map(e => e.textContent));
  assert(nomes.length === 1 && nomes[0].includes('Maria'), `filtro de cliente "maria" deve mostrar só a Maria — obtido: ${nomes.join(', ')}`);
  await page.fill('#filtroOrcCliente', '');
  await page.waitForTimeout(80);

  // ---------- filtro por vendedor na aba Orçamentos (vendedor_id = quem criou) ----------
  await page.selectOption('#filtroOrcVendedor', { label: 'Bruno' });
  await page.waitForTimeout(80);
  nomes = await page.$$eval('#orcList .card h3', els => els.map(e => e.textContent));
  assert(nomes.length === 1 && nomes[0].includes('João'), `filtro de vendedor "Bruno" deve mostrar só o orçamento que ele criou (João) — obtido: ${nomes.join(', ')}`);
  await page.selectOption('#filtroOrcVendedor', { label: 'Ana' });
  await page.waitForTimeout(80);
  nomes = await page.$$eval('#orcList .card h3', els => els.map(e => e.textContent));
  assert(nomes.length === 1 && nomes[0].includes('Maria'), `filtro de vendedor "Ana" deve mostrar só o orçamento que ela criou (Maria) — obtido: ${nomes.join(', ')}`);
  await page.selectOption('#filtroOrcVendedor', 'todos');
  await page.waitForTimeout(80);
  nomes = await page.$$eval('#orcList .card h3', els => els.map(e => e.textContent));
  assert(nomes.length === 2, `filtro de vendedor "Todos" deve mostrar os 2 — obtido: ${nomes.length}`);

  // ---------- converte o orçamento do João (feito com Bruno atual) em pedido, mas troca pra Ana antes de converter ----------
  await page.click('#btnTrocarVendedor');
  await page.waitForSelector('[data-escolher-vendedor]');
  const anaId = await page.$$eval('[data-escolher-vendedor]', els => els.find(e => e.textContent.trim() === 'Ana')?.getAttribute('data-escolher-vendedor'));
  await page.click(`[data-escolher-vendedor="${anaId}"]`);
  await page.waitForTimeout(80);

  const toggles = await page.$$('[data-toggle-orc]');
  // "João Comprador" é o mais recente -> primeiro da lista
  await toggles[0].click();
  await page.waitForSelector('[data-converter-pedido]');
  await page.click('[data-converter-pedido]');
  await page.waitForTimeout(80);
  await page.click('[data-converter-pedido]');
  await page.waitForTimeout(150);

  // ---------- filtro por cliente e vendedor na aba Pedidos (vendedor_pedido = quem converteu) ----------
  await abrirAba(page, 'pedidos'); // Pedidos
  await page.waitForSelector('#pedList');
  let nomesPed = await page.$$eval('#pedList .card h3', els => els.map(e => e.textContent));
  assert(nomesPed.length === 1 && nomesPed[0].includes('João'), `pedido convertido (João) deve aparecer na aba Pedidos — obtido: ${nomesPed.join(', ')}`);

  await page.selectOption('#filtroPedVendedor', { label: 'Bruno' });
  await page.waitForTimeout(80);
  nomesPed = await page.$$eval('#pedList .card h3', els => els.map(e => e.textContent));
  assert(nomesPed.length === 0, `filtro por vendedor do PEDIDO "Bruno" não deve achar nada — quem converteu foi a Ana, não o Bruno (mesmo ele tendo criado o orçamento original) — obtido: ${nomesPed.join(', ')}`);

  await page.selectOption('#filtroPedVendedor', { label: 'Ana' });
  await page.waitForTimeout(80);
  nomesPed = await page.$$eval('#pedList .card h3', els => els.map(e => e.textContent));
  assert(nomesPed.length === 1 && nomesPed[0].includes('João'), `filtro por vendedor do pedido "Ana" (quem converteu) deve achar o pedido do João — obtido: ${nomesPed.join(', ')}`);

  await page.selectOption('#filtroPedVendedor', 'todos');
  await page.fill('#filtroPedCliente', 'joão');
  await page.waitForTimeout(80);
  nomesPed = await page.$$eval('#pedList .card h3', els => els.map(e => e.textContent));
  assert(nomesPed.length === 1 && nomesPed[0].includes('João'), `filtro de cliente "joão" na aba Pedidos deve achar o pedido dele — obtido: ${nomesPed.join(', ')}`);
  await page.fill('#filtroPedCliente', 'inexistente-xyz');
  await page.waitForTimeout(80);
  nomesPed = await page.$$eval('#pedList .card h3', els => els.map(e => e.textContent));
  assert(nomesPed.length === 0, 'filtro de cliente sem correspondência deve esvaziar a lista de pedidos');

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== ALGUM TESTE FALHOU ===' : '\n=== TODOS OS TESTES PASSARAM ===');
})();
