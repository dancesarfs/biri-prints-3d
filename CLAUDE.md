# Biri Prints 3D — contexto para o Claude Code

Este projeto foi construído inteiramente em conversas com o Claude (Chat/Cowork), sem repositório git até agora. Antes de fazer qualquer alteração, leia:

- `docs/bancada-3d-app.md` — histórico completo de decisões de produto, funcionalidades e o porquê de cada uma (é o documento mais importante deste repositório).
- `docs/diagnostico-precificacao.md` — como o modelo de custo/preço foi validado.
- `docs/STANDALONE-SETUP.md` — como publicar a versão standalone.
- `README.md` — visão geral da estrutura de pastas.

## `app/biri-prints-3d-standalone.html` é a única versão oficial

Desde 2026-09-11, quando a standalone alcançou paridade funcional completa com a principal (confirmado função por função e pela suíte de testes — ver `docs/bancada-3d-app.md`):

- **`app/biri-prints-3d-standalone.html`** é a versão oficial, usada no dia a dia (Firebase + login de verdade). **Toda evolução a partir de agora — funcionalidade nova ou correção de bug — acontece só nela.**
- **`app/bancada-3d.html`** (a versão hospedada como Artifact do Claude) é **legado**: não recebe mais funcionalidades novas, existe só como registro histórico de como o sistema evoluiu até a standalone alcançar paridade. **Não editar**, a menos que explicitamente pedido.

## Testes

Suíte Playwright em `tests/`, sem framework de teste (cada arquivo é um script que roda sozinho e usa `process.exitCode = 1` pra sinalizar falha). Rode com `npm test` (ou `node tests/run-all.js`) depois de `npm install` e `npx playwright install chromium`. **Sempre rode a suíte completa antes de considerar uma mudança pronta** — o histórico em `docs/bancada-3d-app.md` mostra várias regressões sutis (HTML mal-fechado, navegação quebrada) que só a suíte pegou.

## Estilo de trabalho que o usuário espera

A leitura de `docs/bancada-3d-app.md` deixa isso claro pelo padrão repetido: antes de decisões de design com mais de uma opção razoável, é comum apresentar o levantamento e perguntar ao usuário em vez de decidir sozinho — e depois de implementar, validar visualmente antes de dar como concluído.
