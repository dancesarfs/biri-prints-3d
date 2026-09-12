// Testa os filtros da tela de Catálogo (impressora, material, faixa de preço, busca por nome),
// a combinação "E" entre eles, o estado vazio dedicado, o botão "Limpar filtros" e a persistência
// dos filtros na URL (query params) — só na versão standalone (app/biri-prints-3d-standalone.html),
// que é a única que recebe funcionalidade nova (ver CLAUDE.md).
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

async function addMaterial(page, nome, preco) {
  await abrirAbaStandalone(page, 'admin-materiais');
  await page.click('#btnAddMat');
  await page.waitForSelector('#mNome');
  await page.fill('#mNome', nome);
  await page.fill('#mPreco', String(preco));
  await page.click('#mSave');
  await page.waitForTimeout(120);
}

async function addImpressora(page, nome) {
  await abrirAbaStandalone(page, 'admin-impressoras');
  await page.click('#btnAddImp');
  await page.waitForSelector('#iNome');
  await page.fill('#iNome', nome);
  await page.fill('#iPreco', '3000');
  await page.fill('#iPotencia', '0.1');
  await page.fill('#iVidaUtil', '2000');
  await page.click('#iSave');
  await page.waitForTimeout(120);
}

// Os <option> desses selects trazem preço/marca no texto (ver populateMaterialSelect/
// populateImpressoraSelect no app), então não dá pra casar por label exato — busca o value
// do option cujo texto começa com o nome cadastrado.
async function valorDoOptionPorTexto(page, selectId, textoParcial) {
  return page.evaluate(({ selectId, textoParcial }) => {
    const opt = [...document.getElementById(selectId).options].find(o => o.textContent.startsWith(textoParcial));
    return opt ? opt.value : null;
  }, { selectId, textoParcial });
}

async function addProduto(page, nome, materialNome, impressoraNome, gram, tempoH, tempoM) {
  await abrirNovoProdutoModalStandalone(page);
  await page.fill('#cNome', nome);
  const materialValue = await valorDoOptionPorTexto(page, 'cMaterial', materialNome);
  const impressoraValue = await valorDoOptionPorTexto(page, 'cImpressora', impressoraNome);
  await page.selectOption('#cMaterial', materialValue);
  await page.selectOption('#cImpressora', impressoraValue);
  await page.fill('#cGram', String(gram));
  await page.fill('#cTempoH', String(tempoH));
  await page.fill('#cTempoM', String(tempoM));
  await page.click('#btnSalvarCatalogo');
  await page.waitForTimeout(120);
}

(async () => {
  const browser = await chromium.launch();
  const page = await novaPagina(browser);

  // ---------- 1. monta o catálogo de teste: 2 materiais, 2 impressoras, 4 peças ----------
  await addMaterial(page, 'PLA Filtro', 100);
  await addMaterial(page, 'PETG Filtro', 150);
  await addImpressora(page, 'Impressora X');
  await addImpressora(page, 'Impressora Y');

  await addProduto(page, 'Suporte Azul', 'PLA Filtro', 'Impressora X', 20, 0, 30);
  await addProduto(page, 'Suporte Verde', 'PETG Filtro', 'Impressora Y', 20, 0, 30);
  await addProduto(page, 'Vaso Grande', 'PLA Filtro', 'Impressora Y', 200, 3, 0);
  await addProduto(page, 'Peça Café', 'PLA Filtro', 'Impressora X', 10, 0, 10);

  await abrirAbaStandalone(page, 'catalogo');
  await page.waitForSelector('.item-card');
  const nomesIniciais = await page.$$eval('.item-card h3', els => els.map(e => e.textContent.trim()));
  assert(nomesIniciais.length === 4, `catálogo de teste deve ter as 4 peças criadas — obtido: ${nomesIniciais.join(', ')}`);

  const limparEscondidoNoInicio = await page.isHidden('#btnLimparFiltrosCatalogo');
  assert(limparEscondidoNoInicio, '"Limpar filtros" deve ficar escondido quando nenhum filtro está ativo');

  const contagemInicial = await page.textContent('#catContagem');
  assert(contagemInicial.includes('4') && !contagemInicial.includes(' de '), `sem filtro ativo, a contagem deve mostrar só o total (4) — obtido: "${contagemInicial}"`);

  // No viewport mobile (390px, igual aos outros testes standalone) o painel de filtros é uma
  // gaveta colapsável — precisa abrir pelo botão "Filtros" antes de interagir com os checkboxes.
  await page.click('#btnToggleFiltrosCatalogo');
  await page.waitForSelector('.filtros-catalogo.aberto');

  // ---------- 2. filtro por impressora (seleção múltipla dentro da mesma dimensão) ----------
  await page.locator('.chk-item', { hasText: 'Impressora X' }).locator('input').check();
  await page.waitForTimeout(50);
  let nomes = await page.$$eval('.item-card h3', els => els.map(e => e.textContent.trim()));
  assert(nomes.length === 2 && nomes.includes('Suporte Azul') && nomes.includes('Peça Café'),
    `filtro só por "Impressora X" deve trazer 2 peças — obtido: ${nomes.join(', ')}`);

  const limparVisivelComFiltro = await page.isVisible('#btnLimparFiltrosCatalogo');
  assert(limparVisivelComFiltro, '"Limpar filtros" deve aparecer quando algum filtro está ativo');

  // ---------- 3. filtro combinado impressora + material (lógica "E" entre dimensões) ----------
  await page.locator('.chk-item', { hasText: 'Impressora X' }).locator('input').uncheck();
  await page.waitForTimeout(50);
  await page.locator('.chk-item', { hasText: 'Impressora Y' }).locator('input').check();
  await page.waitForTimeout(50);
  await page.locator('.chk-item', { hasText: 'PLA Filtro' }).locator('input').check();
  await page.waitForTimeout(50);
  nomes = await page.$$eval('.item-card h3', els => els.map(e => e.textContent.trim()));
  assert(nomes.length === 1 && nomes[0] === 'Vaso Grande',
    `impressora "Impressora Y" + material "PLA Filtro" (E) deve trazer só "Vaso Grande" — obtido: ${nomes.join(', ')}`);

  // ---------- 4. combinação sem nenhuma peça correspondente -> estado vazio dedicado ----------
  await page.locator('.chk-item', { hasText: 'PLA Filtro' }).locator('input').uncheck();
  await page.waitForTimeout(50);
  await page.locator('.chk-item', { hasText: 'PETG Filtro' }).locator('input').check();
  await page.waitForTimeout(50);
  // agora: impressora Y + material PETG -> "Suporte Verde" é o único (impressora Y, PETG) então existe 1 —
  // pra forçar zero resultados, soma também um filtro de impressora incompatível.
  await page.locator('.chk-item', { hasText: 'Impressora Y' }).locator('input').uncheck();
  await page.waitForTimeout(50);
  await page.locator('.chk-item', { hasText: 'Impressora X' }).locator('input').check();
  await page.waitForTimeout(50);
  const vazioFiltrado = await page.$('#catGrid .empty');
  assert(!!vazioFiltrado, 'impressora "Impressora X" + material "PETG Filtro" (sem peça correspondente) deve mostrar o estado vazio dedicado');
  const textoVazio = await page.textContent('#catGrid .empty');
  assert(textoVazio.includes('Nenhuma peça encontrada'), `o estado vazio de filtro deve deixar claro que nada correspondeu — obtido: "${textoVazio}"`);
  const contagemZero = await page.textContent('#catContagem');
  assert(contagemZero.includes('0 de 4'), `com filtro sem correspondência, a contagem deve mostrar 0 de 4 — obtido: "${contagemZero}"`);

  // ---------- 5. "Limpar filtros" volta tudo ao normal ----------
  await page.click('#btnLimparFiltrosCatalogo');
  await page.waitForTimeout(50);
  nomes = await page.$$eval('.item-card h3', els => els.map(e => e.textContent.trim()));
  assert(nomes.length === 4, `depois de "Limpar filtros", as 4 peças devem voltar a aparecer — obtido: ${nomes.join(', ')}`);
  const limparEscondidoDepois = await page.isHidden('#btnLimparFiltrosCatalogo');
  assert(limparEscondidoDepois, '"Limpar filtros" deve voltar a ficar escondido depois de limpar');
  const urlLimpa = await page.evaluate(() => location.search);
  assert(urlLimpa === '', `depois de limpar os filtros, a URL não deve carregar mais nenhum parâmetro de filtro — obtido: "${urlLimpa}"`);

  // ---------- 6. faixa de preço (slider + campos numéricos sincronizados) ----------
  const precos = await page.evaluate(() => state.produtos.map(p => ({ nome: p.nome, preco: precoAjustado(p, state.config).precoFinal })));
  const ordenados = [...precos].sort((a, b) => a.preco - b.preco);
  const maisCara = ordenados[ordenados.length - 1];
  const segundaMaisCara = ordenados[ordenados.length - 2];
  const limiar = Math.floor((maisCara.preco + segundaMaisCara.preco) / 2);
  await page.fill('#catPrecoMinInput', String(limiar));
  await page.waitForTimeout(50);
  nomes = await page.$$eval('.item-card h3', els => els.map(e => e.textContent.trim()));
  assert(nomes.length === 1 && nomes[0] === maisCara.nome,
    `filtrando por preço mínimo de R$${limiar} só a peça mais cara ("${maisCara.nome}") deve sobrar — obtido: ${nomes.join(', ')}`);
  const maxInputValorAposFiltro = await page.inputValue('#catPrecoMaxRange');
  assert(Number(maxInputValorAposFiltro) >= Math.ceil(maisCara.preco), 'o campo/slider de máximo não deve ter sido deslocado pelo ajuste do mínimo');

  await page.click('#btnLimparFiltrosCatalogo');
  await page.waitForTimeout(50);

  // ---------- 7. busca por nome: parcial, sem diferenciar maiúsculas/minúsculas e acentos, com debounce ----------
  await page.fill('#catBuscaInput', 'suporte');
  await page.waitForTimeout(50); // antes do debounce (~300ms) — ainda não deve ter filtrado
  nomes = await page.$$eval('.item-card h3', els => els.map(e => e.textContent.trim()));
  assert(nomes.length === 4, `a busca não deve filtrar antes do debounce de ~300ms — obtido (50ms depois): ${nomes.length} peça(s)`);
  await page.waitForTimeout(400); // depois do debounce
  nomes = await page.$$eval('.item-card h3', els => els.map(e => e.textContent.trim()));
  assert(nomes.length === 2 && nomes.includes('Suporte Azul') && nomes.includes('Suporte Verde'),
    `depois do debounce, buscar "suporte" deve trazer as 2 peças com esse nome — obtido: ${nomes.join(', ')}`);

  await page.fill('#catBuscaInput', 'CAFE');
  await page.waitForTimeout(400);
  nomes = await page.$$eval('.item-card h3', els => els.map(e => e.textContent.trim()));
  assert(nomes.length === 1 && nomes[0] === 'Peça Café',
    `busca deve ignorar maiúsculas/minúsculas e acentos ("CAFE" deve achar "Peça Café") — obtido: ${nomes.join(', ')}`);

  await page.click('#btnLimparFiltrosCatalogo');
  await page.waitForTimeout(50);

  await browser.close();

  // ---------- 8. filtros na URL: link compartilhado já abre o catálogo filtrado ----------
  const browser2 = await chromium.launch();
  const page2 = await novaPagina(browser2, '?busca=cestinha');

  const filtroInicialDaUrl = await page2.evaluate(() => ({ busca: state.catalogoFiltros.busca, tab: state.tab }));
  assert(filtroInicialDaUrl.busca === 'cestinha', `o filtro de busca da URL deve ser lido antes do primeiro render — obtido: "${filtroInicialDaUrl.busca}"`);
  assert(filtroInicialDaUrl.tab === 'catalogo', `um link com filtro de catálogo na URL deve abrir direto na aba Catálogo — obtido: "${filtroInicialDaUrl.tab}"`);

  const backupPath = path.resolve(__dirname, '..', 'data', 'biri-prints-3d-backup.json');
  assert(fs.existsSync(backupPath), 'arquivo de backup real deve existir pra esse teste rodar');
  await abrirAbaStandalone(page2, 'admin-parametros');
  await page2.waitForSelector('#importarBackupInput');
  await page2.setInputFiles('#importarBackupInput', backupPath);
  await page2.waitForSelector('#importarBackupStatus:has-text("sucesso")');
  await page2.waitForTimeout(200);

  await abrirAbaStandalone(page2, 'catalogo');
  await page2.waitForSelector('#catBuscaInput', { state: 'attached' }); // painel de filtros começa colapsado no mobile
  const valorBuscaAposImportar = await page2.inputValue('#catBuscaInput');
  assert(valorBuscaAposImportar === 'cestinha', `o campo de busca deve continuar preenchido com o filtro que veio da URL — obtido: "${valorBuscaAposImportar}"`);
  const nomesAposImportar = await page2.$$eval('.item-card h3', els => els.map(e => e.textContent.trim()));
  assert(nomesAposImportar.length === 1 && nomesAposImportar[0] === 'cestinha de maçã',
    `com o filtro "cestinha" (vindo da URL) já aplicado, só "cestinha de maçã" deve aparecer entre as peças reais importadas — obtido: ${nomesAposImportar.join(', ')}`);

  await browser2.close();

  console.log(process.exitCode === 1 ? '\n=== ALGUM TESTE FALHOU ===' : '\n=== TODOS OS TESTES PASSARAM ===');
})();
