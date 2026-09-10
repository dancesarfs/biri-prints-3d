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

  // ---- Fase 1: puramente unitária, injetando cenários direto na função calcularDescontosKit ----
  // Isso valida o algoritmo (seleção de faixa por produtos distintos, não-empilhamento,
  // janela de datas da promoção) isolado da UI, com controle total sobre "hoje".
  const resultados = await page.evaluate(() => {
    const out = {};

    // grupo "Canecas" com 4 produtos; grupo "Chaveiros" com 2 produtos, compartilhando 1 produto com Canecas
    const grupos = [
      {id:'g1', nome:'Canecas Professor', produto_ids:['p1','p2','p3','p4']},
      {id:'g2', nome:'Combo Chaveiro', produto_ids:['p1','p5']},
    ];

    // promo1: ativa hoje, no grupo g1, tiers padrão 2->5%, 4->10%
    // promo2: ativa hoje, no grupo g2, tier único 2->8% (melhor que os 5% que p1 teria via g1 com só 2 itens)
    const promocoes = [
      {id:'promo1', nome:'Dia dos Professores', grupo_id:'g1', data_inicio:'2026-01-01', data_fim:'2026-12-31', tiers:[{min_itens:2, desconto_pct:5},{min_itens:4, desconto_pct:10}]},
      {id:'promo2', nome:'Combo Chaveiro Promo', grupo_id:'g2', data_inicio:'2026-01-01', data_fim:'2026-12-31', tiers:[{min_itens:2, desconto_pct:8}]},
      {id:'promo3', nome:'Fora de época', grupo_id:'g1', data_inicio:'2020-01-01', data_fim:'2020-12-31', tiers:[{min_itens:2, desconto_pct:50}]},
    ];

    const hoje = '2026-09-07';

    // Cenário A: só 2 produtos distintos do grupo g1 (p1,p2) -> tier de 5%
    out.duasPecas = calcularDescontosKit(
      [{produto_id:'p1', nome:'Caneca A', preco_unit:20, quantidade:1}, {produto_id:'p2', nome:'Caneca B', preco_unit:30, quantidade:1}],
      grupos, promocoes, hoje
    );

    // Cenário B: 4 produtos distintos do grupo g1 (p1..p4) -> tier de 10% (mais itens = desconto maior)
    out.quatroPecas = calcularDescontosKit(
      [
        {produto_id:'p1', nome:'Caneca A', preco_unit:20, quantidade:1},
        {produto_id:'p2', nome:'Caneca B', preco_unit:30, quantidade:1},
        {produto_id:'p3', nome:'Caneca C', preco_unit:25, quantidade:2},
        {produto_id:'p4', nome:'Caneca D', preco_unit:15, quantidade:1},
      ],
      grupos, promocoes, hoje
    );

    // Cenário C: só 1 produto do grupo (p1 sozinho) -> nenhuma faixa se aplica, desconto 0
    out.umaPeca = calcularDescontosKit(
      [{produto_id:'p1', nome:'Caneca A', preco_unit:20, quantidade:1}],
      grupos, promocoes, hoje
    );

    // Cenário D: item avulso (sem produto_id) nunca entra na conta do kit
    out.comAvulso = calcularDescontosKit(
      [
        {produto_id:'p1', nome:'Caneca A', preco_unit:20, quantidade:1},
        {produto_id:'p2', nome:'Caneca B', preco_unit:30, quantidade:1},
        {nome:'Adesivo avulso', preco_unit:5, quantidade:3},
      ],
      grupos, promocoes, hoje
    );

    // Cenário E: não-empilhamento — p1 pertence a g1 (2 itens presentes -> 5%) E a g2 (2 itens presentes -> 8%).
    // Deve aplicar só o MELHOR desconto (8%) sobre p1, nunca os dois somados.
    out.naoEmpilha = calcularDescontosKit(
      [
        {produto_id:'p1', nome:'Caneca A', preco_unit:20, quantidade:1},
        {produto_id:'p2', nome:'Caneca B', preco_unit:30, quantidade:1},
        {produto_id:'p5', nome:'Chaveiro X', preco_unit:10, quantidade:1},
      ],
      grupos, promocoes, hoje
    );

    // Cenário F: promoção fora do período de vigência (promo3, ano 2020) não deve valer, mesmo com desconto de 50% cadastrado
    out.promoEncerrada = { status: promocaoStatus(promocoes[2], hoje) };

    // Cenário G: promoção agendada para o futuro
    out.promoAgendada = { status: promocaoStatus({data_inicio:'2027-01-01', data_fim:'2027-12-31'}, hoje) };
    out.promoAtivaAgora = { status: promocaoStatus({data_inicio:'2026-01-01', data_fim:'2026-12-31'}, hoje) };

    return out;
  });

  // Cenário A: 2 produtos -> tier 5%, sobre (20+30)=50 => desconto 2.50
  assert(Math.abs(resultados.duasPecas.total - 2.5) < 0.001, `kit de 2 produtos distintos deve aplicar 5% (esperado 2.50) — obtido: ${resultados.duasPecas.total}`);
  assert(resultados.duasPecas.linhas.length === 1 && resultados.duasPecas.linhas[0].pct === 5, 'kit de 2 produtos deve gerar 1 linha de desconto de 5%');

  // Cenário B: 4 produtos distintos -> tier 10%, subtotal = 20+30+50+15=115 => desconto 11.5
  const subtotalB = 20+30+50+15;
  assert(Math.abs(resultados.quatroPecas.total - subtotalB*0.10) < 0.001, `kit de 4 produtos distintos deve aplicar 10% (esperado ${(subtotalB*0.10).toFixed(2)}) — obtido: ${resultados.quatroPecas.total}`);
  assert(resultados.quatroPecas.linhas[0].pct === 10, 'kit de 4 produtos deve usar a faixa de 10%, não a de 5%');

  // Cenário C: 1 produto só -> nenhum desconto (abaixo do menor tier de 2)
  assert(resultados.umaPeca.total === 0, `1 produto isolado não deve ter desconto de kit — obtido: ${resultados.umaPeca.total}`);
  assert(resultados.umaPeca.linhas.length === 0, '1 produto isolado não deve gerar linhas de desconto');

  // Cenário D: item avulso não conta para o kit nem recebe desconto
  assert(Math.abs(resultados.comAvulso.total - 2.5) < 0.001, `item avulso não deve alterar o desconto do kit (esperado 2.50) — obtido: ${resultados.comAvulso.total}`);

  // Cenário E: não deve empilhar — p1 e p5 (grupo g2, 2 itens) => 8% sobre (20+10)=30 => 2.40
  //            p1 e p2 (grupo g1) teriam dado 5%, mas o algoritmo deve escolher, PARA O ITEM p1, o melhor entre os combos que o incluem
  const linhaG2 = resultados.naoEmpilha.linhas.find(l=>l.promoNome==='Combo Chaveiro Promo');
  const linhaG1 = resultados.naoEmpilha.linhas.find(l=>l.promoNome==='Dia dos Professores');
  assert(linhaG2 !== undefined, 'deve haver uma linha de desconto do combo chaveiro (8%) vencendo para p1 e p5');
  assert(linhaG2 && linhaG2.itens.includes('Caneca A') && linhaG2.itens.includes('Chaveiro X'), 'a linha do combo chaveiro deve incluir Caneca A e Chaveiro X');
  assert(linhaG1 !== undefined && linhaG1.itens.length === 1 && linhaG1.itens[0]==='Caneca B', 'Caneca B (não está no combo chaveiro) deve ficar só com o desconto de 5% do grupo Canecas');
  const totalEsperadoE = (20+10)*0.08 + 30*0.05; // p1+p5 a 8%, p2 sozinho a 5%
  assert(Math.abs(resultados.naoEmpilha.total - totalEsperadoE) < 0.001, `não deve empilhar desconto sobre p1 — esperado ${totalEsperadoE.toFixed(2)}, obtido: ${resultados.naoEmpilha.total}`);

  // Cenário F/G: promocaoStatus por janela de datas
  assert(resultados.promoEncerrada.status === 'encerrada', 'promoção com data_fim no passado deve estar "encerrada"');
  assert(resultados.promoAgendada.status === 'agendada', 'promoção com data_inicio no futuro deve estar "agendada"');
  assert(resultados.promoAtivaAgora.status === 'ativa', 'promoção com hoje dentro do período deve estar "ativa"');

  // ---- Fase 2: fluxo real na UI — cadastra um grupo e uma promoção, monta um orçamento e confere o desconto na tela ----
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
  await criarPeca('Kit Peça 1', 20, 20);
  await criarPeca('Kit Peça 2', 25, 25);
  await criarPeca('Kit Peça 3', 30, 30);

  // vai em Admin > Grupos de kit e cria o grupo com as 3 peças novas
  await abrirAba(page, 'admin-grupos');
  await page.waitForSelector('#btnAddGrupo');
  await page.click('#btnAddGrupo');
  await page.waitForSelector('#gNome');
  await page.fill('#gNome', 'Grupo Teste Kit');
  const gCheckboxes = await page.$$('.grupo-prod-chk');
  // marca as 3 últimas (as recém-criadas) — pega pelo texto do label
  const labels = await page.$$eval('label:has(.grupo-prod-chk)', els => els.map(e=>e.textContent.trim()));
  for (let i = 0; i < labels.length; i++) {
    if (/Kit Peça [123]/.test(labels[i])) {
      await gCheckboxes[i].check();
    }
  }
  await page.click('#gSave');
  await page.waitForTimeout(200);

  const grupoCardCount = (await page.$$('#grupoList .item-card')).length;
  assert(grupoCardCount === 1, `deveria existir 1 grupo cadastrado — obtido: ${grupoCardCount}`);

  // cria a promoção vinculada a esse grupo, vigente hoje — Grupos e Promoções são submenus
  // separados dentro de Admin, então precisa navegar de novo pra chegar em Promoções
  await abrirAba(page, 'admin-promocoes');
  await page.waitForSelector('#btnAddPromo');
  await page.click('#btnAddPromo');
  await page.waitForSelector('#pNome');
  await page.fill('#pNome', 'Promo Teste Vigente');
  await page.selectOption('#pGrupo', { label: 'Grupo Teste Kit' });
  const hojeStr = new Date().toISOString().slice(0,10);
  const amanhaStr = new Date(Date.now() + 30*86400000).toISOString().slice(0,10);
  await page.fill('#pInicio', hojeStr);
  await page.fill('#pFim', amanhaStr);
  await page.click('#pSave');
  await page.waitForTimeout(200);

  const promoCards = await page.$$('#promoList .item-card');
  assert(promoCards.length === 1, `deveria existir 1 promoção cadastrada — obtido: ${promoCards.length}`);
  const promoBadge = (await page.textContent('#promoList .badge')).trim();
  assert(promoBadge === 'Ativa', `promoção vigente hoje deveria mostrar badge "Ativa" — obtido: "${promoBadge}"`);

  // monta um orçamento com as 3 peças do grupo -> deve detectar kit de 3 (>=2 e <4 => 5% pela faixa padrão)
  await abrirAba(page, 'orcamentos'); // Orçamentos
  await page.waitForSelector('#fabNovoOrc');
  await page.click('#fabNovoOrc');
  await page.waitForSelector('#oProdSel');

  for (const nome of ['Kit Peça 1','Kit Peça 2','Kit Peça 3']) {
    await page.selectOption('#oProdSel', { label: nome });
    await page.fill('#oQtd', '1');
    await page.click('#oAddItem');
    await page.waitForTimeout(30);
  }

  const kitBoxText = (await page.textContent('#oKitDescontos')).trim();
  console.log('Caixa de desconto de kit no orçamento:', kitBoxText);
  assert(kitBoxText.includes('Desconto de kit detectado'), 'orçamento com as 3 peças do grupo deve mostrar a caixa de desconto de kit');
  assert(kitBoxText.includes('5%'), `orçamento com 3 produtos (faixa padrão 2-3) deveria aplicar 5% — obtido: ${kitBoxText}`);

  const subtotalRowVisible = await page.$eval('#oSubtotalRow', el => getComputedStyle(el).display !== 'none');
  assert(subtotalRowVisible, 'linha de subtotal deve aparecer quando há desconto de kit');

  const subtotalTxt = (await page.textContent('#oSubtotal')).trim();
  const totalTxt = (await page.textContent('#oTotal')).trim();
  console.log('Subtotal:', subtotalTxt, '| Total (com desconto):', totalTxt);
  assert(subtotalTxt !== totalTxt, 'total deve ser menor que o subtotal quando o desconto de kit é aplicado');

  await page.click('#oSalvar');
  await page.waitForTimeout(200);

  // confere que o orçamento salvo mostra a linha de desconto ao expandir
  await page.waitForSelector('.card');
  await page.click('[data-toggle-orc]');
  await page.waitForTimeout(100);
  const orcExpandedText = await page.textContent('.card');
  assert(orcExpandedText.includes('Desconto de kit'), 'orçamento salvo e expandido deve mostrar a linha de desconto de kit');
  assert(orcExpandedText.includes('Subtotal (sem desconto)'), 'orçamento salvo e expandido, com desconto de kit, deve mostrar a linha de "Subtotal (sem desconto)"');

  // a linha de subtotal precisa vir ANTES da linha de desconto, não depois
  const linhasOrc = await page.$$eval('.card.expanded .list-line', els => els.map(e => e.textContent));
  const idxSubtotalOrc = linhasOrc.findIndex(t => t.includes('Subtotal (sem desconto)'));
  const idxDescontoOrc = linhasOrc.findIndex(t => t.includes('Desconto de kit'));
  assert(idxSubtotalOrc !== -1 && idxDescontoOrc !== -1 && idxSubtotalOrc < idxDescontoOrc, `linha de subtotal deve aparecer antes da linha de desconto no orçamento — ordem obtida: ${linhasOrc.join(' | ')}`);

  // converte em pedido e confere que a mesma ordem (subtotal antes do desconto) aparece na aba Pedidos
  await page.click('[data-converter-pedido]');
  await page.waitForTimeout(80);
  await page.click('[data-converter-pedido]');
  await page.waitForTimeout(150);
  await abrirAba(page, 'pedidos'); // Pedidos
  await page.waitForSelector('#pedList .card');
  await page.click('[data-toggle-orc]');
  await page.waitForTimeout(100);
  const linhasPed = await page.$$eval('#pedList .card.expanded .list-line', els => els.map(e => e.textContent));
  const idxSubtotalPed = linhasPed.findIndex(t => t.includes('Subtotal (sem desconto)'));
  const idxDescontoPed = linhasPed.findIndex(t => t.includes('Desconto de kit'));
  assert(idxSubtotalPed !== -1 && idxDescontoPed !== -1 && idxSubtotalPed < idxDescontoPed, `linha de subtotal deve aparecer antes da linha de desconto no pedido — ordem obtida: ${linhasPed.join(' | ')}`);

  // orçamento SEM desconto (item avulso comum) não deve mostrar a linha de subtotal — seria redundante
  // com o total já exibido no topo do card
  await abrirAba(page, 'orcamentos'); // Orçamentos
  await page.waitForSelector('#fabNovoOrc');
  await page.click('#fabNovoOrc');
  await page.waitForSelector('#oProdSel');
  await page.selectOption('#oProdSel', { label: 'Kit Peça 1' });
  await page.click('#oAddItem');
  await page.click('#oSalvar');
  await page.waitForTimeout(150);
  await page.click('[data-toggle-orc]'); // o mais recente é o primeiro da lista
  await page.waitForTimeout(100);
  const semDescontoText = await page.textContent('.card.expanded');
  assert(!semDescontoText.includes('Subtotal (sem desconto)'), 'orçamento sem desconto de kit não deve mostrar a linha de subtotal (seria redundante com o total)');

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== ALGUM TESTE FALHOU ===' : '\n=== TODOS OS TESTES PASSARAM ===');
})();
