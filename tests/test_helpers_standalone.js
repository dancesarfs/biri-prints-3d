// Helpers compartilhados entre os arquivos de teste da versão standalone
// (app/biri-prints-3d-standalone.html) — login via Firebase (mock) e o gate de vendedor.

async function loginStandalone(page, { email = 'dono@teste.com', senha = 'senha123' } = {}) {
  await page.waitForSelector('#loginScreen');
  await page.fill('#loginEmail', email);
  await page.fill('#loginSenha', senha);
  await page.click('#loginBtn');
  await page.waitForSelector('#tabsBottom button');
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

module.exports = { loginStandalone, passarPeloGateVendedorStandalone };
