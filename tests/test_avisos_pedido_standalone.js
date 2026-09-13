// Testa os avisos manuais de WhatsApp pro cliente no fluxo de Pedidos: "Avisar: <status>" (recebido/
// em produção/pronto/entregue/cancelado, sempre a mensagem do status ATUAL) e "Avisar pagamento" (só
// visível quando o pedido está marcado como pago). 100% manual — só abre o WhatsApp com o texto
// pronto, igual ao "Enviar por WhatsApp" que já existia — nada daqui manda mensagem sozinho.
// Só na standalone (app/biri-prints-3d-standalone.html), única versão que recebe funcionalidade nova.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { passarPeloGateVendedorStandalone, abrirAbaStandalone } = require('./test_helpers_standalone');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('OK:', msg);
}

const FAKE_FIREBASE_JS = fs.readFileSync(path.resolve(__dirname, 'fake_firebase.js'), 'utf8');
const faixaDeEmoji = (cp) =>
  (cp >= 0x1F300 && cp <= 0x1FAFF) || (cp >= 0x2600 && cp <= 0x27BF) || (cp >= 0x2B00 && cp <= 0x2BFF) || cp === 0xFE0F;
const semEmoji = (txt) => [...txt].every(ch => !faixaDeEmoji(ch.codePointAt(0)));

async function criarOrcamentoEConverterEmPedido(page, nomeCliente, telefone) {
  await abrirAbaStandalone(page, 'orcamentos');
  await page.waitForSelector('#fabNovoOrc');
  await page.click('#fabNovoOrc');
  await page.waitForSelector('[data-cliente-modo="novo"]');
  await page.click('[data-cliente-modo="novo"]');
  await page.waitForSelector('#oClienteNome');
  await page.fill('#oClienteNome', nomeCliente);
  if (telefone) await page.fill('#oClienteTelNovo', telefone);
  await page.fill('#oAvulsoNome', 'Item Teste');
  await page.fill('#oAvulsoPreco', '50');
  await page.click('#oAddItem');
  await page.click('#oSalvar');
  await page.waitForSelector(`.card h3:has-text("${nomeCliente}")`);

  await page.click(`.card:has(h3:has-text("${nomeCliente}")) [data-toggle-orc]`);
  await page.waitForSelector('[data-converter-pedido]');
  await page.click('[data-converter-pedido]'); // 1º clique: entra em modo confirmação
  await page.waitForTimeout(80);
  await page.click('[data-converter-pedido]'); // 2º clique: confirma
  await page.waitForTimeout(150);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const context = page.context();
  await context.route('https://www.gstatic.com/firebasejs/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await context.route('https://wa.me/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html>ok</html>' }));
  await context.route('https://api.whatsapp.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html>ok</html>' }));
  await page.addInitScript(FAKE_FIREBASE_JS);

  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'app', 'biri-prints-3d-standalone.html');
  await page.goto(fileUrl);
  await page.waitForSelector('#loginScreen');
  await page.fill('#loginEmail', 'dono@teste.com');
  await page.fill('#loginSenha', 'senha123');
  await page.click('#loginBtn');
  await page.waitForSelector('#sidebarNav [data-nav]');
  await passarPeloGateVendedorStandalone(page);

  // ---------- 1. textos (unitário): personalização, símbolo certo por status, sem emoji de verdade ----------
  const textos = await page.evaluate(() => ({
    aberto: TEXTO_STATUS_PEDIDO.aberto({ cliente: 'Maria' }),
    em_producao: TEXTO_STATUS_PEDIDO.em_producao({ cliente: 'Maria' }),
    pronto: TEXTO_STATUS_PEDIDO.pronto({ cliente: 'Maria' }),
    entregue: TEXTO_STATUS_PEDIDO.entregue({ cliente: 'Maria' }),
    cancelado: TEXTO_STATUS_PEDIDO.cancelado({ cliente: 'Maria' }),
    pago: textoAvisoPagamento({ cliente: 'Maria' }),
    semNome: textoAvisoStatusPedido({ cliente: '', status_pedido: 'aberto' }),
  }));
  assert(textos.aberto.startsWith('■ *Pedido recebido'), `status "aberto" deve usar o símbolo ■ e falar de pedido recebido — obtido: ${textos.aberto}`);
  assert(textos.aberto.includes('Oi, Maria!'), `mensagem deve personalizar com o nome do cliente — obtido: ${textos.aberto}`);
  [textos.em_producao, textos.pronto, textos.entregue, textos.cancelado].forEach(t=>{
    assert(t.startsWith('● *Atualização do seu pedido'), `atualizações de status devem usar o símbolo ● — obtido: ${t}`);
  });
  assert(textos.em_producao.includes('em produção'), `texto de "em produção" deve mencionar produção — obtido: ${textos.em_producao}`);
  assert(textos.pronto.includes('ficou pronto'), `texto de "pronto" deve avisar que ficou pronto — obtido: ${textos.pronto}`);
  assert(textos.entregue.includes('foi entregue'), `texto de "entregue" deve avisar que foi entregue — obtido: ${textos.entregue}`);
  assert(textos.cancelado.includes('cancelado'), `texto de "cancelado" deve avisar do cancelamento — obtido: ${textos.cancelado}`);
  assert(textos.pago.startsWith('◆ *Pagamento confirmado'), `aviso de pagamento deve usar o símbolo ◆ e falar de pagamento confirmado — obtido: ${textos.pago}`);
  assert(textos.semNome.includes('Oi!'), `sem nome de cliente salvo, deve cair num "Oi!" genérico — obtido: ${textos.semNome}`);
  [textos.aberto, textos.em_producao, textos.pronto, textos.entregue, textos.cancelado, textos.pago].forEach(t=>{
    assert(semEmoji(t), `texto não deve conter caractere de faixa de emoji (corrompe no link do WhatsApp) — obtido: ${t}`);
  });

  // ---------- 2. fluxo de UI: cria orçamento com telefone, converte em pedido ----------
  await criarOrcamentoEConverterEmPedido(page, 'Cliente Aviso', '(11) 98888-7777');

  await abrirAbaStandalone(page, 'pedidos');
  await page.waitForSelector(`.card h3:has-text("Cliente Aviso")`);
  await page.click(`.card:has(h3:has-text("Cliente Aviso")) [data-toggle-orc]`);
  await page.waitForSelector('[data-avisar-status]');

  // ---------- 3. pedido recém-convertido (status "aberto") -> botão "Avisar: Recebido" ----------
  let rotuloBotao = await page.$eval('[data-avisar-status]', el => el.textContent.trim());
  assert(rotuloBotao === 'Avisar: Recebido', `pedido novo (status aberto) deve oferecer "Avisar: Recebido" — obtido: "${rotuloBotao}"`);

  let popupPromise = page.waitForEvent('popup');
  await page.click('[data-avisar-status]');
  let popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
  let url = popup.url();
  assert(url.startsWith('https://wa.me/5511988887777?text='), `com telefone salvo, o aviso deve usar wa.me/<numero> — obtido: ${url}`);
  assert(decodeURIComponent(url).includes('Pedido recebido'), `aviso do pedido recém-convertido deve ser o texto de "recebido" — obtido: ${decodeURIComponent(url)}`);
  assert(decodeURIComponent(url).includes('Cliente Aviso'), 'a mensagem deve conter o nome do cliente');
  await popup.close().catch(() => {});

  // ---------- 4. mudar o status -> o rótulo e o texto do botão acompanham o status atual ----------
  await page.selectOption('[data-status-pedido]', 'em_producao');
  await page.waitForTimeout(100);
  rotuloBotao = await page.$eval('[data-avisar-status]', el => el.textContent.trim());
  assert(rotuloBotao === 'Avisar: Em produção', `depois de mudar pra "Em produção", o botão deve acompanhar — obtido: "${rotuloBotao}"`);
  popupPromise = page.waitForEvent('popup');
  await page.click('[data-avisar-status]');
  popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
  assert(decodeURIComponent(popup.url()).includes('em produção agora'), `aviso deve ser o texto de "em produção" — obtido: ${decodeURIComponent(popup.url())}`);
  await popup.close().catch(() => {});

  await page.selectOption('[data-status-pedido]', 'pronto');
  await page.waitForTimeout(100);
  popupPromise = page.waitForEvent('popup');
  await page.click('[data-avisar-status]');
  popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
  assert(decodeURIComponent(popup.url()).includes('ficou pronto'), `aviso deve ser o texto de "pronto" — obtido: ${decodeURIComponent(popup.url())}`);
  await popup.close().catch(() => {});

  await page.selectOption('[data-status-pedido]', 'entregue');
  await page.waitForTimeout(100);
  popupPromise = page.waitForEvent('popup');
  await page.click('[data-avisar-status]');
  popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
  assert(decodeURIComponent(popup.url()).includes('foi entregue'), `aviso deve ser o texto de "entregue" — obtido: ${decodeURIComponent(popup.url())}`);
  await popup.close().catch(() => {});

  // ---------- 5. cancelar pedido -> "Avisar: Cancelado" aparece no branch de cancelado ----------
  await page.click('[data-cancelar-pedido]');
  await page.waitForTimeout(80);
  await page.click('[data-cancelar-pedido]'); // 2º clique confirma
  await page.waitForTimeout(120);
  rotuloBotao = await page.$eval('[data-avisar-status]', el => el.textContent.trim());
  assert(rotuloBotao === 'Avisar: Cancelado', `pedido cancelado deve oferecer "Avisar: Cancelado" — obtido: "${rotuloBotao}"`);
  popupPromise = page.waitForEvent('popup');
  await page.click('[data-avisar-status]');
  popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
  assert(decodeURIComponent(popup.url()).includes('foi cancelado'), `aviso deve ser o texto de "cancelado" — obtido: ${decodeURIComponent(popup.url())}`);
  await popup.close().catch(() => {});

  // ---------- 6. reabrir -> volta a oferecer "Avisar: Recebido" ----------
  await page.click('[data-reabrir-pedido]');
  await page.waitForTimeout(120);
  rotuloBotao = await page.$eval('[data-avisar-status]', el => el.textContent.trim());
  assert(rotuloBotao === 'Avisar: Recebido', `depois de reabrir, o botão deve voltar a "Avisar: Recebido" — obtido: "${rotuloBotao}"`);

  // ---------- 7. pagamento: botão só aparece depois de marcar como pago ----------
  let temBotaoPago = await page.$('[data-avisar-pagamento]');
  assert(!temBotaoPago, '"Avisar pagamento" não deve aparecer antes de marcar o pedido como pago');

  await page.click('[data-toggle-pago]');
  await page.waitForTimeout(100);
  await page.waitForSelector('[data-avisar-pagamento]');
  popupPromise = page.waitForEvent('popup');
  await page.click('[data-avisar-pagamento]');
  popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
  assert(decodeURIComponent(popup.url()).includes('Pagamento confirmado'), `aviso de pagamento deve ser o texto de confirmação — obtido: ${decodeURIComponent(popup.url())}`);
  assert(decodeURIComponent(popup.url()).includes('Cliente Aviso'), 'o aviso de pagamento também deve personalizar com o nome do cliente');
  await popup.close().catch(() => {});

  await page.click('[data-toggle-pago]'); // desmarca de novo
  await page.waitForTimeout(100);
  temBotaoPago = await page.$('[data-avisar-pagamento]');
  assert(!temBotaoPago, '"Avisar pagamento" deve sumir de novo ao desmarcar o pagamento');

  // ---------- 8. sem telefone salvo -> link genérico (mesmo fallback do "Enviar por WhatsApp") ----------
  await criarOrcamentoEConverterEmPedido(page, 'Cliente Sem Telefone Pedido', null);
  await abrirAbaStandalone(page, 'pedidos');
  await page.waitForSelector(`.card h3:has-text("Cliente Sem Telefone Pedido")`);
  await page.click(`.card:has(h3:has-text("Cliente Sem Telefone Pedido")) [data-toggle-orc]`);
  await page.waitForSelector('[data-avisar-status]');
  const botoesAvisar = await page.$$('[data-avisar-status]');
  assert(botoesAvisar.length === 1, `só o pedido expandido deve ter o botão "Avisar" visível — obtido: ${botoesAvisar.length}`);
  popupPromise = page.waitForEvent('popup');
  await botoesAvisar[0].click();
  popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
  assert(popup.url().startsWith('https://api.whatsapp.com/send?text='), `sem telefone salvo, o aviso deve cair no link genérico do WhatsApp — obtido: ${popup.url()}`);
  await popup.close().catch(() => {});

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== ALGUM TESTE FALHOU ===' : '\n=== TODOS OS TESTES PASSARAM ===');
})();
