const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { passarPeloGateVendedorStandalone } = require('./test_helpers_standalone');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('OK:', msg);
}

const FAKE_FIREBASE_JS = fs.readFileSync(path.resolve(__dirname, 'fake_firebase.js'), 'utf8');

async function login(page) {
  await page.waitForSelector('#loginScreen');
  await page.fill('#loginEmail', 'dono@teste.com');
  await page.fill('#loginSenha', 'senha123');
  await page.click('#loginBtn');
  await page.waitForSelector('#tabsBottom button');
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const context = page.context();
  // sem internet liberada nesse ambiente de teste pra gstatic.com/wa.me/api.whatsapp.com —
  // intercepta tudo localmente (mesmo padrão de test_standalone_firebase.js e
  // test_whatsapp_orcamento.js, respectivamente)
  await context.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await context.route('https://wa.me/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html>ok</html>' }));
  await context.route('https://api.whatsapp.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html>ok</html>' }));
  await page.addInitScript(FAKE_FIREBASE_JS);

  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'app', 'biri-prints-3d-standalone.html');
  await page.goto(fileUrl);
  await login(page);
  await passarPeloGateVendedorStandalone(page);

  // ---------- 1. normalização de telefone (unitário) ----------
  const norm = await page.evaluate(() => ({
    comDDI: normalizarTelefoneWhatsApp('+55 11 91234-5678'),
    semDDI: normalizarTelefoneWhatsApp('(11) 91234-5678'),
    semFormatacao: normalizarTelefoneWhatsApp('11912345678'),
    vazio: normalizarTelefoneWhatsApp(''),
  }));
  assert(norm.comDDI === '5511912345678', `com DDI já informado deve manter — obtido: ${norm.comDDI}`);
  assert(norm.semDDI === '5511912345678', `celular sem DDI deve ganhar o 55 — obtido: ${norm.semDDI}`);
  assert(norm.semFormatacao === '5511912345678', `celular já só com dígitos, sem DDI, deve ganhar o 55 — obtido: ${norm.semFormatacao}`);
  assert(norm.vazio === '', 'telefone vazio deve continuar vazio');

  // ---------- 2. gerarTextoOrcamento (unitário) — mesmo padrão visual do catálogo/orçamento da versão principal ----------
  const texto = await page.evaluate(() => {
    const o = {
      cliente: 'Escola Municipal', criado_em: '2026-09-01T10:00:00.000Z',
      itens: [{ nome: 'Porta canetas', quantidade: 2, preco_unit: 15 }],
      desconto_kit_total: 0, total: 30,
    };
    return gerarTextoOrcamento(o);
  });
  assert(texto.startsWith('■ *Orçamento — Escola Municipal*'), `cabeçalho deve seguir o padrão ícone+negrito — obtido: ${texto}`);
  assert(texto.includes('◆ *Porta canetas* × 2 —'), `item deve seguir o padrão "◆ *nome* × qtd —" — obtido: ${texto}`);
  assert(texto.includes('*Total: R$'), 'total deve vir em negrito');
  const faixaDeEmoji = (cp) =>
    (cp >= 0x1F300 && cp <= 0x1FAFF) || (cp >= 0x2600 && cp <= 0x27BF) || (cp >= 0x2B00 && cp <= 0x2BFF) || cp === 0xFE0F;
  assert([...texto].every(ch => !faixaDeEmoji(ch.codePointAt(0))), `texto não deve conter caractere de faixa de emoji (corrompe no link do WhatsApp) — obtido: ${texto}`);

  const textoComDesconto = await page.evaluate(() => {
    const o = {
      cliente: 'Escola Municipal', criado_em: '2026-09-01T10:00:00.000Z',
      itens: [{ nome: 'Porta canetas', quantidade: 2, preco_unit: 15 }],
      subtotal: 30, desconto_kit_total: 2.25,
      desconto_kit_linhas: [{ promoNome: 'Dia dos professores', pct: 5, desconto: 2.25 }],
      total: 27.75,
    };
    return gerarTextoOrcamento(o);
  });
  const idxSubtotal = textoComDesconto.indexOf('Subtotal:');
  const idxDesconto = textoComDesconto.indexOf('Desconto de kit');
  const idxTotal = textoComDesconto.indexOf('*Total:');
  assert(idxSubtotal >= 0 && idxDesconto > idxSubtotal && idxTotal > idxDesconto, `ordem deve ser Subtotal -> Desconto -> Total — obtido: ${textoComDesconto}`);

  // ---------- 3. fluxo de UI: criar orçamento com telefone e enviar por WhatsApp ----------
  await page.click('#tabsBottom button:nth-child(3)'); // Orçamentos
  await page.waitForSelector('#fabNovoOrc');
  await page.click('#fabNovoOrc');
  await page.waitForSelector('#oCliente');
  await page.fill('#oCliente', 'Cliente WhatsApp');
  await page.fill('#oClienteTelefone', '(11) 98888-7777');
  await page.fill('#oAvulsoNome', 'Item Teste');
  await page.fill('#oAvulsoPreco', '50');
  await page.click('#oAddItem');
  await page.click('#oSalvar');
  await page.waitForSelector('.card h3:has-text("Cliente WhatsApp")');
  await page.click('[data-toggle-orc]'); // só tem 1 orçamento até aqui — expande pra revelar os botões de ação
  await page.waitForSelector('[data-whatsapp]');

  // o botão abre um <a target="_blank"> real (não window.open) — aparece como evento "popup"
  const popupPromise1 = page.waitForEvent('popup');
  await page.click('[data-whatsapp]');
  const popup1 = await popupPromise1;
  await popup1.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
  const urlAberta1 = popup1.url();
  assert(urlAberta1.startsWith('https://wa.me/5511988887777?text='), `com telefone salvo deve usar wa.me/<numero> — obtido: ${urlAberta1}`);
  assert(decodeURIComponent(urlAberta1).includes('Cliente WhatsApp'), 'a mensagem codificada na URL deve conter o nome do cliente');
  assert(decodeURIComponent(urlAberta1).includes('Item Teste'), 'a mensagem deve conter o item do orçamento');
  await popup1.close().catch(() => {});

  // ---------- 4. orçamento sem telefone -> link genérico (usuário escolhe o contato) ----------
  await page.click('#fabNovoOrc');
  await page.waitForSelector('#oCliente');
  await page.fill('#oCliente', 'Cliente Sem Telefone');
  await page.fill('#oAvulsoNome', 'Item Teste 2');
  await page.fill('#oAvulsoPreco', '30');
  await page.click('#oAddItem');
  await page.click('#oSalvar');
  await page.waitForSelector('.card h3:has-text("Cliente Sem Telefone")');
  const toggles = await page.$$('[data-toggle-orc]'); // mais recente primeiro
  await toggles[0].click();
  await page.waitForSelector('[data-whatsapp]');

  const botoesWhats = await page.$$('[data-whatsapp]');
  assert(botoesWhats.length === 1, `só o orçamento expandido deve ter o botão visível — obtido: ${botoesWhats.length}`);
  const popupPromise2 = page.waitForEvent('popup');
  await botoesWhats[0].click();
  const popup2 = await popupPromise2;
  await popup2.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
  const urlAberta2 = popup2.url();
  assert(urlAberta2.startsWith('https://api.whatsapp.com/send?text='), `sem telefone deve usar o link genérico do WhatsApp — obtido: ${urlAberta2}`);
  await popup2.close().catch(() => {});

  // ---------- 5. "Copiar resumo" também usa o mesmo texto padronizado (gerarTextoOrcamento) ----------
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.click('[data-copy]');
  await page.waitForTimeout(150);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  assert(clip.startsWith('■ *Orçamento — Cliente Sem Telefone*'), `"Copiar resumo" deve usar o mesmo formato padronizado — obtido: ${clip}`);

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== ALGUM TESTE FALHOU ===' : '\n=== TODOS OS TESTES PASSARAM ===');
})();
