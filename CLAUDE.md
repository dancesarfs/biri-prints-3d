# Biri Prints 3D — contexto para o Claude Code

Este projeto foi construído inteiramente em conversas com o Claude (Chat/Cowork), sem repositório git até agora. Antes de fazer qualquer alteração, leia:

- `docs/bancada-3d-app.md` — histórico completo de decisões de produto, funcionalidades e o porquê de cada uma (é o documento mais importante deste repositório).
- `docs/diagnostico-precificacao.md` — como o modelo de custo/preço foi validado.
- `docs/STANDALONE-SETUP.md` — como publicar a versão standalone.
- `README.md` — visão geral da estrutura de pastas.

## Ambientes: QA e PROD — onde trabalhar

Desde 2026-09-16, o projeto tem dois ambientes Firebase separados, pra parar de misturar dados de teste com dados reais de orçamentos/pedidos:

- **QA** (branch `qa`, projeto Firebase `biri-prints-3d-qa`) — ambiente de validação. Todo push na branch `qa` publica automaticamente `app/biri-prints-3d-standalone.html` no Firebase Hosting desse projeto (workflow `.github/workflows/deploy-qa.yml`), em **https://biri-prints-3d-qa.web.app/**.
- **PROD** (branch `main`, projeto Firebase `biri-prints-3d`) — o que está no ar de verdade, publicado pelo GitHub Pages (inalterado, ver `docs/STANDALONE-SETUP.md`).

**Regra a partir de agora: todo trabalho novo (funcionalidade ou correção) nasce de uma branch a partir da `qa`, e a PR aponta pra `qa` como base** — nunca direto pra `main`. Só mescla `qa` → `main` quando o usuário pedir explicitamente que uma leva de mudanças já validada em QA está pronta pra produção.

A árvore da `qa` difere da `main` em exatamente 4 pontos, que **nunca** podem ir pra `main`:
1. `FIREBASE_CONFIG` em `app/biri-prints-3d-standalone.html` (aponta pro projeto de QA).
2. `.github/workflows/deploy-qa.yml`
3. `firebase.json`
4. `.firebaserc`

Uma checagem de CI (`tests/check_firebase_config.js`, chamada por um passo condicional em `.github/workflows/tests.yml`) roda só quando o alvo é a `main` (push direto nela, ou PR com base `main`) e bloqueia se o `FIREBASE_CONFIG` não for o de produção — mas ela é a rede de segurança, não o processo. O processo de promoção correto é:

1. Criar uma branch temporária a partir da `qa` (ex.: `promote-qa-AAAAMMDD`).
2. Nela: apagar os 3 arquivos só-QA (`deploy-qa.yml`, `firebase.json`, `.firebaserc`) e restaurar o `FIREBASE_CONFIG` de produção em `app/biri-prints-3d-standalone.html`.
3. Abrir uma PR dessa branch **pra `main`** (nunca dar push direto na `main`) — com a base sendo `main`, a checagem do item acima roda automaticamente e barra o merge se algo ficou errado, **antes** de qualquer coisa ir pro ar, não só depois.
4. Só mesclar depois da CI verde.
5. Apagar a branch temporária de promoção depois do merge.

## `app/biri-prints-3d-standalone.html` é a única versão oficial

Desde 2026-09-11, quando a standalone alcançou paridade funcional completa com a principal (confirmado função por função e pela suíte de testes — ver `docs/bancada-3d-app.md`):

- **`app/biri-prints-3d-standalone.html`** é a versão oficial, usada no dia a dia (Firebase + login de verdade). **Toda evolução a partir de agora — funcionalidade nova ou correção de bug — acontece só nela.**
- **`app/bancada-3d.html`** (a versão hospedada como Artifact do Claude) é **legado**: não recebe mais funcionalidades novas, existe só como registro histórico de como o sistema evoluiu até a standalone alcançar paridade. **Não editar**, a menos que explicitamente pedido.

## Testes

Suíte Playwright em `tests/`, sem framework de teste (cada arquivo é um script que roda sozinho e usa `process.exitCode = 1` pra sinalizar falha). Rode com `npm test` (ou `node tests/run-all.js`) depois de `npm install` e `npx playwright install chromium`. **Sempre rode a suíte completa antes de considerar uma mudança pronta** — o histórico em `docs/bancada-3d-app.md` mostra várias regressões sutis (HTML mal-fechado, navegação quebrada) que só a suíte pegou.

## Padrão de UI: botão de criar/cadastrar

Toda tela de cadastro (uma lista de registros com Editar/Excluir por item — Catálogo, Impressoras, Materiais, Grupos de kit, Promoções sazonais, Vendedores, Clientes, Orçamentos, Cores, e qualquer tela nova do mesmo tipo) usa **só** o FAB (`addFab(id, onClick)`, já definido no arquivo) como botão de criar:

- Botão circular azul, ícone "+", **fixo no canto inferior direito** (`position:fixed`), **sempre visível** — inclusive com a lista vazia.
- Chamado no final da função de render da tela (ex.: `addFab('fabAddMaterial', ()=>openMaterialEditor(null))`), depois de montar a lista — `renderMain()` já remove todo `.fab` no início de cada render, então cada tela precisa chamar `addFab` de novo a cada vez que renderiza (normal e vazia).
- **Não conviver** com um botão de texto solto (`+ X`) fazendo a mesma coisa na mesma tela — o FAB substitui esse botão, não se soma a ele.
- Uma chamada centralizada no estado vazio (ex.: "Adicionar Produto" no meio da tela, como no Catálogo) pode continuar existindo **junto** com o FAB — isso não é duplicação, é reforço num momento em que a tela está vazia.
- **Pedidos é exceção**: não tem FAB nem qualquer botão de criar, de propósito — não existe fluxo de "criar pedido do zero" (pedido só nasce convertendo um orçamento aprovado em Orçamentos). Parâmetros de custo também não se aplica — é formulário único, não lista de cadastros.

Referência de implementação: `addFab` (~linha 852) e seu uso em `renderCatalogo`/`renderClientes`/`renderOrcamentos`.

## Estilo de trabalho que o usuário espera

A leitura de `docs/bancada-3d-app.md` deixa isso claro pelo padrão repetido: antes de decisões de design com mais de uma opção razoável, é comum apresentar o levantamento e perguntar ao usuário em vez de decidir sozinho — e depois de implementar, validar visualmente antes de dar como concluído.
