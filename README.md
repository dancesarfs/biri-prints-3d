# Biri Prints 3D

Sistema de precificação e gestão pra uma operação de impressão 3D (catálogo de peças, orçamentos, pedidos, clientes, vendedores) — construído aos poucos em conversas com o Claude, pra substituir uma planilha de Excel.

## Estrutura do repositório

```
app/
  bancada-3d.html                  → versão principal, com todas as funcionalidades (usada até aqui como Artifact do Claude)
  biri-prints-3d-standalone.html   → versão pra rodar fora do Claude (Firebase + login), mais atrasada em recursos
data/
  biri-prints-3d-backup.json       → snapshot real dos dados (catálogo, impressora, material, kit, promoção)
docs/
  bancada-3d-app.md                → histórico completo de decisões de produto e funcionalidades
  diagnostico-precificacao.md      → como o modelo de custo/preço foi validado (vindo da planilha original)
  STANDALONE-SETUP.md              → passo a passo pra publicar a versão standalone (Firebase + GitHub Pages)
tests/
  test_*.js                        → suíte de testes end-to-end (Playwright), sem framework — cada arquivo roda sozinho
  run-all.js                       → roda todos os testes em sequência e imprime um resumo
```

## Rodando os testes

```
npm install
npx playwright install chromium   # só na primeira vez
npm test
```

Cada teste abre o HTML correspondente direto do disco (`file://`) com o Chromium do Playwright — não precisa de servidor rodando.

## Duas versões, um só código-fonte a partir de agora

- **`app/bancada-3d.html`** é a versão completa — tudo que está documentado em `docs/bancada-3d-app.md` funciona nela. Usa um banco de dados que hoje só existe dentro do Claude (Firestore-like da própria plataforma), então rodando localmente/fora do Claude ela perde a persistência de dados.
- **`app/biri-prints-3d-standalone.html`** usa Firebase de verdade (grátis) + tela de login, pensada pra hospedar no GitHub Pages e usar no dia a dia fora do Claude — mas está atrasada em relação à principal (falta WhatsApp, Clientes, Vendedores/Pedidos, validação de telefone/e-mail). Ver `docs/STANDALONE-SETUP.md`.

Com o repositório agora no GitHub e acessível via Claude Code (aba "Code" do Claude Desktop, com acesso direto aos arquivos e terminal local), o caminho natural é ir trazendo a `standalone` pro nível da principal, até ela virar a única versão de verdade.

## Contexto

Este projeto nasceu e evoluiu inteiramente em conversas com o Claude (Chat/Cowork) — `docs/bancada-3d-app.md` é o registro de cada pedido, decisão de design e bug corrigido ao longo do caminho. A partir daqui, a evolução do código passa a acontecer com o Claude Code, com acesso direto a este repositório.
