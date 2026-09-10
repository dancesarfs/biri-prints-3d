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

  await abrirAba(page, 'orcamentos'); // Orçamentos
  await page.waitForSelector('#fabNovoOrc');

  // cria 2 orçamentos (cliente cadastrado ali mesmo, via o modo "Novo cliente")
  for (const nome of ['Dan', 'Danilo']) {
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

  // expande o primeiro card da lista (mais recente primeiro -> "Danilo")
  const toggles = await page.$$('[data-toggle-orc]');
  assert(toggles.length === 2, `deve haver 2 orçamentos na lista — obtido: ${toggles.length}`);
  await toggles[0].click();
  await page.waitForSelector('.card.expanded');

  const cards = await page.$$('#orcList > .card');
  assert(cards.length === 2, `lista deve ter 2 caixas .card separadas — obtido: ${cards.length}`);

  const box0 = await cards[0].boundingBox();
  const box1 = await cards[1].boundingBox();
  const gap = box1.y - (box0.y + box0.height);
  assert(gap >= 18, `deve haver um espaço visível (>=18px) entre as duas caixas — obtido: ${gap.toFixed(1)}px`);

  const expandedClass = await cards[0].getAttribute('class');
  assert(expandedClass.includes('expanded'), `o card expandido deve ter a classe "expanded" — obtido: ${expandedClass}`);
  const collapsedClass = await cards[1].getAttribute('class');
  assert(!collapsedClass.includes('expanded'), `o card colapsado NÃO deve ter a classe "expanded" — obtido: ${collapsedClass}`);

  // confere visualmente que as bordas não se sobrepõem (caixa 2 começa estritamente depois que a 1 termina)
  assert(box1.y > box0.y + box0.height, 'a segunda caixa deve começar depois que a primeira termina (sem sobreposição/aninhamento)');

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== ALGUM TESTE FALHOU ===' : '\n=== TODOS OS TESTES PASSARAM ===');
})();
