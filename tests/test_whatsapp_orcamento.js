const { chromium } = require('playwright');
const path = require('path');
const { passarPeloGateVendedor, abrirAba } = require('./test_helpers');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('OK:', msg);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  // esse ambiente de teste não tem acesso à internet liberado pra wa.me/api.whatsapp.com —
  // intercepta e responde localmente, só pra poder inspecionar a URL que o botão tentou abrir
  // (sem isso, a aba nova cai numa página de erro de rede e perde a URL original).
  const context = page.context();
  await context.route('https://wa.me/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html>ok</html>' }));
  await context.route('https://api.whatsapp.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html>ok</html>' }));
  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'app', 'bancada-3d.html');
  await page.goto(fileUrl);
  await passarPeloGateVendedor(page);
  await page.waitForSelector('#btnAbrirMenu');

  // ---------- 1. normalização de telefone (unitário) ----------
  const norm = await page.evaluate(() => ({
    comDDI: normalizarTelefoneWhatsApp('+55 11 91234-5678'),
    semDDI: normalizarTelefoneWhatsApp('(11) 91234-5678'),
    semDDIFixo: normalizarTelefoneWhatsApp('11 3456-7890'),
    semFormatacao: normalizarTelefoneWhatsApp('11912345678'),
    vazio: normalizarTelefoneWhatsApp(''),
    soEspacos: normalizarTelefoneWhatsApp('   '),
    jaComDDI13: normalizarTelefoneWhatsApp('5511912345678'),
  }));
  assert(norm.comDDI === '5511912345678', `com DDI já informado deve manter — obtido: ${norm.comDDI}`);
  assert(norm.semDDI === '5511912345678', `celular sem DDI deve ganhar o 55 — obtido: ${norm.semDDI}`);
  assert(norm.semDDIFixo === '551134567890', `fixo sem DDI (10 dígitos) deve ganhar o 55 — obtido: ${norm.semDDIFixo}`);
  assert(norm.semFormatacao === '5511912345678', `celular já só com dígitos, sem DDI, deve ganhar o 55 — obtido: ${norm.semFormatacao}`);
  assert(norm.vazio === '', 'telefone vazio deve continuar vazio');
  assert(norm.soEspacos === '', 'telefone só com espaços deve virar vazio');
  assert(norm.jaComDDI13 === '5511912345678', `já formatado certinho deve passar direto — obtido: ${norm.jaComDDI13}`);

  // ---------- 2. gerarTextoOrcamento (unitário) ----------
  const texto = await page.evaluate(() => {
    const o = {
      cliente: 'Escola Municipal', criado_em: '2026-09-01T10:00:00.000Z',
      itens: [{ nome: 'Porta canetas', quantidade: 2, preco_unit: 15 }],
      desconto_kit_total: 0, total: 30,
    };
    return gerarTextoOrcamento(o);
  });
  assert(texto.includes('Escola Municipal'), 'texto do orçamento deve incluir o nome do cliente');
  assert(texto.startsWith('■ *Orçamento — Escola Municipal*'), `cabeçalho deve seguir o mesmo padrão do catálogo (ícone + negrito) — obtido: ${texto}`);
  assert(texto.includes('◆ *Porta canetas* × 2 —'), `item deve seguir o padrão "◆ *nome* × qtd —" do catálogo — obtido: ${texto}`);
  // Testado de verdade no celular: QUALQUER caractere que o WhatsApp reconhece como emoji
  // (mesmo um "clássico" de 1 code unit, tipo ✅) chega corrompido (&#xFFFD;) quando o texto
  // vem de um link wa.me/api.whatsapp.com — só símbolos comuns (nunca tratados como emoji,
  // tipo ◆■●▲) sobrevivem. Essa checagem cobre os blocos Unicode onde vivem os emoji mais
  // usados (símbolos/dingbats/emoticons/símbolos diversos, clássicos e modernos) — os ícones
  // deste app usam só o bloco "Geometric Shapes", fora dessa faixa.
  const faixaDeEmoji = (cp) =>
    (cp >= 0x1F300 && cp <= 0x1FAFF) || // emoji "modernos" (par substituto)
    (cp >= 0x2600 && cp <= 0x27BF) ||   // símbolos diversos + dingbats (inclui ✅✨)
    (cp >= 0x2B00 && cp <= 0x2BFF) ||   // símbolos diversos e setas (inclui ⭐)
    cp === 0xFE0F;                      // seletor de variação emoji
  assert([...texto].every(ch => !faixaDeEmoji(ch.codePointAt(0))), `texto não deve conter nenhum caractere de faixa de emoji conhecida (risco de corrupção no link do WhatsApp) — obtido: ${texto}`);
  assert(texto.includes('*Total: R$'), 'total deve vir em negrito, no mesmo padrão do catálogo');

  // ---------- 2b. gerarTextoOrcamento com desconto de kit (deve mostrar Subtotal -> desconto -> Total) ----------
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
  assert(textoComDesconto.includes('Subtotal: R$'), `com desconto de kit, o texto deve mostrar o subtotal (valor antes do desconto) — obtido: ${textoComDesconto}`);
  const idxSubtotal = textoComDesconto.indexOf('Subtotal:');
  const idxDesconto = textoComDesconto.indexOf('Desconto de kit');
  const idxTotal = textoComDesconto.indexOf('*Total:');
  assert(idxSubtotal >= 0 && idxDesconto > idxSubtotal && idxTotal > idxDesconto, `ordem deve ser Subtotal -> Desconto -> Total — obtido: ${textoComDesconto}`);
  assert(textoComDesconto.includes('Subtotal: R$ 30,00'), `subtotal deve ser o valor SEM desconto (R$ 30,00) — obtido: ${textoComDesconto}`);
  assert(textoComDesconto.includes('*Total: R$ 27,75*'), `total deve continuar sendo o valor COM desconto (R$ 27,75) — obtido: ${textoComDesconto}`);

  // ---------- 3. fluxo de UI: criar orçamento com telefone e enviar por WhatsApp ----------
  await abrirAba(page, 'orcamentos'); // Orçamentos
  await page.waitForSelector('#fabNovoOrc');
  await page.click('#fabNovoOrc');
  await page.waitForSelector('[data-cliente-modo="novo"]');
  await page.click('[data-cliente-modo="novo"]');
  await page.waitForSelector('#oClienteNome');
  await page.fill('#oClienteNome', 'Cliente WhatsApp');
  await page.fill('#oClienteTelNovo', '(11) 98888-7777');
  await page.selectOption('#oProdSel', { label: 'TESTE' });
  await page.click('#oAddItem');
  await page.click('#oSalvar');
  await page.waitForSelector('.card h3:has-text("Cliente WhatsApp")');
  await page.click('[data-toggle-orc]'); // só tem 1 orçamento até aqui — expande pra revelar os botões de ação
  await page.waitForSelector('[data-whatsapp]');

  // o botão agora abre um <a target="_blank"> real (não window.open) — pra funcionar também
  // em navegadores/webviews que bloqueiam popup aberto via script mas respeitam link real.
  // No teste, isso aparece como um evento "popup" (nova aba) do Playwright.
  const popupPromise1 = page.waitForEvent('popup');
  await page.click('[data-whatsapp]');
  const popup1 = await popupPromise1;
  await popup1.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(()=>{}); // sem internet liberada nesse ambiente de teste — só confere a URL que tentou abrir
  const urlAberta1 = popup1.url();
  assert(urlAberta1.startsWith('https://wa.me/5511988887777?text='), `com telefone salvo deve usar wa.me/<numero> — obtido: ${urlAberta1}`);
  assert(decodeURIComponent(urlAberta1).includes('Cliente WhatsApp'), 'a mensagem codificada na URL deve conter o nome do cliente');
  assert(decodeURIComponent(urlAberta1).includes('TESTE'), 'a mensagem deve conter o item do orçamento');
  await popup1.close().catch(()=>{});

  // ---------- 4. orçamento sem telefone -> link genérico (usuário escolhe o contato) ----------
  await page.click('#fabNovoOrc');
  await page.waitForSelector('[data-cliente-modo="novo"]');
  await page.click('[data-cliente-modo="novo"]');
  await page.waitForSelector('#oClienteNome');
  await page.fill('#oClienteNome', 'Cliente Sem Telefone');
  await page.selectOption('#oProdSel', { label: 'TESTE' });
  await page.click('#oAddItem');
  await page.click('#oSalvar');
  await page.waitForSelector('.card h3:has-text("Cliente Sem Telefone")');
  // esse orçamento entra no topo da lista (mais recente primeiro); expande ele
  // (isso automaticamente recolhe o anterior, já que só um card fica expandido por vez)
  const toggles = await page.$$('[data-toggle-orc]');
  await toggles[0].click();
  await page.waitForSelector('[data-whatsapp]');

  const botoesWhats = await page.$$('[data-whatsapp]');
  assert(botoesWhats.length === 1, `só o orçamento expandido deve ter o botão visível — obtido: ${botoesWhats.length}`);
  const popupPromise2 = page.waitForEvent('popup');
  await botoesWhats[0].click();
  const popup2 = await popupPromise2;
  await popup2.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(()=>{});
  const urlAberta2 = popup2.url();
  assert(urlAberta2.startsWith('https://api.whatsapp.com/send?text='), `sem telefone deve usar o link genérico do WhatsApp — obtido: ${urlAberta2}`);
  await popup2.close().catch(()=>{});

  await browser.close();
  console.log(process.exitCode === 1 ? '\n=== ALGUM TESTE FALHOU ===' : '\n=== TODOS OS TESTES PASSARAM ===');
})();
