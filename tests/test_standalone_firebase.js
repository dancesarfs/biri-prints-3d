const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

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
  await page.waitForSelector('#tabsBottom button');
  const appVisivelDepois = await page.$eval('#appShell', el => getComputedStyle(el).display !== 'none');
  const loginEscondidoDepois = await page.$eval('#loginScreen', el => getComputedStyle(el).display === 'none');
  assert(appVisivelDepois, 'depois do login correto, o app deve aparecer');
  assert(loginEscondidoDepois, 'depois do login correto, a tela de login deve sumir');

  // ---------- 4. catálogo começa vazio (projeto Firebase novo, sem dados ainda) ----------
  await page.click('#tabsBottom button:nth-child(2)'); // Catálogo
  await page.waitForSelector('.empty, .item-card');
  const catalogoVazio = (await page.$$('.item-card')).length === 0;
  assert(catalogoVazio, 'com um banco de dados novo (sem backup importado ainda), o catálogo deve começar vazio');

  // ---------- 5. criar uma peça de verdade -> vira uma escrita real no Firestore (mock) ----------
  await page.click('#tabsBottom button:nth-child(1)'); // Calcular
  await page.waitForSelector('#cNome');
  await page.fill('#cNome', 'Peça via Firebase');
  await page.selectOption('#cMaterial', { index: 0 }).catch(() => {}); // pode não ter material ainda
  const temMaterial = (await page.$$('#cMaterial option')).length > 0;
  if (!temMaterial) {
    // sem material cadastrado ainda no banco novo — cadastra um rapidinho
    await page.click('#tabsBottom button:has-text("Ajustes")');
    await page.waitForSelector('#btnAddMat');
    await page.click('#btnAddMat');
    await page.waitForSelector('#mNome');
    await page.fill('#mNome', 'PLA Teste');
    await page.fill('#mPreco', '100');
    await page.click('#mSave');
    await page.waitForTimeout(150);
    await page.click('#btnAddImp');
    await page.waitForSelector('#iNome');
    await page.fill('#iNome', 'Impressora Teste');
    await page.fill('#iPreco', '3000');
    await page.fill('#iPotencia', '0.1');
    await page.fill('#iVidaUtil', '2000');
    await page.click('#iSave');
    await page.waitForTimeout(150);
    await page.click('#tabsBottom button:nth-child(1)');
    await page.waitForSelector('#cNome');
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
  await page.click('#btnLogout');
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
  await page2.waitForSelector('#tabsBottom button');

  const backupPath = path.resolve(__dirname, '..', 'data', 'biri-prints-3d-backup.json');
  assert(fs.existsSync(backupPath), 'arquivo de backup real (biri-prints-3d-backup.json) deve existir pra esse teste rodar');

  await page2.click('#tabsBottom button:has-text("Ajustes")'); // Ajustes
  await page2.waitForSelector('#importarBackupInput');
  await page2.setInputFiles('#importarBackupInput', backupPath);
  // Timeout maior que o padrão de 5s: a importação dispara várias escritas no Firestore mock,
  // cada uma notificando os listeners de onSnapshot num macrotask (setTimeout) — fiel ao Firestore
  // de verdade, que nunca notifica de forma síncrona (ver fake_firebase.js) — e em runners de CI
  // mais lentos (memória/CPU compartilhada) essa cadeia de re-renders pode passar de 5s.
  await page2.waitForSelector('#importarBackupStatus:has-text("sucesso")', { timeout: 15000 });
  await page2.waitForTimeout(200);

  const impNomes = await page2.$$eval('#impList h3', els => els.map(e => e.textContent.trim()));
  assert(impNomes.includes('Bambu Lab A1'), `depois de importar o backup, a impressora real deve aparecer em Ajustes — obtido: ${impNomes.join(', ')}`);

  await page2.click('#tabsBottom button:nth-child(2)'); // Catálogo
  await page2.waitForSelector('.item-card');
  const nomesCatalogoImportado = await page2.$$eval('.item-card h3', els => els.map(e => e.textContent.trim()));
  assert(nomesCatalogoImportado.length === 5, `depois de importar, o catálogo deve ter as 5 peças reais — obtido: ${nomesCatalogoImportado.length}`);
  assert(nomesCatalogoImportado.includes('cestinha de maçã'), `deve conter a peça real "cestinha de maçã" — obtido: ${nomesCatalogoImportado.join(', ')}`);

  await page2.click('#tabsBottom button:has-text("Ajustes")'); // Ajustes de novo, pra ver grupos/promoções
  await page2.waitForSelector('#grupoList');
  const gruposTexto = await page2.textContent('#grupoList');
  const promosTexto = await page2.textContent('#promoList');
  assert(gruposTexto.includes('Kit Professores'), `grupo real "Kit Professores" deve aparecer depois de importar — obtido: ${gruposTexto}`);
  assert(promosTexto.includes('Dia dos professores'), `promoção real "Dia dos professores" deve aparecer depois de importar — obtido: ${promosTexto}`);

  await browser2.close();
  console.log(process.exitCode === 1 ? '\n=== ALGUM TESTE FALHOU ===' : '\n=== TODOS OS TESTES PASSARAM ===');
})();
