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

  // ---------- 1. cadastrar uma nova impressora em Ajustes ----------
  await abrirAba(page, 'admin-impressoras');
  await page.waitForSelector('#btnAddImp');

  const impCountInicial = (await page.$$('#impList .item-card')).length;
  assert(impCountInicial === 1, `deveria começar com 1 impressora (seed Bambu Lab A1) — obtido: ${impCountInicial}`);

  await page.click('#btnAddImp');
  await page.waitForSelector('#iNome');
  await page.fill('#iNome', 'Creality Ender 3');
  await page.fill('#iMarca', 'Creality');
  await page.fill('#iModelo', 'Ender 3');
  await page.fill('#iPreco', '1200');
  await page.fill('#iPotencia', '0.15');
  await page.fill('#iVidaUtil', '2000');
  await page.click('#iSave');
  await page.waitForTimeout(150);

  const impCards = await page.$$eval('#impList .item-card h3', els => els.map(e => e.textContent.trim()));
  assert(impCards.includes('Creality Ender 3'), `impressora nova deve aparecer na lista de Ajustes — obtido: ${impCards.join(', ')}`);
  assert(impCards.length === 2, `deveriam existir 2 impressoras cadastradas — obtido: ${impCards.length}`);

  // ---------- 2. selecionar impressora ao criar peça na Calculadora ----------
  await abrirNovoProdutoModal(page);

  const cImpOptions = await page.$$eval('#cImpressora option', els => els.map(e => e.textContent.trim()));
  assert(cImpOptions.length === 2 && cImpOptions.includes('Creality Ender 3') && cImpOptions.includes('Bambu Lab A1'),
    `seletor de impressora na calculadora deve listar as 2 impressoras — obtido: ${cImpOptions.join(', ')}`);

  await page.fill('#cNome', 'Impressora Peça A');
  await page.selectOption('#cMaterial', { index: 0 });
  await page.selectOption('#cImpressora', { label: 'Creality Ender 3' });
  await page.fill('#cGram', '20');
  await page.fill('#cTempoH', '0');
  await page.fill('#cTempoM', '30');
  await page.fill('#cEmb', '0');
  await page.waitForTimeout(30);
  await page.click('#btnSalvarCatalogo');
  await page.waitForSelector('.item-card');

  const cardMeta = await page.$eval('.item-card', el => el.textContent);
  assert(cardMeta.includes('Creality Ender 3'), `card da peça salva deve mostrar a impressora escolhida (Creality Ender 3) — obtido meta: ${cardMeta}`);

  // ---------- 3. editar peça existente trocando a impressora padrão ----------
  await page.click('[data-edit]');
  await page.waitForSelector('#epImpressora');
  const epImpSelecionadaAntes = await page.$eval('#epImpressora', el => el.options[el.selectedIndex].textContent.trim());
  assert(epImpSelecionadaAntes === 'Creality Ender 3', `editor deve abrir com a impressora atual selecionada — obtido: ${epImpSelecionadaAntes}`);

  await page.selectOption('#epImpressora', { label: 'Bambu Lab A1' });
  await page.click('#epSave');
  await page.waitForTimeout(150);

  const cardMetaDepois = await page.$eval('.item-card', el => el.textContent);
  assert(cardMetaDepois.includes('Bambu Lab A1') && !cardMetaDepois.includes('Creality Ender 3'),
    `após trocar a impressora padrão e salvar, o card deve refletir Bambu Lab A1 — obtido: ${cardMetaDepois}`);

  // ---------- 4. adicionar um perfil de impressora alternativa e confirmar round-trip ----------
  await page.click('[data-edit]');
  await page.waitForSelector('#epImpressora');
  await page.click('#epAddPerfil');
  await page.waitForSelector('.perfil-imp');

  await page.selectOption('.perfil-imp', { label: 'Creality Ender 3' });
  await page.fill('.perfil-gram', '35');
  await page.fill('.perfil-h', '1');
  await page.fill('.perfil-m', '10');
  await page.click('#epSave');
  await page.waitForTimeout(150);

  await page.click('[data-edit]');
  await page.waitForSelector('#epImpressora');
  const perfilRowsAposReabrir = await page.$$('.perfil-imp');
  assert(perfilRowsAposReabrir.length === 1, `perfil cadastrado deve reaparecer ao reabrir o editor — obtido: ${perfilRowsAposReabrir.length}`);
  const perfilImpLabel = await page.$eval('.perfil-imp', el => el.options[el.selectedIndex].textContent.trim());
  const perfilGramVal = await page.inputValue('.perfil-gram');
  const perfilHVal = await page.inputValue('.perfil-h');
  const perfilMVal = await page.inputValue('.perfil-m');
  assert(perfilImpLabel === 'Creality Ender 3', `perfil salvo deve ser da impressora Creality Ender 3 — obtido: ${perfilImpLabel}`);
  assert(perfilGramVal === '35', `perfil salvo deve manter a gramatura 35g — obtido: ${perfilGramVal}`);
  assert(perfilHVal === '1' && perfilMVal === '10', `perfil salvo deve manter o tempo 1h10min — obtido: ${perfilHVal}h${perfilMVal}min`);
  await page.evaluate(() => { const el = document.getElementById('modalBackdrop'); if (el) el.remove(); });

  // ---------- 5. no orçamento, trocar a impressora de um item usando o perfil já cadastrado ----------
  await page.click('[data-add-orc]');
  await page.waitForSelector('#oItensList .list-line');

  const toggleTextAntes = (await page.textContent('[data-toggle-imp]')).trim();
  assert(toggleTextAntes.includes('Bambu Lab A1'), `toggle do item deve mostrar a impressora padrão da peça (Bambu Lab A1) — obtido: ${toggleTextAntes}`);

  const precoAntesTrocar = (await page.textContent('#oTotal')).trim();

  await page.click('[data-toggle-imp]');
  await page.waitForSelector('#itImp0');
  const itGramAntes = await page.inputValue('#itGram0');
  assert(itGramAntes === '20', `form de troca de impressora deve abrir pré-preenchido com os dados padrão da peça (20g) — obtido: ${itGramAntes}`);

  await page.selectOption('#itImp0', { label: 'Creality Ender 3' });
  await page.waitForTimeout(50);
  const itGramDepoisTrocarSelect = await page.inputValue('#itGram0');
  const itHDepois = await page.inputValue('#itH0');
  const itMDepois = await page.inputValue('#itM0');
  assert(itGramDepoisTrocarSelect === '35', `ao selecionar uma impressora com perfil salvo, a gramatura deve vir do perfil (35g) — obtido: ${itGramDepoisTrocarSelect}`);
  assert(itHDepois === '1' && itMDepois === '10', `ao selecionar uma impressora com perfil salvo, o tempo deve vir do perfil (1h10min) — obtido: ${itHDepois}h${itMDepois}min`);

  await page.click('[data-aplicar-imp]');
  await page.waitForTimeout(100);

  const precoDepoisTrocar = (await page.textContent('#oTotal')).trim();
  assert(precoDepoisTrocar !== precoAntesTrocar, `aplicar a troca de impressora (com gramatura/tempo diferentes) deve recalcular o total do orçamento — antes: ${precoAntesTrocar}, depois: ${precoDepoisTrocar}`);

  const toggleTextDepois = (await page.textContent('[data-toggle-imp]')).trim();
  assert(toggleTextDepois.includes('Creality Ender 3'), `após aplicar, o toggle do item deve mostrar a nova impressora escolhida — obtido: ${toggleTextDepois}`);

  await page.evaluate(() => { const el = document.getElementById('modalBackdrop'); if (el) el.remove(); });

  // ---------- 6. "salvar como padrão dessa peça nessa impressora" ----------
  // cria uma peça nova, sem perfil pra Creality, pra testar o fluxo de salvar-como-padrão do zero
  await abrirNovoProdutoModal(page);
  await page.fill('#cNome', 'Impressora Peça B');
  await page.selectOption('#cMaterial', { index: 0 });
  await page.selectOption('#cImpressora', { label: 'Bambu Lab A1' });
  await page.fill('#cGram', '10');
  await page.fill('#cTempoH', '0');
  await page.fill('#cTempoM', '15');
  await page.fill('#cEmb', '0');
  await page.waitForTimeout(30);
  await page.click('#btnSalvarCatalogo');
  await page.waitForSelector('.item-card');

  // abre orçamento a partir dessa peça específica (o card mais recente é o primeiro, peças novas são prependadas)
  const addOrcBtns = await page.$$('[data-add-orc]');
  await addOrcBtns[0].click();
  await page.waitForSelector('#oItensList .list-line');

  const nomeItemNoOrc = (await page.textContent('#oItensList .list-line')).trim();
  assert(nomeItemNoOrc.includes('Impressora Peça B'), `orçamento criado a partir do card mais recente deve conter "Impressora Peça B" — obtido: ${nomeItemNoOrc}`);

  await page.click('[data-toggle-imp]');
  await page.waitForSelector('#itImp0');
  await page.selectOption('#itImp0', { label: 'Creality Ender 3' });
  await page.waitForTimeout(50);
  // sem perfil salvo ainda pra essa peça+Creality, os campos devem cair pros valores padrão da própria peça
  const itGramSemPerfil = await page.inputValue('#itGram0');
  assert(itGramSemPerfil === '10', `sem perfil salvo pra essa combinação peça+impressora, deve usar os valores padrão da peça (10g) — obtido: ${itGramSemPerfil}`);

  await page.fill('#itGram0', '18');
  await page.fill('#itH0', '0');
  await page.fill('#itM0', '40');
  await page.check('#itSalvarPerfil0');
  await page.click('[data-aplicar-imp]');
  await page.waitForTimeout(100);

  // reabre o form de troca de impressora do mesmo item, volta pra Bambu (padrão) e novamente pra Creality
  // pra confirmar que o perfil ficou salvo e agora vem pré-preenchido
  await page.click('[data-toggle-imp]');
  await page.waitForSelector('#itImp0');
  await page.selectOption('#itImp0', { label: 'Bambu Lab A1' });
  await page.waitForTimeout(50);
  await page.selectOption('#itImp0', { label: 'Creality Ender 3' });
  await page.waitForTimeout(50);
  const itGramAposSalvarPadrao = await page.inputValue('#itGram0');
  const itHAposSalvarPadrao = await page.inputValue('#itH0');
  const itMAposSalvarPadrao = await page.inputValue('#itM0');
  assert(itGramAposSalvarPadrao === '18', `após marcar "salvar como padrão" e aplicar, o perfil deve persistir e vir pré-preenchido (18g) — obtido: ${itGramAposSalvarPadrao}`);
  assert(itHAposSalvarPadrao === '0' && itMAposSalvarPadrao === '40', `após marcar "salvar como padrão", o tempo salvo deve vir pré-preenchido (0h40min) — obtido: ${itHAposSalvarPadrao}h${itMAposSalvarPadrao}min`);

  await page.evaluate(() => { const el = document.getElementById('modalBackdrop'); if (el) el.remove(); });

  // confirma também que o editor de peça (não só o orçamento) reflete o perfil recém-salvo
  await page.click('[data-edit]');
  await page.waitForSelector('#epImpressora');
  const perfilRowsPecaB = await page.$$eval('.perfil-imp', els => els.map(e => e.options[e.selectedIndex].textContent.trim()));
  assert(perfilRowsPecaB.includes('Creality Ender 3'), `editor da peça B deve mostrar o perfil salvo via orçamento pra Creality Ender 3 — obtido: ${perfilRowsPecaB.join(', ')}`);
  await page.evaluate(() => { const el = document.getElementById('modalBackdrop'); if (el) el.remove(); });

  // ---------- 7. excluir uma impressora usada como padrão por uma peça -> card dessa peça deve indicar "impressora removida" ----------
  // cria uma peça dedicada com a Creality como impressora padrão (as peças A e B tiveram seu padrão trocado/mantido em Bambu Lab A1 nos passos anteriores)
  await abrirNovoProdutoModal(page);
  await page.fill('#cNome', 'Impressora Peça C');
  await page.selectOption('#cMaterial', { index: 0 });
  await page.selectOption('#cImpressora', { label: 'Creality Ender 3' });
  await page.fill('#cGram', '12');
  await page.fill('#cTempoH', '0');
  await page.fill('#cTempoM', '20');
  await page.fill('#cEmb', '0');
  await page.waitForTimeout(30);
  await page.click('#btnSalvarCatalogo');
  await page.waitForSelector('.item-card');

  await abrirAba(page, 'admin-impressoras');
  await page.waitForSelector('#impList');
  const delImpBtns = await page.$$('[data-del-imp]');
  // exclui a impressora "Creality Ender 3" (a segunda cadastrada) — botão exige clicar 2x (confirmar)
  const impLabels = await page.$$eval('#impList .item-card h3', els => els.map(e => e.textContent.trim()));
  const idxCreality = impLabels.indexOf('Creality Ender 3');
  assert(idxCreality !== -1, 'deve existir a impressora Creality Ender 3 pra excluir');
  await delImpBtns[idxCreality].click();
  await page.waitForTimeout(80);
  await delImpBtns[idxCreality].click();
  await page.waitForTimeout(150);

  await abrirAba(page, 'catalogo'); // Catálogo
  await page.waitForSelector('.item-card');
  const cardTextoPecaC = await page.$$eval('.item-card', els => {
    const card = els.find(e => e.textContent.includes('Impressora Peça C'));
    return card ? card.textContent : null;
  });
  assert(cardTextoPecaC && cardTextoPecaC.includes('impressora removida'), `peça C (cuja impressora padrão foi excluída) deve indicar "impressora removida" no catálogo — obtido: ${cardTextoPecaC}`);
  const cardTextoPecaA = await page.$$eval('.item-card', els => {
    const card = els.find(e => e.textContent.includes('Impressora Peça A'));
    return card ? card.textContent : null;
  });
  assert(cardTextoPecaA && cardTextoPecaA.includes('Bambu Lab A1') && !cardTextoPecaA.includes('impressora removida'),
    `peças que não usavam a impressora excluída como padrão não devem ser afetadas — obtido: ${cardTextoPecaA}`);

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== ALGUM TESTE FALHOU ===' : '\n=== TODOS OS TESTES PASSARAM ===');
})();
