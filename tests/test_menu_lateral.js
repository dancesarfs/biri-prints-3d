const { chromium } = require('playwright');
const path = require('path');
const { passarPeloGateVendedor, abrirAba } = require('./test_helpers');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('OK:', msg);
}

// Reorganização dos menus: as abas de cima viraram um menu lateral em lista, recolhível (ícones só,
// no desktop) ou em gaveta full-screen (no celular). "Ajustes" virou "Admin", com cada seção que
// antes era um pedaço da mesma página agora um submenu com formulário exclusivo. "Produto"/
// "Calcular" não é mais um item do menu — cadastrar peça nova virou um modal aberto direto da aba
// Catálogo (ver test_novo_peca.js/test_validacao_campos.js), então a aba inicial do app é Catálogo.
(async () => {
  const browser = await chromium.launch();

  // ================= CELULAR (390px): menu em gaveta =================
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'app', 'bancada-3d.html');
  await page.goto(fileUrl);
  await passarPeloGateVendedor(page, 'Vendedor Menu');
  await page.waitForSelector('#btnAbrirMenu');

  const escondidaAntes = await page.$eval('#sidebar', el => !el.classList.contains('mobile-aberto'));
  assert(escondidaAntes, 'no celular, a gaveta do menu deve começar fechada');

  await page.click('#btnAbrirMenu');
  await page.waitForSelector('#sidebar.mobile-aberto');
  assert(true, 'hambúrguer abre a gaveta');

  const labels = await page.$$eval('.nav-item span', els => els.map(e => e.textContent));
  assert(labels.includes('Admin'), `menu deve ter um item "Admin" (renomeado de "Ajustes") — obtido: ${labels.join(', ')}`);
  assert(!labels.includes('Ajustes'), 'o nome antigo "Ajustes" não deve mais aparecer no menu');
  assert(!labels.includes('Calcular'), 'o nome antigo "Calcular" não deve mais aparecer como item de topo');
  assert(!labels.includes('Produto'), '"Produto" não deve mais aparecer como item do menu (virou um modal dentro de Catálogo)');

  // a aba inicial é Catálogo, que fica fora de Admin — o grupo deve começar fechado
  const adminFechadoDeInicio = await page.isHidden('[data-nav="admin-vendedores"]');
  assert(adminFechadoDeInicio, 'ao abrir o app (Catálogo, fora de Admin), o grupo Admin deve começar fechado');
  await page.waitForSelector('.item-card, .empty'); // tela de catálogo já carregada de início

  // navega pra Pedidos (outro item de topo, fora de Admin) — deve fechar a gaveta sozinho
  await page.click('[data-nav="pedidos"]');
  await page.waitForSelector('#sidebar:not(.mobile-aberto)');
  assert(true, 'clicar num item de navegação fecha a gaveta automaticamente');

  // reabre o menu — Admin continua fechado (não estamos em nenhuma sub-aba dele)
  await page.click('#btnAbrirMenu');
  await page.waitForSelector('#sidebar.mobile-aberto');
  const adminFechadoDeNovo = await page.isHidden('[data-nav="admin-vendedores"]');
  assert(adminFechadoDeNovo, 'ao reabrir a gaveta fora de uma sub-aba de Admin, o grupo deve estar fechado');

  // expande manualmente clicando no grupo Admin
  await page.click('[data-nav-group="admin"]');
  await page.waitForSelector('[data-nav="admin-vendedores"]', { state: 'visible' });
  const chevronAberto = await page.$eval('.chevron', el => el.classList.contains('aberto'));
  assert(chevronAberto, 'clicar no grupo Admin gira a seta e mostra os submenus');

  // confere que as 6 seções aparecem como submenu de Admin (sem "Produto", que não existe mais)
  const filhosAdmin = await page.$$eval('.nav-children .nav-item span', els => els.map(e => e.textContent));
  ['Parâmetros de custo','Impressoras','Materiais','Grupos de kit','Promoções sazonais','Vendedores'].forEach(nome=>{
    assert(filhosAdmin.includes(nome), `Admin deve ter o submenu "${nome}" — obtido: ${filhosAdmin.join(', ')}`);
  });
  assert(!filhosAdmin.includes('Produto'), 'Admin não deve mais ter um submenu "Produto"');

  await page.click('[data-nav="admin-vendedores"]');
  await page.waitForSelector('#vendedorList');
  assert(true, 'navegar até um submenu de Admin abre a página exclusiva dele (Vendedores)');

  // reabre a gaveta ainda dentro de uma sub-aba de Admin — o grupo deve vir expandido sozinho
  await page.click('#btnAbrirMenu');
  await page.waitForSelector('#sidebar.mobile-aberto');
  const adminAbertoNaSubAba = await page.isVisible('[data-nav="admin-vendedores"]');
  assert(adminAbertoNaSubAba, 'ao reabrir a gaveta estando numa sub-aba de Admin (Vendedores), o grupo já deve vir expandido');

  // fecha a gaveta clicando no fundo (backdrop)
  // a sidebar em si (não o backdrop) ocupa a faixa esquerda da tela (82vw, máx. 300px) — clica
  // fora dessa faixa, à direita, pra garantir que o clique caia no backdrop e não na sidebar
  await page.click('#sidebarBackdrop', { position: { x: 350, y: 400 } });
  await page.waitForSelector('#sidebar:not(.mobile-aberto)');
  assert(true, 'clicar no fundo escurecido fecha a gaveta sem navegar');

  // ================= DESKTOP (1280px): sidebar fixa, recolhível ícones-só =================
  const pageD = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await pageD.goto(fileUrl);
  await passarPeloGateVendedor(pageD, 'Vendedor Desktop');
  await pageD.waitForSelector('#sidebarNav .nav-item');

  const hamburgerEscondido = await pageD.isHidden('#btnAbrirMenu');
  assert(hamburgerEscondido, 'no desktop, o botão de hambúrguer não deve aparecer (a sidebar já fica visível)');

  const larguraCheia = await pageD.$eval('#sidebar', el => getComputedStyle(el).width);
  assert(parseInt(larguraCheia) > 150, `sidebar do desktop deve começar expandida (largura maior que 150px) — obtido: ${larguraCheia}`);

  await pageD.click('[data-nav="pedidos"]');
  await pageD.waitForSelector('#pedList, .empty');
  assert(true, 'no desktop, clicar num item navega direto (sidebar sempre visível, sem precisar abrir nada)');

  await pageD.click('#sidebarToggle');
  await pageD.waitForTimeout(200);
  const larguraColapsada = await pageD.$eval('#sidebar', el => getComputedStyle(el).width);
  assert(parseInt(larguraColapsada) < 100, `"Recolher menu" deve encolher a sidebar pra uma trilha de ícones — obtido: ${larguraColapsada}`);
  const labelsEscondidos = await pageD.isHidden('.nav-item span');
  assert(labelsEscondidos, 'com a sidebar recolhida, os textos dos itens ficam escondidos (só ícone)');

  // clicar no grupo Admin colapsado deve reabrir a sidebar por completo (não dá pra mostrar submenu numa trilha estreita)
  await pageD.click('[data-nav-group="admin"]');
  await pageD.waitForTimeout(200);
  const larguraReaberta = await pageD.$eval('#sidebar', el => getComputedStyle(el).width);
  assert(parseInt(larguraReaberta) > 150, `clicar em Admin colapsado deve reabrir a sidebar — largura obtida: ${larguraReaberta}`);
  const vendedoresVisivel = await pageD.isVisible('[data-nav="admin-vendedores"]');
  assert(vendedoresVisivel, 'depois de reabrir por causa do clique em Admin, o submenu deve estar expandido');

  // recolhe de novo e confere persistência via localStorage entre reloads
  await pageD.click('#sidebarToggle');
  await pageD.waitForTimeout(150);
  const salvoAntesReload = await pageD.evaluate(() => localStorage.getItem('sidebarColapsado'));
  assert(salvoAntesReload === '1', `estado recolhido deve ser salvo no localStorage — obtido: ${salvoAntesReload}`);

  await pageD.reload();
  await pageD.waitForSelector('#sidebarNav .nav-item');
  await pageD.waitForTimeout(250); // aguarda a transição de largura (.18s) terminar
  const larguraAposReload = await pageD.$eval('#sidebar', el => getComputedStyle(el).width);
  assert(parseInt(larguraAposReload) < 100, `sidebar deve continuar recolhida depois de recarregar a página — obtido: ${larguraAposReload}`);

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== ALGUM TESTE FALHOU ===' : '\n=== TODOS OS TESTES PASSARAM ===');
})();
