const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { passarPeloGateVendedorStandalone, abrirAbaStandalone, abrirNovoProdutoModalStandalone } = require('./test_helpers_standalone');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('OK:', msg);
}

const FAKE_FIREBASE_JS = fs.readFileSync(path.resolve(__dirname, 'fake_firebase.js'), 'utf8');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  // bloqueia os scripts reais do Firebase (não tem internet liberada pra gstatic.com
  // nesse ambiente de teste, e mesmo se tivesse, não queremos um projeto real aqui)
  await page.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  // injeta o mock ANTES de qualquer script da página rodar
  await page.addInitScript(FAKE_FIREBASE_JS);

  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'app', 'biri-prints-3d-standalone.html');
  await page.goto(fileUrl);

  // ---------- 1. tela de login aparece, app fica escondido ----------
  await page.waitForSelector('#loginScreen');
  const loginVisivel = await page.$eval('#loginScreen', el => getComputedStyle(el).display !== 'none');
  const appEscondido = await page.$eval('#appShell', el => getComputedStyle(el).display === 'none');
  assert(loginVisivel, 'tela de login deve aparecer antes de autenticar');
  assert(appEscondido, 'o app não deve aparecer antes de autenticar');

  // ---------- 2. credenciais erradas -> mostra erro, continua bloqueado ----------
  await page.fill('#loginEmail', 'errado@teste.com');
  await page.fill('#loginSenha', 'senhaerrada');
  await page.click('#loginBtn');
  await page.waitForTimeout(150);
  const erroVisivel = await page.$eval('#loginErro', el => getComputedStyle(el).display !== 'none' && el.textContent.length > 0);
  const aindaBloqueado = await page.$eval('#appShell', el => getComputedStyle(el).display === 'none');
  assert(erroVisivel, 'credenciais erradas devem mostrar uma mensagem de erro');
  assert(aindaBloqueado, 'com credenciais erradas o app deve continuar escondido');

  // ---------- 3. login correto -> app aparece ----------
  await page.fill('#loginEmail', 'dono@teste.com');
  await page.fill('#loginSenha', 'senha123');
  await page.click('#loginBtn');
  await page.waitForSelector('#sidebarNav [data-nav]');
  const appVisivelDepois = await page.$eval('#appShell', el => getComputedStyle(el).display !== 'none');
  const loginEscondidoDepois = await page.$eval('#loginScreen', el => getComputedStyle(el).display === 'none');
  assert(appVisivelDepois, 'depois do login correto, o app deve aparecer');
  assert(loginEscondidoDepois, 'depois do login correto, a tela de login deve sumir');

  // desde a funcionalidade de vendedores, o login (Firebase) não basta — precisa escolher/
  // cadastrar um vendedor nesse "aparelho" antes de usar qualquer aba.
  await passarPeloGateVendedorStandalone(page);

  // ---------- 4. catálogo começa vazio (projeto Firebase novo, sem dados ainda) ----------
  await abrirAbaStandalone(page, 'catalogo');
  await page.waitForSelector('.empty, .item-card');
  const catalogoVazio = (await page.$$('.item-card')).length === 0;
  assert(catalogoVazio, 'com um banco de dados novo (sem backup importado ainda), o catálogo deve começar vazio');

  // ---------- 5. criar uma peça de verdade -> vira uma escrita real no Firestore (mock) ----------
  await abrirNovoProdutoModalStandalone(page);
  await page.fill('#cNome', 'Peça via Firebase');
  await page.selectOption('#cMaterial', { index: 0 }).catch(() => {}); // pode não ter material ainda
  const temMaterial = (await page.$$('#cMaterial option')).length > 0;
  if (!temMaterial) {
    // sem material cadastrado ainda no banco novo — cadastra um rapidinho
    await page.evaluate(() => { document.getElementById('modalBackdrop')?.remove(); });
    await abrirAbaStandalone(page, 'admin-materiais');
    await page.waitForSelector('#btnAddMat');
    await page.click('#btnAddMat');
    await page.waitForSelector('#mNome');
    await page.fill('#mNome', 'PLA Teste');
    await page.fill('#mPreco', '100');
    await page.click('#mSave');
    await page.waitForTimeout(150);
    await abrirAbaStandalone(page, 'admin-impressoras');
    await page.click('#btnAddImp');
    await page.waitForSelector('#iNome');
    await page.fill('#iNome', 'Impressora Teste');
    await page.fill('#iPreco', '3000');
    await page.fill('#iPotencia', '0.1');
    await page.fill('#iVidaUtil', '2000');
    await page.click('#iSave');
    await page.waitForTimeout(150);
    await abrirNovoProdutoModalStandalone(page);
    await page.fill('#cNome', 'Peça via Firebase');
    await page.selectOption('#cMaterial', { index: 0 });
    await page.selectOption('#cImpressora', { index: 0 });
  }
  await page.fill('#cGram', '20');
  await page.fill('#cTempoH', '0');
  await page.fill('#cTempoM', '30');
  await page.waitForTimeout(30);
  await page.click('#btnSalvarCatalogo');
  await page.waitForSelector('.item-card');
  const nomesAposCriar = await page.$$eval('.item-card h3', els => els.map(e => e.textContent.trim()));
  assert(nomesAposCriar.includes('Peça via Firebase'), `peça criada pela UI deve aparecer no catálogo (via Firestore mock, add + onSnapshot) — obtido: ${nomesAposCriar.join(', ')}`);

  const storeSnapshot = await page.evaluate(() => JSON.parse(JSON.stringify(window.__fakeDb.store)));
  const produtosNoStore = Object.values(storeSnapshot.produtos || {});
  assert(produtosNoStore.some(p => p.nome === 'Peça via Firebase'), 'a peça deve ter sido gravada de fato no Firestore (mock), não só na tela');

  // ---------- 6. logout -> volta pra tela de login ----------
  // No celular (viewport dos testes), "Sair" fica escondido atrás do menu compacto do usuário
  // (ver leva de ajustes de UI/UX) — abre por ele em vez do botão direto no cabeçalho.
  await page.click('#btnUsuarioMenu');
  await page.click('#mnuSair');
  await page.waitForTimeout(100);
  const loginDeVoltaVisivel = await page.$eval('#loginScreen', el => getComputedStyle(el).display !== 'none');
  const appEscondidoDeNovo = await page.$eval('#appShell', el => getComputedStyle(el).display === 'none');
  assert(loginDeVoltaVisivel, 'depois de clicar em Sair, a tela de login deve voltar a aparecer');
  assert(appEscondidoDeNovo, 'depois de clicar em Sair, o app deve ficar escondido de novo');

  await browser.close();

  // ---------- 7. importar backup: sessão nova, projeto "vazio", importa o JSON de verdade ----------
  const browser2 = await chromium.launch();
  const page2 = await browser2.newPage({ viewport: { width: 390, height: 844 } });
  await page2.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page2.addInitScript(FAKE_FIREBASE_JS);
  await page2.goto(fileUrl);
  await page2.waitForSelector('#loginScreen');
  await page2.fill('#loginEmail', 'dono@teste.com');
  await page2.fill('#loginSenha', 'senha123');
  await page2.click('#loginBtn');
  await page2.waitForSelector('#sidebarNav [data-nav]');
  await passarPeloGateVendedorStandalone(page2);

  const backupPath = path.resolve(__dirname, '..', 'data', 'biri-prints-3d-backup.json');
  assert(fs.existsSync(backupPath), 'arquivo de backup real (biri-prints-3d-backup.json) deve existir pra esse teste rodar');

  await abrirAbaStandalone(page2, 'admin-parametros'); // "Importar backup" mora em Admin > Parâmetros de custo
  await page2.waitForSelector('#importarBackupInput');
  await page2.setInputFiles('#importarBackupInput', backupPath);
  // Sem timeout customizado (usa o padrão do Playwright, 30s) — igual a todo outro waitForSelector
  // desse arquivo. Um valor menor aqui (5s, depois 15s) já flakou em CI: esse teste em particular é
  // o mais longo da suíte (dois browsers, vários passos), fica mais exposto a CPU/memória
  // compartilhada em runners mais lentos, e não há motivo pra essa espera específica ter um prazo
  // mais curto que as outras.
  await page2.waitForSelector('#importarBackupStatus:has-text("sucesso")');
  await page2.waitForTimeout(200);

  await abrirAbaStandalone(page2, 'admin-impressoras');
  await page2.waitForSelector('#impList');
  const impNomes = await page2.$$eval('#impList h3', els => els.map(e => e.textContent.trim()));
  assert(impNomes.includes('Bambu Lab A1'), `depois de importar o backup, a impressora real deve aparecer em Admin > Impressoras — obtido: ${impNomes.join(', ')}`);

  await abrirAbaStandalone(page2, 'catalogo');
  await page2.waitForSelector('.item-card');
  const nomesCatalogoImportado = await page2.$$eval('.item-card h3', els => els.map(e => e.textContent.trim()));
  assert(nomesCatalogoImportado.length === 5, `depois de importar, o catálogo deve ter as 5 peças reais — obtido: ${nomesCatalogoImportado.length}`);
  assert(nomesCatalogoImportado.includes('cestinha de maçã'), `deve conter a peça real "cestinha de maçã" — obtido: ${nomesCatalogoImportado.join(', ')}`);

  await abrirAbaStandalone(page2, 'admin-grupos');
  await page2.waitForSelector('#grupoList');
  const gruposTexto = await page2.textContent('#grupoList');
  assert(gruposTexto.includes('Kit Professores'), `grupo real "Kit Professores" deve aparecer depois de importar — obtido: ${gruposTexto}`);

  await abrirAbaStandalone(page2, 'admin-promocoes');
  await page2.waitForSelector('#promoList');
  const promosTexto = await page2.textContent('#promoList');
  assert(promosTexto.includes('Dia dos professores'), `promoção real "Dia dos professores" deve aparecer depois de importar — obtido: ${promosTexto}`);

  await browser2.close();
  console.log(process.exitCode === 1 ? '\n=== ALGUM TESTE FALHOU ===' : '\n=== TODOS OS TESTES PASSARAM ===');
})();
