// Helpers compartilhados entre os arquivos de teste da versão standalone
// (app/biri-prints-3d-standalone.html) — login via Firebase (mock) e o gate de vendedor.

async function loginStandalone(page, { email = 'dono@teste.com', senha = 'senha123' } = {}) {
  await page.waitForSelector('#loginScreen');
  await page.fill('#loginEmail', email);
  await page.fill('#loginSenha', senha);
  await page.click('#loginBtn');
  await page.waitForSelector('#sidebarNav [data-nav]');
}

// Desde a funcionalidade de vendedores, a standalone também abre com uma tela bloqueante ("Quem
// está usando agora?") depois do login — sem escolher/cadastrar um vendedor nesse "aparelho",
// nenhuma aba fica utilizável. Todo teste que não seja o próprio teste do gate precisa passar por
// aqui logo depois do login, antes de interagir com qualquer aba.
async function passarPeloGateVendedorStandalone(page, nome = 'Vendedor Teste') {
  await page.waitForSelector('#vendedorGate');
  await page.click('#btnNovoVendedorGate');
  await page.waitForSelector('#vNome');
  await page.fill('#vNome', nome);
  await page.click('#vSave');
  await page.waitForSelector('#vendedorGate', { state: 'detached' });
}

// Mesma reorganização em menu lateral que a versão principal recebeu: navegar até uma aba deixou
// de ser um clique direto num botão de barra fixa. Os testes rodam em viewport de celular
// (390px), onde o menu é uma gaveta fechada por padrão — então navegar significa: abrir a gaveta
// (hambúrguer), expandir o grupo "Admin" se o destino for um dos submenus dele
// (admin-parametros, admin-impressoras, admin-materiais, admin-grupos, admin-promocoes,
// admin-vendedores), e só então clicar no item. O clique no item já fecha a gaveta sozinho
// (comportamento do app), então não precisamos fechar manualmente.
async function abrirAbaStandalone(page, tabId) {
  await page.click('#btnAbrirMenu');
  await page.waitForSelector('#sidebar.mobile-aberto');
  const precisaExpandirAdmin = tabId.startsWith('admin-');
  if (precisaExpandirAdmin) {
    const jaVisivel = await page.isVisible(`[data-nav="${tabId}"]`);
    if (!jaVisivel) {
      await page.click('[data-nav-group="admin"]');
      await page.waitForSelector(`[data-nav="${tabId}"]`, { state: 'visible' });
    }
  }
  await page.click(`[data-nav="${tabId}"]`);
}

// "Calcular" deixou de ser uma aba própria — cadastrar peça nova agora é um modal aberto a partir
// da aba Catálogo (botão "Adicionar Produto", ou "Adicionar Produto" no estado vazio quando ainda
// não há nenhuma peça salva). Esse helper navega até Catálogo e abre esse modal, ficando pronto
// pra preencher os campos #cNome/#cMaterial/#cImpressora/#cGram/#cTempoH/#cTempoM, iguais a antes.
async function abrirNovoProdutoModalStandalone(page) {
  await abrirAbaStandalone(page, 'catalogo');
  const btnPopulado = await page.$('#btnAdicionarProduto');
  if (btnPopulado) {
    await btnPopulado.click();
  } else {
    await page.waitForSelector('#goCalc');
    await page.click('#goCalc');
  }
  await page.waitForSelector('#cNome');
}

module.exports = { loginStandalone, passarPeloGateVendedorStandalone, abrirAbaStandalone, abrirNovoProdutoModalStandalone };
