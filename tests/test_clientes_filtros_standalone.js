// Testa os filtros da tela de Clientes (nome já existente + e-mail e telefone novos), a
// combinação "E" entre eles, a normalização de telefone (parênteses/espaço/hífen/+55 antes de
// comparar), o estado vazio dedicado, "Limpar filtros" e a persistência via URL — só na
// standalone (app/biri-prints-3d-standalone.html), única versão que recebe funcionalidade nova.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { passarPeloGateVendedorStandalone, abrirAbaStandalone } = require('./test_helpers_standalone');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('OK:', msg);
}

const FAKE_FIREBASE_JS = fs.readFileSync(path.resolve(__dirname, 'fake_firebase.js'), 'utf8');
const fileUrl = 'file://' + path.resolve(__dirname, '..', 'app', 'biri-prints-3d-standalone.html');

async function novaPagina(browser, extraUrl = '') {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page.addInitScript(FAKE_FIREBASE_JS);
  await page.goto(fileUrl + extraUrl);
  await page.waitForSelector('#loginScreen');
  await page.fill('#loginEmail', 'dono@teste.com');
  await page.fill('#loginSenha', 'senha123');
  await page.click('#loginBtn');
  await page.waitForSelector('#sidebarNav [data-nav]');
  await passarPeloGateVendedorStandalone(page);
  return page;
}

async function addCliente(page, nome, telefone, email) {
  await abrirAbaStandalone(page, 'clientes');
  await page.click('#fabNovoCliente');
  await page.waitForSelector('#clNome');
  await page.fill('#clNome', nome);
  if (telefone) await page.fill('#clTelefone', telefone);
  if (email) await page.fill('#clEmail', email);
  await page.click('#clSave');
  await page.waitForTimeout(120);
}

(async () => {
  const browser = await chromium.launch();
  const page = await novaPagina(browser);

  // ---------- 1. monta 3 clientes de teste ----------
  await addCliente(page, 'Maria da Silva', '11991234567', 'maria@example.com');
  await addCliente(page, 'João Pereira', '21988887777', 'joao@teste.com');
  await addCliente(page, 'Maria Souza', '11987654321', 'maria.souza@teste.com');

  await abrirAbaStandalone(page, 'clientes');
  await page.waitForSelector('.item-card');
  let nomes = await page.$$eval('.item-card h3', els => els.map(e => e.textContent.trim()));
  assert(nomes.length === 3, `deve ter os 3 clientes criados — obtido: ${nomes.join(', ')}`);

  const limparEscondidoNoInicio = await page.isHidden('#btnLimparFiltrosClientes');
  assert(limparEscondidoNoInicio, '"Limpar filtros" deve ficar escondido quando nenhum filtro está ativo');
  const contagemInicial = await page.textContent('#clienteContagem');
  assert(contagemInicial.includes('3') && !contagemInicial.includes(' de '), `sem filtro ativo, a contagem deve mostrar só o total (3) — obtido: "${contagemInicial}"`);

  // ---------- 2. filtro por e-mail: parcial, case-insensitive, com debounce ----------
  await page.fill('#clienteBuscaEmail', 'MARIA');
  await page.waitForTimeout(50); // antes do debounce (~300ms) — ainda não deve ter filtrado
  nomes = await page.$$eval('.item-card h3', els => els.map(e => e.textContent.trim()));
  assert(nomes.length === 3, `busca por e-mail não deve filtrar antes do debounce — obtido (50ms depois): ${nomes.length} cliente(s)`);
  await page.waitForTimeout(400); // depois do debounce
  nomes = await page.$$eval('.item-card h3', els => els.map(e => e.textContent.trim()));
  assert(nomes.length === 2 && nomes.every(n => n.includes('Maria')),
    `"MARIA" (maiúsculo) deve achar os 2 e-mails com "maria", ignorando caixa — obtido: ${nomes.join(', ')}`);

  const limparVisivelComFiltro = await page.isVisible('#btnLimparFiltrosClientes');
  assert(limparVisivelComFiltro, '"Limpar filtros" deve aparecer quando algum filtro está ativo');

  // ---------- 3. combinado com o filtro de nome já existente (lógica "E") ----------
  await page.fill('#clienteBusca', 'silva');
  await page.waitForTimeout(80); // filtro de nome já existente não tem debounce
  nomes = await page.$$eval('.item-card h3', els => els.map(e => e.textContent.trim()));
  assert(nomes.length === 1 && nomes[0].includes('Maria da Silva'),
    `nome "silva" + e-mail "maria" (E) deve trazer só "Maria da Silva" — obtido: ${nomes.join(', ')}`);

  await page.click('#btnLimparFiltrosClientes');
  await page.waitForTimeout(50);
  nomes = await page.$$eval('.item-card h3', els => els.map(e => e.textContent.trim()));
  assert(nomes.length === 3, `depois de "Limpar filtros", os 3 clientes devem voltar a aparecer — obtido: ${nomes.join(', ')}`);
  const limparEscondidoDepois = await page.isHidden('#btnLimparFiltrosClientes');
  assert(limparEscondidoDepois, '"Limpar filtros" deve voltar a ficar escondido depois de limpar');
  const urlLimpa = await page.evaluate(() => location.search);
  assert(urlLimpa === '', `depois de limpar os filtros, a URL não deve carregar mais nenhum parâmetro — obtido: "${urlLimpa}"`);

  // ---------- 4. filtro por telefone: normaliza parênteses/espaço/hífen/+55 antes de comparar ----------
  await page.fill('#clienteBuscaTelefone', '+55 (11) 99123-4567');
  await page.waitForTimeout(400);
  nomes = await page.$$eval('.item-card h3', els => els.map(e => e.textContent.trim()));
  assert(nomes.length === 1 && nomes[0].includes('Maria da Silva'),
    `telefone digitado com +55/parênteses/hífen deve casar com o telefone salvo (mascarado) — obtido: ${nomes.join(', ')}`);

  // busca parcial: só o DDD, deve trazer as 2 clientes de SP (DDD 11), não o de DDD 21
  await page.fill('#clienteBuscaTelefone', '11');
  await page.waitForTimeout(400);
  nomes = await page.$$eval('.item-card h3', els => els.map(e => e.textContent.trim()));
  assert(nomes.length === 2 && nomes.every(n => n.includes('Maria')),
    `busca parcial "11" (DDD) deve trazer as 2 clientes de SP e não o de DDD 21 — obtido: ${nomes.join(', ')}`);

  // ---------- 5. combinação sem nenhum cliente correspondente -> estado vazio dedicado ----------
  await page.fill('#clienteBuscaTelefone', '');
  await page.waitForTimeout(400);
  await page.fill('#clienteBuscaEmail', 'inexistente');
  await page.waitForTimeout(400);
  const vazioFiltrado = await page.$('#clienteList .empty');
  assert(!!vazioFiltrado, 'e-mail sem nenhum cliente correspondente deve mostrar o estado vazio dedicado');
  const textoVazio = await page.textContent('#clienteList .empty');
  assert(textoVazio.includes('Nenhum cliente encontrado'), `o estado vazio de filtro deve deixar claro que nada correspondeu — obtido: "${textoVazio}"`);
  const contagemZero = await page.textContent('#clienteContagem');
  assert(contagemZero.includes('0 de 3'), `com filtro sem correspondência, a contagem deve mostrar 0 de 3 — obtido: "${contagemZero}"`);

  await page.click('#btnLimparFiltrosClientes');
  await page.waitForTimeout(50);

  await browser.close();

  // ---------- 6. filtros na URL: link compartilhado já abre Clientes com o filtro aplicado ----------
  const browser2 = await chromium.launch();
  const page2 = await novaPagina(browser2, '?clienteEmail=maria');

  const filtroInicialDaUrl = await page2.evaluate(() => ({ email: state.filtroClienteEmail, tab: state.tab }));
  assert(filtroInicialDaUrl.email === 'maria', `o filtro de e-mail da URL deve ser lido antes do primeiro render — obtido: "${filtroInicialDaUrl.email}"`);
  assert(filtroInicialDaUrl.tab === 'clientes', `um link com filtro de clientes na URL deve abrir direto na aba Clientes — obtido: "${filtroInicialDaUrl.tab}"`);

  // sem nenhum cliente cadastrado ainda, deve mostrar o estado vazio de "nenhum cliente" (não o de filtro)
  await page2.waitForSelector('#fabNovoCliente');
  const semClienteAlgum = await page2.$('.empty h3');
  assert(semClienteAlgum && (await semClienteAlgum.textContent()).includes('Nenhum cliente cadastrado'),
    'sem nenhum cliente cadastrado, deve mostrar o estado vazio "nenhum cliente" e não o de filtro');

  // cadastra clientes agora — o filtro (vindo da URL) já deve valer assim que existir dado
  await addCliente(page2, 'Maria Teste URL', '', 'maria@urlteste.com');
  await addCliente(page2, 'Outro Cliente', '', 'outro@urlteste.com');
  await abrirAbaStandalone(page2, 'clientes');
  await page2.waitForSelector('#clienteBuscaEmail');
  const valorCampoEmail = await page2.inputValue('#clienteBuscaEmail');
  assert(valorCampoEmail === 'maria', `o campo de busca por e-mail deve continuar preenchido com o filtro vindo da URL — obtido: "${valorCampoEmail}"`);
  const nomesAposCadastrar = await page2.$$eval('.item-card h3', els => els.map(e => e.textContent.trim()));
  assert(nomesAposCadastrar.length === 1 && nomesAposCadastrar[0].includes('Maria Teste URL'),
    `com o filtro "maria" (vindo da URL) já aplicado, só "Maria Teste URL" deve aparecer — obtido: ${nomesAposCadastrar.join(', ')}`);

  await browser2.close();

  console.log(process.exitCode === 1 ? '\n=== ALGUM TESTE FALHOU ===' : '\n=== TODOS OS TESTES PASSARAM ===');
})();
