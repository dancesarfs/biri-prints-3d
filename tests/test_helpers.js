// Helpers compartilhados entre os arquivos de teste do bancada-3d.html.

// Desde a funcionalidade de vendedores, o app abre com uma tela bloqueante ("Quem está usando
// agora?") até escolher um vendedor — sem isso, nenhuma aba fica acessível. Todo teste precisa
// passar por ela logo depois do page.goto(), antes de interagir com qualquer aba.
async function passarPeloGateVendedor(page, nome = 'Vendedor Teste') {
  await page.waitForSelector('#vendedorGate');
  await page.click('#btnNovoVendedorGate');
  await page.waitForSelector('#vNome');
  await page.fill('#vNome', nome);
  await page.click('#vSave');
  await page.waitForSelector('#vendedorGate', { state: 'detached' });
}

// Desde a reorganização em menu lateral (sidebar em lista, recolhível no desktop e em gaveta no
// celular), navegar até uma aba deixou de ser um clique direto num botão de barra fixa. Os testes
// rodam em viewport de celular (390px), onde o menu é uma gaveta fechada por padrão — então
// navegar significa: abrir a gaveta (hambúrguer), expandir o grupo "Admin" se o destino for um dos
// submenus dele (admin-parametros, admin-impressoras, admin-materiais, admin-grupos,
// admin-promocoes, admin-vendedores), e só então clicar no item. O clique no item já fecha a
// gaveta sozinho (comportamento do app), então não precisamos fechar manualmente.
async function abrirAba(page, tabId) {
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

// "Produto" deixou de ser uma aba própria — cadastrar peça nova agora é um modal aberto a partir
// da aba Catálogo (botão "Adicionar Produto", ou "Adicionar Produto" no estado vazio quando ainda
// não há nenhuma peça salva). Esse helper navega até Catálogo e abre esse modal, ficando pronto
// pra preencher os campos #cNome/#cMaterial/#cImpressora/#cGram/#cTempoH/#cTempoM/#cEmb, iguais
// a antes.
async function abrirNovoProdutoModal(page) {
  await abrirAba(page, 'catalogo');
  const btnPopulado = await page.$('#btnAdicionarProduto');
  if (btnPopulado) {
    await btnPopulado.click();
  } else {
    await page.waitForSelector('#goCalc');
    await page.click('#goCalc');
  }
  await page.waitForSelector('#cNome');
}

module.exports = { passarPeloGateVendedor, abrirAba, abrirNovoProdutoModal };
