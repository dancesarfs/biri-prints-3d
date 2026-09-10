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

  // ---------- 1. asteriscos visíveis nos campos obrigatórios do modal "Adicionar produto" ----------
  await abrirNovoProdutoModal(page);
  const reqCountCalc = (await page.$$('.card .req')).length;
  assert(reqCountCalc >= 5, `modal "Adicionar produto" deve mostrar asterisco em nome/material/impressora/gramatura/tempo — obtido: ${reqCountCalc}`);

  // ---------- 2. tentar salvar peça sem nada preenchido -> erro inline, sem travar ----------
  await page.click('#btnSalvarCatalogo');
  await page.waitForTimeout(80);
  const invalidosCalc = await page.$$eval('.ipt.invalid', els => els.map(e => e.id));
  assert(invalidosCalc.includes('cNome'), `nome vazio deve marcar o campo #cNome como inválido — obtido: ${invalidosCalc.join(', ')}`);
  assert(invalidosCalc.includes('cGram'), `gramatura vazia/zero deve marcar o campo #cGram como inválido — obtido: ${invalidosCalc.join(', ')}`);
  assert(invalidosCalc.includes('cTempoH') && invalidosCalc.includes('cTempoM'), `tempo de máquina zerado deve marcar os campos #cTempoH e #cTempoM como inválidos — obtido: ${invalidosCalc.join(', ')}`);
  const errosVisiveisCalc = (await page.$$('.field-error')).length;
  assert(errosVisiveisCalc >= 3, `devem aparecer mensagens de erro abaixo dos campos inválidos — obtido: ${errosVisiveisCalc}`);
  assert((await page.$('#cNome')) !== null, 'ao falhar a validação, o modal "Adicionar produto" deve continuar aberto (sem fechar como se tivesse salvo)');

  // corrigir o nome deve limpar o erro daquele campo especificamente
  await page.fill('#cNome', 'Peça Validação');
  await page.waitForTimeout(50);
  const cNomeAindaInvalido = await page.$eval('#cNome', el => el.classList.contains('invalid'));
  assert(!cNomeAindaInvalido, 'preencher o nome deve remover o destaque de erro daquele campo');
  const cGramAindaInvalido = await page.$eval('#cGram', el => el.classList.contains('invalid'));
  assert(cGramAindaInvalido, 'campo gramatura deve continuar marcado como inválido até ser preenchido');

  // tocar só no campo de minutos deve limpar o erro dele especificamente — o de horas, que não foi tocado, continua marcado
  await page.fill('#cTempoM', '20');
  await page.waitForTimeout(50);
  const cTempoMInvalidoDepois = await page.$eval('#cTempoM', el => el.classList.contains('invalid'));
  const cTempoHAindaInvalido = await page.$eval('#cTempoH', el => el.classList.contains('invalid'));
  assert(!cTempoMInvalidoDepois, 'preencher o campo de minutos deve limpar o destaque de erro dele');
  assert(cTempoHAindaInvalido, 'campo de horas, que não foi tocado, deve continuar marcado até ser preenchido também');

  // completar o resto e salvar com sucesso
  await page.selectOption('#cMaterial', { index: 0 });
  await page.selectOption('#cImpressora', { index: 0 });
  await page.fill('#cGram', '15');
  await page.fill('#cTempoH', '0');
  await page.fill('#cTempoM', '20');
  await page.waitForTimeout(30);
  await page.click('#btnSalvarCatalogo');
  await page.waitForSelector('.item-card');
  // catálogo já começa com 1 peça seed ("TESTE"); depois de salvar deve ter mais uma
  const nomesCatalogo = await page.$$eval('.item-card h3', els => els.map(e => e.textContent.trim()));
  assert(nomesCatalogo.includes('Peça Validação'), `depois de preencher tudo, a peça deve ser salva no catálogo — obtido: ${nomesCatalogo.join(', ')}`);

  // ---------- 3. editor de peça: mesmas validações ----------
  await page.click('[data-edit]');
  await page.waitForSelector('#epNome');
  await page.fill('#epNome', '');
  await page.fill('#epGram', '0');
  await page.fill('#epTempoH', '0');
  await page.fill('#epTempoM', '0');
  await page.click('#epSave');
  await page.waitForTimeout(80);
  const invalidosEp = await page.$$eval('.ipt.invalid', els => els.map(e => e.id));
  assert(invalidosEp.includes('epNome') && invalidosEp.includes('epGram'), `editor de peça deve marcar nome e gramatura inválidos — obtido: ${invalidosEp.join(', ')}`);
  assert(invalidosEp.includes('epTempoH') && invalidosEp.includes('epTempoM'), `editor de peça deve marcar tempo de máquina zerado como inválido — obtido: ${invalidosEp.join(', ')}`);
  await page.evaluate(() => { const el = document.getElementById('modalBackdrop'); if (el) el.remove(); });

  // ---------- 4. material: preço/kg obrigatório ----------
  await abrirAba(page, 'admin-materiais');
  await page.waitForSelector('#btnAddMat');
  await page.click('#btnAddMat');
  await page.waitForSelector('#mNome');
  const reqCountMat = (await page.$$('.req')).length;
  assert(reqCountMat >= 2, `formulário de material deve marcar nome e preço/kg como obrigatórios — obtido: ${reqCountMat}`);
  await page.fill('#mNome', 'Material Teste');
  await page.click('#mSave');
  await page.waitForTimeout(80);
  const mPrecoInvalido = await page.$eval('#mPreco', el => el.classList.contains('invalid'));
  assert(mPrecoInvalido, 'salvar material sem preço/kg deve marcar o campo #mPreco como inválido');
  await page.evaluate(() => { const el = document.getElementById('modalBackdrop'); if (el) el.remove(); });

  // ---------- 5. impressora: preço/potência/vida útil obrigatórios ----------
  await abrirAba(page, 'admin-impressoras');
  await page.waitForSelector('#btnAddImp');
  await page.click('#btnAddImp');
  await page.waitForSelector('#iNome');
  await page.fill('#iNome', 'Impressora Teste');
  await page.click('#iSave');
  await page.waitForTimeout(80);
  const invalidosImp = await page.$$eval('.ipt.invalid', els => els.map(e => e.id));
  assert(invalidosImp.includes('iPreco') && invalidosImp.includes('iPotencia') && invalidosImp.includes('iVidaUtil'),
    `salvar impressora sem preço/potência/vida útil deve marcar os 3 campos como inválidos — obtido: ${invalidosImp.join(', ')}`);
  // preencher só potência não deve limpar os outros dois
  await page.fill('#iPotencia', '0.1');
  await page.waitForTimeout(50);
  const iPrecoAindaInvalido = await page.$eval('#iPreco', el => el.classList.contains('invalid'));
  const iPotenciaAindaInvalido = await page.$eval('#iPotencia', el => el.classList.contains('invalid'));
  assert(iPrecoAindaInvalido, 'campo preço da impressora deve continuar inválido — só o campo editado (potência) deve limpar');
  assert(!iPotenciaAindaInvalido, 'campo potência deve limpar o erro assim que preenchido');
  await page.evaluate(() => { const el = document.getElementById('modalBackdrop'); if (el) el.remove(); });

  // ---------- 6. grupo de kit: nome e mínimo de 2 produtos ----------
  await abrirAba(page, 'admin-grupos');
  await page.waitForSelector('#btnAddGrupo');
  await page.click('#btnAddGrupo');
  await page.waitForSelector('#gNome');
  await page.click('#gSave');
  await page.waitForTimeout(80);
  const gNomeInvalido = await page.$eval('#gNome', el => el.classList.contains('invalid'));
  const avisoProdutos = (await page.textContent('#gProdutosErro')).trim();
  assert(gNomeInvalido, 'salvar grupo sem nome deve marcar o campo #gNome como inválido');
  assert(avisoProdutos.includes('pelo menos 2'), `salvar grupo com menos de 2 produtos deve mostrar aviso — obtido: "${avisoProdutos}"`);
  await page.evaluate(() => { const el = document.getElementById('modalBackdrop'); if (el) el.remove(); });

  // ---------- 7. promoção: nome, grupo e período obrigatórios ----------
  await abrirAba(page, 'admin-promocoes');
  await page.waitForSelector('#btnAddPromo');
  await page.click('#btnAddPromo');
  await page.waitForSelector('#pNome');
  await page.click('#pSave');
  await page.waitForTimeout(80);
  const invalidosPromo = await page.$$eval('.ipt.invalid, select.invalid', els => els.map(e => e.id));
  assert(invalidosPromo.includes('pNome'), `salvar promoção sem nome deve marcar #pNome como inválido — obtido: ${invalidosPromo.join(', ')}`);
  assert(invalidosPromo.includes('pInicio') && invalidosPromo.includes('pFim'), `salvar promoção sem período deve marcar #pInicio e #pFim como inválidos — obtido: ${invalidosPromo.join(', ')}`);
  await page.evaluate(() => { const el = document.getElementById('modalBackdrop'); if (el) el.remove(); });

  // ---------- 8. orçamento: item avulso sem nome/preço ----------
  await abrirAba(page, 'orcamentos'); // Orçamentos
  await page.waitForSelector('#fabNovoOrc');
  await page.click('#fabNovoOrc');
  await page.waitForSelector('#oAddItem');
  await page.click('#oAddItem');
  await page.waitForTimeout(80);
  const invalidosOrc = await page.$$eval('.ipt.invalid', els => els.map(e => e.id));
  assert(invalidosOrc.includes('oAvulsoNome') && invalidosOrc.includes('oAvulsoPreco'),
    `adicionar item avulso sem nome/preço deve marcar os dois campos como inválidos — obtido: ${invalidosOrc.join(', ')}`);
  const itensNaLista = (await page.$$('#oItensList .list-line')).length;
  assert(itensNaLista === 0, 'nenhum item avulso inválido deve ter sido adicionado à lista');

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== ALGUM TESTE FALHOU ===' : '\n=== TODOS OS TESTES PASSARAM ===');
})();
