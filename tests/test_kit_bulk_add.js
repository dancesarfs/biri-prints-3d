const { chromium } = require('playwright');
const path = require('path');
const { passarPeloGateVendedor, abrirAba, abrirNovoProdutoModal } = require('./test_helpers');

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

  // cria 3 peças pra formar um grupo/kit
  async function criarPeca(nome, gram, min) {
    await abrirNovoProdutoModal(page);
    await page.fill('#cNome', nome);
    await page.selectOption('#cMaterial', { index: 0 });
    await page.fill('#cGram', String(gram));
    await page.fill('#cTempoH', '0');
    await page.fill('#cTempoM', String(min));
    await page.fill('#cEmb', '0');
    await page.waitForTimeout(30);
    await page.click('#btnSalvarCatalogo');
    await page.waitForSelector('.item-card');
  }
  await criarPeca('Bulk Peça 1', 20, 20);
  await criarPeca('Bulk Peça 2', 25, 25);
  await criarPeca('Bulk Peça 3', 30, 30);

  // cadastra o grupo com as 3 peças
  await abrirAba(page, 'admin-grupos');
  await page.waitForSelector('#btnAddGrupo');
  await page.click('#btnAddGrupo');
  await page.waitForSelector('#gNome');
  await page.fill('#gNome', 'Kit Bulk Teste');
  const labels = await page.$$eval('label:has(.grupo-prod-chk)', els => els.map(e=>e.textContent.trim()));
  const gCheckboxes = await page.$$('.grupo-prod-chk');
  for (let i = 0; i < labels.length; i++) {
    if (/Bulk Peça [123]/.test(labels[i])) await gCheckboxes[i].click();
  }
  await page.click('#gSave');
  await page.waitForTimeout(150);

  // cadastra uma promoção vigente hoje pra esse grupo (sem promoção ativa não há desconto de kit)
  // — Grupos e Promoções são submenus separados dentro de Admin, então precisa navegar de novo
  await abrirAba(page, 'admin-promocoes');
  await page.waitForSelector('#btnAddPromo');
  await page.click('#btnAddPromo');
  await page.waitForSelector('#pNome');
  await page.fill('#pNome', 'Promo Bulk Teste');
  await page.selectOption('#pGrupo', { label: 'Kit Bulk Teste' });
  const hojeStr = new Date().toISOString().slice(0,10);
  const amanhaStr = new Date(Date.now() + 30*86400000).toISOString().slice(0,10);
  await page.fill('#pInicio', hojeStr);
  await page.fill('#pFim', amanhaStr);
  await page.click('#pSave');
  await page.waitForTimeout(150);

  // abre um orçamento novo e usa o botão "+ Kit"
  await abrirAba(page, 'orcamentos'); // Orçamentos
  await page.waitForSelector('#fabNovoOrc');
  await page.click('#fabNovoOrc');
  await page.waitForSelector('[data-add-kit]');

  const kitBtnText = (await page.textContent('[data-add-kit]')).trim();
  assert(kitBtnText === '+ Kit Kit Bulk Teste', `botão de adicionar kit deveria se chamar "+ Kit Kit Bulk Teste" — obtido: "${kitBtnText}"`);

  await page.click('[data-add-kit]');
  await page.waitForTimeout(100);

  const itensAposKit = await page.$$('#oItensList .list-line');
  assert(itensAposKit.length === 3, `clicar em "+ Kit" deve adicionar as 3 peças do grupo de uma vez — obtido: ${itensAposKit.length}`);

  const checkboxesMarcadas = await page.$$eval('.item-incl-chk', els => els.filter(e=>e.checked).length);
  assert(checkboxesMarcadas === 3, `todos os itens do kit devem vir selecionados por padrão — obtido: ${checkboxesMarcadas}`);

  const kitBoxAntes = (await page.textContent('#oKitDescontos')).trim();
  console.log('Desconto com os 3 itens selecionados:', kitBoxAntes);
  assert(kitBoxAntes.includes('Desconto de kit detectado'), 'com as 3 peças do kit selecionadas, o desconto deve ser detectado');

  const totalAntes = (await page.textContent('#oTotal')).trim();

  // desmarca um item -> deve recalcular e sair do kit (só sobra 2 produtos, ainda dentro da faixa de 2-3 => mantém 5%, mas total muda)
  await (await page.$$('.item-incl-chk'))[2].click();
  await page.waitForTimeout(80);

  const itensAposDesmarcar = await page.$$('#oItensList .list-line'); // item continua na lista, só sai do cálculo
  assert(itensAposDesmarcar.length === 3, 'desmarcar um item não deve removê-lo da lista, só excluí-lo do cálculo');

  const totalDepoisDesmarcar = (await page.textContent('#oTotal')).trim();
  assert(totalDepoisDesmarcar !== totalAntes, `desmarcar um item deve recalcular o total — antes: ${totalAntes}, depois: ${totalDepoisDesmarcar}`);

  // desmarca mais um -> sobra só 1 produto no kit -> desconto deve sumir
  await (await page.$$('.item-incl-chk'))[1].click();
  await page.waitForTimeout(80);
  const kitBoxComUmSo = (await page.textContent('#oKitDescontos')).trim();
  assert(kitBoxComUmSo === '', `com só 1 produto selecionado, o desconto de kit deve desaparecer — obtido: "${kitBoxComUmSo}"`);

  // remarca os dois -> desconto deve voltar
  await (await page.$$('.item-incl-chk'))[2].click();
  await page.waitForTimeout(60);
  await (await page.$$('.item-incl-chk'))[1].click();
  await page.waitForTimeout(80);
  const kitBoxDepoisRemarcar = (await page.textContent('#oKitDescontos')).trim();
  assert(kitBoxDepoisRemarcar.includes('Desconto de kit detectado'), 'remarcar os itens deve trazer o desconto de kit de volta');
  const totalDepoisRemarcar = (await page.textContent('#oTotal')).trim();
  assert(totalDepoisRemarcar === totalAntes, `remarcar tudo deve voltar ao total original — esperado ${totalAntes}, obtido ${totalDepoisRemarcar}`);

  // desmarca um item de fato e salva -> o item desmarcado não deve entrar no orçamento salvo
  await (await page.$$('.item-incl-chk'))[0].click();
  await page.waitForTimeout(80);
  await page.click('#oSalvar');
  await page.waitForTimeout(200);

  await page.click('[data-toggle-orc]');
  await page.waitForTimeout(100);
  const cardText = await page.textContent('.card');
  const qtdBulkNoResumo = (cardText.match(/Bulk Peça/g) || []).length;
  assert(qtdBulkNoResumo === 2, `orçamento salvo deve conter só os 2 itens que ficaram marcados — obtido menções: ${qtdBulkNoResumo}`);

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== ALGUM TESTE FALHOU ===' : '\n=== TODOS OS TESTES PASSARAM ===');
})();
