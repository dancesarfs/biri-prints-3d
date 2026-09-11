# Biri Prints 3D

Sistema de precificação e gestão pra uma operação de impressão 3D (catálogo de peças, orçamentos, pedidos, clientes, vendedores) — construído aos poucos em conversas com o Claude, pra substituir uma planilha de Excel.

## Estrutura do repositório

```
app/
  bancada-3d.html                  → LEGADO — não recebe mais funcionalidades novas, só registro histórico (era Artifact do Claude)
  biri-prints-3d-standalone.html   → versão OFICIAL, usada no dia a dia (Firebase + login), roda fora do Claude
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

## `biri-prints-3d-standalone.html` é a única versão oficial a partir de agora

Desde 2026-09-11, a `standalone` alcançou paridade funcional completa com a antiga versão principal (confirmado função por função e pela suíte de testes):

- **`app/biri-prints-3d-standalone.html`** é a versão **oficial**, usada no dia a dia — usa Firebase de verdade (grátis) + tela de login, hospedada no GitHub Pages. Ver `docs/STANDALONE-SETUP.md`. **Toda evolução do sistema a partir de agora acontece nela.**
- **`app/bancada-3d.html`** é **legado** — a versão que era hospedada como Artifact do Claude, usando um banco de dados que só existe dentro da plataforma (por isso rodando fora do Claude ela nunca teve persistência de dados de verdade). Não recebe mais funcionalidades novas; existe só como registro histórico de como o sistema evoluiu, documentado em `docs/bancada-3d-app.md`.

## Contexto

Este projeto nasceu e evoluiu inteiramente em conversas com o Claude (Chat/Cowork) — `docs/bancada-3d-app.md` é o registro de cada pedido, decisão de design e bug corrigido ao longo do caminho. A partir daqui, a evolução do código passa a acontecer com o Claude Code, com acesso direto a este repositório.
