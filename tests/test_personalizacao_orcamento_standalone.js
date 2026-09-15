// Testa a Etapa 2 de "cores personalizáveis": a escolha de cor/texto por UNIDADE dentro de um
// orçamento (a "matriz" unidade × parte personalizável), o bloqueio da conversão em pedido quando
// falta preencher, o atalho "Aplicar a todas as unidades", o resumo exibido em Orçamentos/Pedidos,
// o bloco especial (só) na mensagem de WhatsApp de "pedido recebido", e o reset ao copiar orçamento.
// Só na standalone (app/biri-prints-3d-standalone.html), única versão que recebe funcionalidade nova.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { passarPeloGateVendedorStandalone, abrirAbaStandalone, abrirNovoProdutoModalStandalone } = require('./test_helpers_standalone');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('OK:', msg);
}

const FAKE_FIREBASE_JS = fs.readFileSync(path.resolve(__dirname, 'fake_firebase.js'), 'utf8');
const fileUrl = 'file://' + path.resolve(__dirname, '..', 'app', 'biri-prints-3d-standalone.html');

async function novaPagina(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const context = page.context();
  await context.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await context.route('https://wa.me/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html>ok</html>' }));
  await context.route('https://api.whatsapp.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html>ok</html>' }));
  await page.addInitScript(FAKE_FIREBASE_JS);
  await page.goto(fileUrl);
  await page.waitForSelector('#loginScreen');
  await page.fill('#loginEmail', 'dono@teste.com');
  await page.fill('#loginSenha', 'senha123');
  await page.click('#loginBtn');
  await page.waitForSelector('#sidebarNav [data-nav]');
  await passarPeloGateVendedorStandalone(page);
  return page;
}

async function valorDoOptionPorTexto(page, selectId, textoParcial) {
  return page.evaluate(({ selectId, textoParcial }) => {
    const opt = [...document.getElementById(selectId).options].find(o => o.textContent.startsWith(textoParcial));
    return opt ? opt.value : null;
  }, { selectId, textoParcial });
}

async function addMaterial(page, nome) {
  await abrirAbaStandalone(page, 'admin-materiais');
  await page.click('#fabAddMaterial');
  await page.waitForSelector('#mNome');
  await page.fill('#mNome', nome);
  await page.fill('#mPreco', '100');
  await page.click('#mSave');
  await page.waitForTimeout(150);
}

async function addImpressora(page, nome) {
  await abrirAbaStandalone(page, 'admin-impressoras');
  await page.click('#fabAddImpressora');
  await page.waitForSelector('#iNome');
  await page.fill('#iNome', nome);
  await page.fill('#iPreco', '3000');
  await page.fill('#iPotencia', '0.1');
  await page.fill('#iVidaUtil', '2000');
  await page.click('#iSave');
  await page.waitForTimeout(150);
}

async function addCor(page, nome, materialNome) {
  await abrirAbaStandalone(page, 'admin-cores');
  await page.waitForSelector('#fabAddCor');
  await page.click('#fabAddCor');
  await page.waitForSelector('#corNome');
  await page.fill('#corNome', nome);
  await page.locator('#corMateriaisBox label', { hasText: materialNome }).locator('input').check();
  await page.click('#corSave');
  await page.waitForTimeout(150);
}

async function addProduto(page, nome, materialNome, impressoraNome) {
  await abrirNovoProdutoModalStandalone(page);
  await page.fill('#cNome', nome);
  const materialValue = await valorDoOptionPorTexto(page, 'cMaterial', materialNome);
  const impressoraValue = await valorDoOptionPorTexto(page, 'cImpressora', impressoraNome);
  await page.selectOption('#cMaterial', materialValue);
  await page.selectOption('#cImpressora', impressoraValue);
  await page.fill('#cGram', '20');
  await page.fill('#cTempoH', '0');
  await page.fill('#cTempoM', '30');
  await page.click('#btnSalvarCatalogo');
  await page.waitForSelector('.item-card');
  await page.waitForTimeout(150);
}

// Configura a peça pra ter 1 parte com cor personalizável + texto personalizável (obrigatório ou
// não) — via editor completo, igual ao fluxo real (o cadastro rápido nasce sem personalização).
async function configurarParteDaPeca(page, nomeProduto, { textoObrigatorio }) {
  await abrirAbaStandalone(page, 'catalogo');
  await page.locator('.item-linha', { hasText: nomeProduto }).locator('[data-edit]').click();
  await page.waitForSelector('#epPartes');
  await page.click('.parte-tipocor[value="personalizavel"]');
  await page.waitForTimeout(80);
  await page.click('.parte-texto-chk[data-idx="0"]');
  await page.waitForTimeout(80);
  await page.fill('.parte-rotulo[data-idx="0"]', 'Nome');
  if (textoObrigatorio) await page.click('.parte-texto-obrig[data-idx="0"]');
  await page.click('#epSave');
  await page.waitForTimeout(200);
}

(async () => {
  const browser = await chromium.launch();
  const page = await novaPagina(browser);

  // ---------- setup: material + impressora + 3 cores + 2 peças (texto opcional / obrigatório) ----------
  await addMaterial(page, 'PLA Personalização');
  await addImpressora(page, 'Impressora PZ');
  await addCor(page, 'Azul', 'PLA Personalização');
  await addCor(page, 'Vermelho', 'PLA Personalização');
  await addCor(page, 'Verde', 'PLA Personalização');

  await addProduto(page, 'Porta-canetas grande', 'PLA Personalização', 'Impressora PZ');
  await configurarParteDaPeca(page, 'Porta-canetas grande', { textoObrigatorio: false });

  await addProduto(page, 'Chaveiro redondo', 'PLA Personalização', 'Impressora PZ');
  await configurarParteDaPeca(page, 'Chaveiro redondo', { textoObrigatorio: true });

  // ---------- 1. peça SEM parte personalizável não deve mostrar o botão "Personalizar" ----------
  await addProduto(page, 'Peça Simples', 'PLA Personalização', 'Impressora PZ');

  // ---------- 2. monta o orçamento: 3x Porta-canetas + 1x Chaveiro + 1x Peça Simples ----------
  await abrirAbaStandalone(page, 'orcamentos');
  await page.waitForSelector('#fabNovoOrc');
  await page.click('#fabNovoOrc');
  await page.waitForSelector('[data-cliente-modo="novo"]');
  await page.click('[data-cliente-modo="novo"]');
  await page.waitForSelector('#oClienteNome');
  await page.fill('#oClienteNome', 'Cliente Personalização');
  await page.fill('#oClienteTelNovo', '(11) 97777-6666');

  const selPortaCanetas = await valorDoOptionPorTexto(page, 'oProdSel', 'Porta-canetas grande');
  await page.selectOption('#oProdSel', selPortaCanetas);
  await page.fill('#oQtd', '3');
  await page.click('#oAddItem');

  const selChaveiro = await valorDoOptionPorTexto(page, 'oProdSel', 'Chaveiro redondo');
  await page.selectOption('#oProdSel', selChaveiro);
  await page.fill('#oQtd', '1');
  await page.click('#oAddItem');

  const selSimples = await valorDoOptionPorTexto(page, 'oProdSel', 'Peça Simples');
  await page.selectOption('#oProdSel', selSimples);
  await page.fill('#oQtd', '1');
  await page.click('#oAddItem');
  await page.waitForTimeout(100);

  const botoesPersonalizar = await page.locator('[data-toggle-personalizar]').count();
  assert(botoesPersonalizar === 2, `só as 2 peças com parte personalizável devem oferecer "Personalizar" — obtido: ${botoesPersonalizar}`);

  // ---------- 3. Porta-canetas (idx 0): progresso inicial 0/3, cor obrigatória / texto opcional ----------
  let rotulo = await page.locator('[data-toggle-personalizar="0"]').textContent();
  assert(rotulo.includes('0/3 preenchidas'), `Porta-canetas deve começar com 0/3 preenchidas — obtido: "${rotulo}"`);
  await page.click('[data-toggle-personalizar="0"]');
  await page.waitForSelector('.pz-cor[data-u="0"]');

  // Unidade 1: só cor (Azul), sem texto -> como o texto dessa peça é opcional, já conta como completa.
  const corAzulValue = await page.locator('.pz-cor[data-u="0"]').evaluate(el => [...el.options].find(o => o.textContent.trim() === 'Azul')?.value);
  await page.selectOption('.pz-cor[data-u="0"]', corAzulValue);
  await page.waitForTimeout(100);
  rotulo = await page.locator('[data-toggle-personalizar="0"]').textContent();
  assert(rotulo.includes('1/3 preenchidas'), `depois de escolher só a cor da Unidade 1 (texto opcional), deve contar como completa — obtido: "${rotulo}"`);

  // ---------- 4. atalho "Aplicar a todas as unidades" propaga a Unidade 1 pras demais ----------
  await page.click('[data-aplicar-todas-pz="0"]');
  await page.waitForTimeout(100);
  rotulo = await page.locator('[data-toggle-personalizar="0"]').textContent();
  assert(rotulo.includes('3/3 preenchidas'), `"Aplicar a todas" deve completar as 3 unidades de uma vez — obtido: "${rotulo}"`);

  // Ajusta unidades 2 e 3 pro cenário do exemplo (cor + texto em algumas, só cor na primeira).
  const corVermelhoValue = await page.locator('.pz-cor[data-u="1"]').evaluate(el => [...el.options].find(o => o.textContent.trim() === 'Vermelho')?.value);
  await page.selectOption('.pz-cor[data-u="1"]', corVermelhoValue);
  await page.fill('.pz-texto[data-u="1"]', 'Maria');
  const corVerdeValue = await page.locator('.pz-cor[data-u="2"]').evaluate(el => [...el.options].find(o => o.textContent.trim() === 'Verde')?.value);
  await page.selectOption('.pz-cor[data-u="2"]', corVerdeValue);
  await page.fill('.pz-texto[data-u="2"]', 'Lucas');
  await page.locator('.pz-texto[data-u="2"]').blur(); // sai do campo -> resumo/contador atualiza (ver blur no app)
  await page.waitForTimeout(100);

  const resumoPortaCanetas = await page.locator('.pz-resumo[data-idx="0"]').textContent();
  assert(resumoPortaCanetas.includes('1) Azul') && resumoPortaCanetas.includes('2) Vermelho — "Maria"') && resumoPortaCanetas.includes('3) Verde — "Lucas"'),
    `resumo compacto deve seguir o formato "1) Azul · 2) Vermelho — \\"Maria\\" · 3) Verde — \\"Lucas\\"" — obtido: "${resumoPortaCanetas}"`);

  // ---------- 5. Chaveiro (idx 1, quantidade 1, texto OBRIGATÓRIO): sem preencher nada, 0/1 ----------
  rotulo = await page.locator('[data-toggle-personalizar="1"]').textContent();
  assert(rotulo.includes('0/1 preenchidas'), `Chaveiro deve começar com 0/1 preenchidas — obtido: "${rotulo}"`);
  await page.click('[data-toggle-personalizar="1"]');
  await page.waitForSelector('.pz-cor[data-u="0"]');
  const corVerdeChaveiro = await page.locator('.pz-cor[data-u="0"]').evaluate(el => [...el.options].find(o => o.textContent.trim() === 'Verde')?.value);
  await page.selectOption('.pz-cor[data-u="0"]', corVerdeChaveiro);
  await page.waitForTimeout(100);
  rotulo = await page.locator('[data-toggle-personalizar="1"]').textContent();
  assert(rotulo.includes('0/1 preenchidas'), `Chaveiro com texto obrigatório: só a cor preenchida ainda NÃO deve contar como completo — obtido: "${rotulo}"`);

  await page.click('#oSalvar');
  await page.waitForSelector('.card h3:has-text("Cliente Personalização")');

  // ---------- 6. converter em pedido com o Chaveiro incompleto (falta o texto obrigatório) -> bloqueia ----------
  await page.click('.card:has(h3:has-text("Cliente Personalização")) [data-toggle-orc]');
  await page.waitForSelector('[data-converter-pedido]');
  await page.click('[data-converter-pedido]');
  await page.waitForTimeout(150);
  const aindaEmOrcamentos = await page.$('.card:has(h3:has-text("Cliente Personalização")) [data-converter-pedido]');
  assert(aindaEmOrcamentos !== null, 'com o Chaveiro sem o texto obrigatório preenchido, a conversão em pedido deve ser bloqueada (continua como orçamento)');

  // ---------- 7. completa o texto obrigatório do Chaveiro e converte de novo -> agora funciona ----------
  await page.click('.card:has(h3:has-text("Cliente Personalização")) [data-editar-orc]');
  await page.waitForSelector('#oItensList');
  await page.click('[data-toggle-personalizar="1"]');
  await page.waitForSelector('.pz-texto[data-u="0"]');
  await page.fill('.pz-texto[data-u="0"]', 'Sofia');
  await page.waitForTimeout(80);
  await page.click('#oSalvar');
  await page.waitForTimeout(150);

  await page.click('.card:has(h3:has-text("Cliente Personalização")) [data-toggle-orc]');
  await page.waitForSelector('[data-converter-pedido]');
  await page.click('[data-converter-pedido]');
  await page.waitForTimeout(80);
  await page.click('[data-converter-pedido]'); // 2º clique confirma
  await page.waitForTimeout(150);

  // ---------- 8. Pedidos: resumo aparece na lista, igual ao orçamento ----------
  await abrirAbaStandalone(page, 'pedidos');
  await page.waitForSelector('.card h3:has-text("Cliente Personalização")');
  await page.click('.card:has(h3:has-text("Cliente Personalização")) [data-toggle-orc]');
  const resumosPedido = await page.locator('.list-line:has-text("🎨")').allTextContents();
  assert(resumosPedido.some(t => t.includes('Azul') && t.includes('Vermelho')), `lista de Pedidos deve mostrar o resumo da personalização do Porta-canetas — obtido: ${JSON.stringify(resumosPedido)}`);
  assert(resumosPedido.some(t => t.includes('Sofia')), `lista de Pedidos deve mostrar o resumo do Chaveiro (com o texto "Sofia") — obtido: ${JSON.stringify(resumosPedido)}`);

  // ---------- 9. mensagem de WhatsApp: bloco de personalização SÓ no "pedido recebido" ----------
  const textos = await page.evaluate(() => {
    const o = state.orcamentos.find(x => x.cliente === 'Cliente Personalização');
    return {
      aberto: TEXTO_STATUS_PEDIDO.aberto(o),
      em_producao: TEXTO_STATUS_PEDIDO.em_producao(o),
      orcamentoTexto: gerarTextoOrcamento(o),
    };
  });
  assert(textos.aberto.includes('Só pra confirmar a personalização'), `mensagem de "pedido recebido" deve incluir o bloco de confirmação — obtido: ${textos.aberto}`);
  assert(textos.aberto.includes('◆ *Porta-canetas grande*: 1) Azul · 2) Vermelho — "Maria" · 3) Verde — "Lucas"'), `bloco deve ter o resumo formatado do Porta-canetas — obtido: ${textos.aberto}`);
  assert(textos.aberto.includes('◆ *Chaveiro redondo*: Verde — "Sofia"'), `bloco deve ter o resumo do Chaveiro (quantidade 1, sem numeração) — obtido: ${textos.aberto}`);
  assert(!textos.aberto.includes('Peça Simples'), `peça sem nenhuma personalização não deve aparecer no bloco — obtido: ${textos.aberto}`);
  assert(textos.aberto.includes('Tá tudo certo?'), `bloco deve terminar com a chamada de confirmação — obtido: ${textos.aberto}`);
  assert(!textos.em_producao.includes('Azul') && !textos.em_producao.includes('personalização'), `mensagem de "em produção" NUNCA deve detalhar a personalização — obtido: ${textos.em_producao}`);
  assert(!textos.orcamentoTexto.includes('Azul'), `texto do orçamento (Enviar por WhatsApp / Copiar resumo) NUNCA deve detalhar a personalização — obtido: ${textos.orcamentoTexto}`);

  // ---------- 10. "Copiar orçamento" nunca herda a personalização (nasce em branco) ----------
  await abrirAbaStandalone(page, 'pedidos');
  await page.waitForSelector('.card h3:has-text("Cliente Personalização")');
  await page.click('.card:has(h3:has-text("Cliente Personalização")) [data-toggle-orc]');
  await page.waitForSelector('[data-copiar-orc]');
  await page.click('.card:has(h3:has-text("Cliente Personalização")) [data-copiar-orc]');
  await page.waitForSelector('#oItensList');
  await page.waitForTimeout(100);
  rotulo = await page.locator('[data-toggle-personalizar="0"]').textContent();
  assert(rotulo.includes('0/3 preenchidas'), `"Copiar orçamento" não deve herdar a personalização do Porta-canetas — obtido: "${rotulo}"`);
  const temResumoNaCopia = await page.locator('.pz-resumo').count();
  assert(temResumoNaCopia === 0, '"Copiar orçamento" não deve mostrar nenhum resumo de personalização já preenchido');

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== ALGUM TESTE FALHOU ===' : '\n=== TODOS OS TESTES PASSARAM ===');
})();
