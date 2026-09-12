## Biri Prints 3D — sistema de precificação (substitui a planilha)

Data: 2026-09-10 (atualizado — "Produto" deixou de ser aba/submenu e virou um modal "Adicionar Produto" dentro de Catálogo; cor de destaque do app trocada de verde pra azul em tudo (inclusive o botão do WhatsApp); paleta do menu lateral ajustada pra usar as mesmas cores do resto do app, não mais a paleta escura da imagem de referência)
Link (versão dentro do Claude): https://claude.ai/code/artifact/3b9bcd52-97be-4530-934f-01b13d9c0116

App web (funciona no celular e no computador, sem instalar nada) que substitui a planilha Excel. Nome da loja/negócio do usuário: **Biri Prints 3D** — aparece no título da página, no cabeçalho do app e no texto gerado para compartilhar o catálogo no WhatsApp.

**Existem agora duas versões independentes do mesmo sistema** (não sincronizam dados entre si — ver seção "Versão standalone" no fim deste doc):
1. A versão hospedada como Artifact do Claude (link acima), com banco de dados próprio da Claude. Arquivo: `app/bancada-3d.html`.
2. Uma versão standalone (`app/biri-prints-3d-standalone.html`), pra rodar fora do Claude (GitHub Pages ou local), usando Firebase como banco de dados e com tela de login. Configuração em `docs/STANDALONE-SETUP.md`.

### Funcionalidades
Navegação: menu lateral em lista, recolhível no computador e em gaveta no celular (ver seção "Reorganização dos menus" mais abaixo), na mesma paleta de cores do resto do app. Itens de topo: Catálogo, Orçamentos, Pedidos, **Admin** (grupo com submenus) e Clientes.
- **Catálogo**: lista as peças salvas com preço recalculado automaticamente (mostra material e impressora usados). Botões: Editar / **Duplicar** / + Orçamento / Excluir. Botão **"Adicionar Produto"** (abre um modal pra calcular e salvar uma peça nova — ver seção "Produto virou um modal dentro de Catálogo") e botão **"Compartilhar lista"** no topo (ver seção "Compartilhar catálogo pro WhatsApp").
  - **Duplicar**: abre o mesmo formulário de edição pré-preenchido com todos os dados da peça (nome vem com sufixo "(cópia)"), permite revisar/alterar qualquer campo, e ao salvar cria uma peça NOVA no catálogo — a original não é alterada. Botão diz "Salvar como nova peça" para deixar isso claro.
- **Orçamentos**: monta orçamentos com vários itens (do catálogo, com preço ajustado incluso, ou avulsos), calcula o total, marca como rascunho/enviado, botão **"Enviar por WhatsApp"** (mensagem pronta, direto pro contato do cliente — ver seção própria abaixo) e botão "Copiar resumo". Detecta e aplica automaticamente descontos de kit (ver seção abaixo). Tem botões "+ Kit <nome do grupo>" para adicionar todos os produtos de um grupo de uma vez, com checkbox por item para simular incluir/excluir sem perder a lista (ver seção "Adicionar kit completo"). Cada item vindo do catálogo pode ter sua impressora trocada só para aquele orçamento (ver seção "Múltiplas impressoras"). Um orçamento aprovado pelo cliente pode ser **convertido em pedido** — a partir daí ele fica travado nessa aba (só leitura, com link pro número do pedido) e a gestão da venda continua na aba Pedidos (ver seções próprias abaixo). Filtros por status/cliente/vendedor no topo.
- **Pedidos**: aba própria (separada de Orçamentos) só com o que já virou venda efetivada — sub-status de produção/entrega, pagamento, vendedor responsável pela venda, com os mesmos filtros por status/cliente/vendedor (ver seção "Separação das abas Orçamentos e Pedidos").
- **Admin** (antes chamada "Ajustes", agora um grupo com 6 submenus, cada um com seu próprio formulário — ver seção "Reorganização dos menus"): Parâmetros de custo, Impressoras, Materiais, Grupos de kit, Promoções sazonais e Vendedores. ("Produto" chegou a morar aqui por uma versão, mas saiu de Admin — ver "Produto virou um modal dentro de Catálogo".)
- **Clientes**: cadastro próprio de clientes (nome completo, WhatsApp, e-mail, aceite de novidades por e-mail/WhatsApp), com busca por nome. Integrado à tela de Orçamentos — dá pra buscar um cliente já cadastrado ou cadastrar um novo ali mesmo (ver seção própria abaixo).

**Nota sobre nomes antigos usados no resto deste documento**: várias seções abaixo foram escritas antes das reorganizações de menu e ainda dizem "Calcular" ou "Produto" (hoje o modal "Adicionar Produto", aberto a partir de Catálogo — ver "Produto virou um modal dentro de Catálogo") e "Ajustes" (hoje "Admin", com cada seção virando um submenu próprio) — mantidos como estão por fidelidade histórica a cada pedido do usuário, mas o mapeamento é sempre: Calcular/Produto = modal "Adicionar Produto" em Catálogo, Ajustes = Admin.

### Ajuste manual de preço ("fator de mercado")
Caixa "Definir um preço manual (ajuste de mercado)", desmarcada por padrão, disponível na tela Calcular e no modal Editar/Duplicar peça. Só quando marcada o campo de preço final é usado; do contrário o preço é sempre o calculado pela fórmula. O ajuste persiste como diferença (R$) somada por cima do cálculo, então continua valendo mesmo se os parâmetros gerais mudarem depois.

### Campos obrigatórios e validação inline
Pedido do usuário depois de testar o cadastro de impressora: os formulários não deixavam claro quais campos eram obrigatórios, e tentar salvar sem preenchê-los não dava nenhum aviso visual — só um toast genérico que passava batido.

**Levantamento feito antes de implementar**: além da falta de marcação visual, alguns campos tinham uma lacuna mais séria — preço/kg do material e preço de compra/potência/vida útil da impressora caíam silenciosamente em R$0/0kW/0h se deixados em branco, o que zera o custo de energia e desgaste de qualquer peça que use aquele material/impressora sem nenhum aviso. Validei esse achado com o usuário antes de mexer no código; ele escolheu (todas as opções recomendadas):
1. Marcar os campos obrigatórios com um **asterisco vermelho** ao lado do label, usando a cor `--danger` que o app já tinha na paleta (mesma usada no botão de confirmar exclusão) — sem precisar inventar estilo novo.
2. Tornar **obrigatórios de fato** (bloqueando salvar) os campos que antes zeravam silenciosamente: gramatura da peça, preço/kg do material, e preço de compra/potência/vida útil da impressora — mesmo padrão que "nome" já tinha.
3. **Não** construir uma tabela de presets de impressora por modelo — mantém o fluxo manual (usuário chama o Claude quando cadastra um modelo novo).

Depois, o usuário notou que faltava mais um: **tempo de máquina** (horas + minutos) também podia ficar zerado silenciosamente — e sem tempo de impressão não tem como a peça sair da impressora. Faz o mesmo sentido dos outros campos de custo, então passou a ser obrigatório também, com a mesma marcação visual.

**Implementação**: ao tentar salvar qualquer formulário com um campo obrigatório vazio/inválido, o campo específico ganha borda vermelha e uma mensagem curta de erro logo abaixo, a tela rola/foca automaticamente até o primeiro campo com problema, e o toast continua aparecendo como reforço. O erro de um campo some assim que ele é preenchido, sem precisar tentar salvar de novo. Aplicado de forma consistente em todos os formulários do app: peça (Calculadora e editor — nome, material, impressora, gramatura, tempo de máquina), material (nome, preço/kg), impressora (nome, preço, potência, vida útil), grupo de kit (nome, mínimo de 2 produtos selecionados), promoção (nome, grupo, datas de início/fim) e item avulso do orçamento (nome, preço). O campo de tempo de máquina (horas + minutos) é tratado como um par: a mensagem de erro aparece uma vez, mas cada um dos dois campos só limpa seu próprio destaque quando é preenchido — editar um não limpa o outro automaticamente.

### Máscara e validação de telefone e e-mail
Pedido do usuário: "Coloca validação nos campos de e-mail e telefone. Coloque máscara automática no telefone. Aplique a todos os campos de telefone e e-mail em todos os formulários" — reforçando o mesmo cuidado já dado à validação de campos obrigatórios (seção acima), agora estendido ao **formato** do que é digitado nesses dois tipos de campo, não só à obrigatoriedade.

**Onde existem campos de telefone/e-mail** — os únicos 3 formulários do app com esses campos, todos cobertos: cadastro de **Cliente** (WhatsApp + e-mail), cadastro de **Vendedor** (telefone + e-mail) e o formulário de "novo cliente" dentro do Orçamento (WhatsApp + e-mail, mesmo formulário usado quando se cadastra um cliente ali mesmo sem sair da tela de orçamento).

**Máscara automática de telefone** (`mascararTelefone`): formata progressivamente enquanto o usuário digita, no padrão brasileiro já usado no restante do app (mesma convenção de `normalizarTelefoneWhatsApp` — o campo guarda o número local, sem o DDI 55, que só entra na hora de montar o link do WhatsApp):
- 10 dígitos (telefone fixo): `(11) 3333-4444`.
- 11 dígitos (celular, com o 9º dígito): `(11) 99123-4567`.
- A máscara aceita colar um número já formatado ou só os dígitos corridos — ela sempre limpa tudo que não é dígito antes de reformatar. Também é aplicada a valores já salvos ao reabrir um cadastro pra editar, então um telefone salvo antes dessa funcionalidade existir aparece mascarado normalmente assim que o formulário abre (não precisa digitar de novo pra "ganhar" a máscara).
- Não é readonly, e o campo continua opcional em todos os 3 formulários (deixar em branco não bloqueia salvar) — a mascara só entra em ação quando existe algo digitado.

**Validação de formato** (`telefoneValido` / `emailValido`), aplicada no momento de salvar, reaproveitando o mesmo mecanismo visual dos campos obrigatórios (borda vermelha + mensagem de erro logo abaixo, some ao corrigir):
- **Telefone**: só é considerado válido com exatamente 10 ou 11 dígitos (contando o DDD) — a mesma contagem que `normalizarTelefoneWhatsApp` já usa pra decidir se um número "parece brasileiro sem DDI". Um telefone incompleto (ex.: só o DDD e metade do número) bloqueia salvar com a mensagem "Telefone inválido — confira o DDD e o número".
- **E-mail**: validação de formato básica (precisa ter algo, `@`, mais algo, um `.`, e mais algo depois — sem espaços) — suficiente pra pegar erros de digitação comuns (esquecer o `@`, esquecer o domínio) sem ser rígido demais sobre formatos de e-mail incomuns porém válidos. Mensagem: "E-mail inválido".
- Como esses campos são opcionais, a validação de formato só entra em ação quando o campo **não está vazio** — continua sendo possível salvar um cadastro sem telefone/e-mail nenhum, exatamente como antes. A validação de formato é independente da validação de "campo obrigatório porque marcou o aceite de novidades" (que já existia em Cliente e no orçamento) — as duas convivem: por exemplo, marcar "aceita WhatsApp" sem preencher telefone continua bloqueando por um motivo, e preencher um telefone incompleto bloqueia por outro.

### Múltiplas impressoras
Pedido do usuário: hoje ele tem uma Bambu Lab A1, mas pode trocar de marca/modelo no futuro, ou comprar uma segunda impressora para usar em paralelo — e algumas peças podem ser impressas em mais de um modelo, com tempo/gramatura diferentes influenciando o preço.

**Desenho da solução** (discutido e validado com o usuário antes de implementar, com um ponto em aberto resolvido por pergunta direta):
- **Impressora vira uma entidade cadastrável** (Ajustes → "Impressoras cadastradas"), do mesmo jeito que material: nome/apelido, marca, modelo, preço de compra, potência (kW) e vida útil (horas). Os campos de potência/preço/vida útil que antes ficavam fixos nos "Parâmetros de custo" gerais saíram de lá — cada impressora tem os seus.
- **Sem lista de "impressoras compatíveis" pré-declarada na peça.** Em vez disso, cada peça tem uma impressora **padrão** (selecionada na Calculadora/editor, igual ao material) e a escolha de qual impressora usar de fato fica livre por orçamento — o usuário decide na hora de orçar, sem precisar manter uma lista de compatibilidade sempre atualizada no cadastro.
- **Ponto em aberto resolvido com o usuário**: perguntei se gramatura/tempo deveriam ficar fixos entre impressoras (mais simples) ou variar por impressora (mais preciso, mais dado pra digitar). O usuário escolheu explicitamente a opção mais precisa — **permitir tempo e gramatura específicos por impressora**.
- **"Perfis por impressora"**: cada peça pode ter, opcionalmente, um ou mais perfis (`perfis_impressora`) guardando gramatura/tempo alternativos para impressoras diferentes da padrão. São lançados principalmente dentro do fluxo de orçamento — ao trocar a impressora de um item, o usuário pode digitar os valores certos pra aquela impressora e marcar "Salvar como padrão dessa peça nessa impressora" (checkbox opt-in, nunca salva sozinho) pra não precisar redigitar da próxima vez. Também dá pra cadastrar/editar perfis diretamente no editor da peça ("Perfis por impressora (opcional)"). Peça sem perfil cadastrado pra uma impressora simplesmente usa os valores padrão da peça nela.
- **No orçamento**: cada item vindo do catálogo mostra um toggle "🖨️ <impressora> ▼" — ao expandir, aparece um mini-formulário pra trocar a impressora só daquele item/orçamento (com gramatura/tempo pré-preenchidos pelo perfil salvo, se existir, ou pelos valores padrão da peça, senão). Clicar em "Aplicar" recalcula o preço do item na hora. Essa troca vale só pro orçamento em questão — o cadastro da peça só muda se o "Salvar como padrão" for marcado.
- **Migração automática e transparente**: como o app já estava em uso com os campos antigos de potência/preço/vida útil dentro da configuração geral, o código detecta esse formato antigo no primeiro carregamento após a atualização e cria automaticamente uma impressora "Bambu Lab A1" com esses valores, associando-a como padrão em todas as peças que ainda não tinham impressora definida — sem precisar o usuário fazer nada manualmente. Essa migração também foi aplicada diretamente no banco de dados real de produção (mesmo padrão de correção transparente já usado antes nesse projeto), então o usuário já vai encontrar tudo migrado na próxima vez que abrir o app.

### Kits e promoções sazonais
Modelo pedido: montar "kits" combinando produtos do catálogo com desconto automático no orçamento, aplicado apenas em janelas de tempo específicas (ex.: Dia dos Professores), com controle sobre quais produtos convivem, quais promoções valem para quais kits, e o período de vigência.

**Desenho da solução** (validado com o usuário antes de implementar, comparando com padrões de CPQ de mercado como Salesforce CPQ "Discount Schedules"):
- **Grupos de kit** (Ajustes): definem quais produtos do catálogo "convivem" entre si — só uma lista de nome + produtos selecionados. Um produto pode pertencer a mais de um grupo. Esses mesmos grupos são o que vira o botão "+ Kit" no orçamento (não existe uma entidade "Kit" separada — o grupo já cumpre esse papel).
- **Promoções** (Ajustes): cada promoção liga um grupo a um período (data início/fim) e a uma lista de **faixas de desconto** por número de produtos DISTINTOS do grupo presentes no orçamento (ex.: 2+ produtos → 5%, 4+ produtos → 10% — mesmo padrão de "Discount Schedule" por volume do Salesforce CPQ). As faixas são editáveis por promoção, não fixas no código.
- **Detecção automática no orçamento**: ao montar um orçamento, o sistema identifica quais itens vieram de produtos do catálogo (por `produto_id`), verifica quais grupos têm produtos suficientes presentes E uma promoção ativa hoje, escolhe a faixa de desconto aplicável pela contagem de produtos distintos, e aplica o desconto automaticamente.
- **Regras de negócio confirmadas com o usuário** (todas as opções recomendadas foram escolhidas):
  1. A contagem do kit é por **produtos distintos**, não por quantidade total de itens.
  2. Se um produto participa de 2+ grupos com promoções ativas simultâneas, aplica-se **só o melhor desconto** entre eles — nunca soma/empilha.
  3. A elegibilidade da promoção é avaliada pela **data de hoje** (sem simulação de datas futuras/passadas no orçamento).
  4. Não existe um "Kit" reutilizável cadastrado como entidade própria além do grupo — a detecção é automática dentro do orçamento.
- **Onde aparece**: o modal de orçamento mostra uma caixa "Desconto de kit detectado" com o nome da promoção, quantos produtos entraram, o percentual e o valor do desconto, além de separar Subtotal e Total. O orçamento salvo guarda o snapshot (`subtotal`, `desconto_kit_total`, `desconto_kit_linhas`, `total`) e mostra as linhas de desconto tanto no resumo expandido quanto no texto copiado para WhatsApp.
- **Subtotal também no card expandido, salvo (Orçamentos e Pedidos)**: pedido do usuário — "o orçamento e o pedido precisam mostrar o valor total sem desconto, antes da linha que mostra o valor e percentual de desconto". Ao expandir um orçamento ou pedido salvo que tem desconto de kit, aparece uma linha **"Subtotal (sem desconto)"** logo depois dos itens e **antes** da(s) linha(s) de desconto — mesma ordem já usada no resumo/WhatsApp (Subtotal → Desconto → Total, com o Total continuando visível no topo do card, como sempre). Um orçamento/pedido sem desconto de kit não mostra essa linha (seria redundante com o total já exibido).

### Adicionar kit completo no orçamento
Pedido do usuário: em vez de adicionar produto por produto na tela de orçamento, ter um botão que já carrega todos os itens de um kit de uma vez, podendo depois simular tirando/incluindo itens sem perder a lista.

Solução implementada: cada grupo de kit cadastrado em Ajustes vira um botão "+ Kit <nome do grupo>" na tela de montar orçamento. Ao clicar, todos os produtos daquele grupo são adicionados à lista de itens de uma vez (sem duplicar quem já estava lá). Cada item da lista tem uma checkbox própria, marcada por padrão — desmarcar um item não o remove da lista, só o exclui do cálculo do subtotal, do total e da detecção de desconto de kit (o desconto recalcula na hora); marcar de novo o inclui de volta. Isso permite ir testando combinações em tela antes de decidir o orçamento final. Ao salvar, só os itens que ficaram marcados entram de fato no orçamento salvo — os desmarcados são descartados nesse momento (não ficam "fantasmas" gravados no banco).

### Compartilhar catálogo pro WhatsApp
Pedido do usuário: extrair o catálogo (nome + preço) formatado pronto pra mandar no WhatsApp, pra responder rápido quando alguém pergunta "quanto custam suas peças" — diferente do "Copiar resumo" de um orçamento, que é pra um cliente e itens específicos com total.

Antes de implementar, validei o desenho com o usuário (ele escolheu as duas opções recomendadas):
- **Seleção de peças**: o botão "Compartilhar lista" (no topo da aba Catálogo) abre um modal com checkbox por peça, todas marcadas por padrão. Dá pra desmarcar o que não quer incluir naquele envio específico (ex.: peça de teste), sem precisar de um campo extra "visível/oculto" no cadastro da peça.
- **Prévia ao vivo**: o modal mostra o texto final num campo de texto (read-only), atualizado a cada checkbox marcada/desmarcada, pra conferir antes de enviar.
- **Formato**: usa a formatação que o WhatsApp já entende (negrito com asterisco), por exemplo:
  ```
  ● *Catálogo Biri Prints 3D*

  ◆ *Chaveiro gatinho* — R$ 12,00
  ◆ *Porta-copos* — R$ 18,50

  _Valores sujeitos a alteração._
  ```
- **Aviso de promoção ativa**: quando existe uma promoção de kit vigente no dia (mesmo sistema de Promoções sazonais), o texto ganha automaticamente uma linha extra no final ("▲ Kits com desconto disponíveis nesse período — me chama!"). Em dias sem promoção ativa, essa linha não aparece.
- **Copiar/Compartilhar**: o botão tenta usar o menu de compartilhamento nativo do celular (Web Share API — abre direto pro WhatsApp e outros apps) quando disponível; se não for suportado ou o navegador não tiver a API, cai para copiar o texto pra área de transferência (mesmo padrão já usado no "Copiar resumo" do orçamento).

### Enviar orçamento direto por WhatsApp
Pedido do usuário: no orçamento, poder enviar pro cliente direto por WhatsApp, sem passar por copiar/colar manual.

Diferente do "Compartilhar catálogo" (que usa a Web Share API, deixando o usuário escolher o app na hora), aqui o pedido era mais específico: abrir o WhatsApp já na conversa certa. Implementado com os links de "click-to-chat" oficiais do WhatsApp, sem precisar de nenhuma API paga nem integração externa:
- **Campo novo no orçamento**: "WhatsApp do cliente (opcional)", ao lado do campo "Cliente" já existente no formulário de orçamento. Aceita número com ou sem formatação/DDI — a normalização (`normalizarTelefoneWhatsApp`) limpa tudo que não é dígito e assume Brasil (DDI 55) quando o número não vem com DDI.
- **Botão "Enviar por WhatsApp"** no card do orçamento (ao lado de "Copiar resumo"), com a mesma cor de destaque (azul) do resto do app. Reaproveita o mesmo texto do resumo (`gerarTextoOrcamento`, extraído do que já existia em "Copiar resumo" pra não duplicar lógica).
  - **Com telefone salvo**: abre `https://wa.me/<numero>?text=<mensagem>` — vai direto pra conversa com aquele contato, mensagem já pronta.
  - **Sem telefone salvo**: abre `https://api.whatsapp.com/send?text=<mensagem>` (link genérico oficial do WhatsApp — confirmei que é esse o formato certo pra esse caso, diferente do `wa.me` sem número, que não tem esse comportamento) — deixa a pessoa escolher o contato na hora, direto no WhatsApp.
- **Importante**: essa funcionalidade foi implementada só na versão hospedada no Claude (`app/bancada-3d.html`) até agora — o arquivo standalone (`app/biri-prints-3d-standalone.html`) ainda não tem esse botão. Se o usuário for usar a versão standalone no dia a dia, precisa ser replicado lá também.

**Padronização do texto com o catálogo** (pedido logo em seguida pelo usuário): o texto gerado por `gerarTextoOrcamento` — usado tanto pelo "Copiar resumo" quanto pelo "Enviar por WhatsApp", já que os dois reaproveitam a mesma função — passou a seguir exatamente o mesmo "visual" do texto de "Compartilhar catálogo" (negrito/itálico no padrão que o WhatsApp entende), pra toda mensagem que sai do app ficar com a cara igual:
```
■ *Orçamento — Escola Municipal*
_09/09/2026_

◆ *Porta canetas* × 2 — R$ 30,00

Subtotal: R$ 30,00
_Desconto de kit — Dia dos professores (5%): − R$ 2,25_

*Total: R$ 27,75*
```
Cabeçalho com ícone + negrito (■, mesmo espírito do ● do catálogo), item com ◆ + nome em negrito, linha de desconto de kit em itálico (equivalente ao rodapé em itálico do catálogo) e total em negrito no final. Como as duas funcionalidades (copiar e WhatsApp) compartilham essa mesma função de geração de texto, a padronização vale pras duas de uma vez. (Os ícones começaram como emoji de verdade — ver os dois bugs de corrupção abaixo, que é por isso que hoje são só símbolos geométricos simples.)

**Ajuste pedido pelo usuário — mostrar o subtotal antes do desconto**: antes, quando havia desconto de kit, o texto ia direto de "itens" pra "linha de desconto" pra "Total" — sem mostrar o valor original (sem desconto), só o valor final. O usuário notou que fazia mais sentido mostrar o cálculo completo: Subtotal (soma dos itens, sem desconto) → linha(s) de desconto → Total (já com desconto aplicado) — o mesmo raciocínio que a tela de orçamento já mostra visualmente. Implementado: a linha "Subtotal: R$ X" (usando o campo `subtotal` que o orçamento já guarda salvo) só aparece quando existe desconto de kit — sem desconto, o texto continua direto ao Total, sem repetir o mesmo valor duas vezes à toa.

**Bug reportado pelo usuário e corrigido — botão não abria o WhatsApp**: o usuário testou e o clique não abria nada. Causa: a implementação original usava `window.open(url, '_blank')` — alguns navegadores/webviews (inclusive o navegador embutido de apps de chat, como o do próprio Claude no celular) bloqueiam popups abertos via script mesmo quando disparados direto por um clique, mas continuam respeitando o clique num link `<a>` real. Corrigido trocando `window.open` por uma função `abrirLinkExterno(url)` que cria um elemento `<a target="_blank" rel="noopener noreferrer">` de verdade, clica nele e remove em seguida — funciona em mais contextos porque é uma navegação de link genuína, não um popup criado por script.

**Bug reportado pelo usuário e corrigido (em duas rodadas) — emoji chegava corrompido só pelo botão do WhatsApp**: depois do botão passar a funcionar, o usuário notou (com print comparando as duas mensagens na mesma conversa) que os emoji 🧾 e 🔸 chegavam como um caractere de erro (losango com interrogação) na mensagem enviada pelo botão "Enviar por WhatsApp", enquanto a mesma mensagem copiada manualmente ("Copiar resumo" → colar) chegava certinha.
- **1ª tentativa (insuficiente)**: trocar só os emoji "modernos" de 4 bytes por emoji "clássicos" de 1 posição não resolveu — o usuário testou de novo no celular e o cabeçalho ainda chegava corrompido.
- **Causa real (confirmada com o teste no celular)**: qualquer caractere que o WhatsApp reconhece como emoji de verdade, quando o texto chega dentro de uma URL (`wa.me`/`api.whatsapp.com?text=...`) em vez de colado direto, é corrompido na decodificação do próprio WhatsApp/celular ao abrir o link.
- **Correção definitiva**: troquei TODOS os ícones (cabeçalho e item, catálogo e orçamento) por símbolos geométricos simples que nunca são tratados como emoji (bloco Unicode "Geometric Shapes"): 📋/🧾/✅→■●, 🔸→◆ (mantido, já funcionava), 🎁/✨→▲. Nenhum desses símbolos aparece na lista oficial de emoji do Unicode, então não passam pelo caminho que corrompe no WhatsApp.
- **Confirmado com o usuário**: depois da correção definitiva, o usuário testou de novo e confirmou que os símbolos ■◆▲ (sem cor) não corrompem mais, e escolheu explicitamente mantê-los assim (em vez de trocar o botão pra usar o menu de compartilhar nativo, que manteria emoji coloridos mas perderia o "abrir direto na conversa do cliente").

**Bug reportado pelo usuário e corrigido — card de orçamento expandido "engolia" o próximo da lista**: causa raiz: o trecho de código que monta o conteúdo do card expandido abria uma `<div class="stack">` sem fechar — o navegador aninhava o card seguinte inteiro dentro do card mal-fechado. Corrigido adicionando a tag de fechamento que faltava, mais reforço visual (mais espaço entre cards, borda de destaque no card expandido). Teste `test_orc_list_separacao.js` protege contra regressão.

### Cadastro de clientes
Pedido do usuário (como vendedor): poder cadastrar clientes com nome completo, telefone, e-mail e opção de aceitar novidades por e-mail/WhatsApp, numa seção própria — e também poder salvar um cliente direto na tela de orçamento, com opção de buscar um cliente já cadastrado ou cadastrar um novo ali mesmo.

- **Aba "Clientes"** (última da barra de navegação). Lista os clientes cadastrados com busca por nome e um selo mostrando quem aceitou novidades por e-mail e/ou WhatsApp. Botão "+" (flutuante) abre o cadastro; cada cliente tem Editar/Excluir.
- **Campos do cliente**: nome completo (obrigatório), WhatsApp, e-mail, e dois checkboxes — "Aceita receber novidades por e-mail" e "...por WhatsApp". Validação: marcar o aceite de um canal sem preencher o contato correspondente bloqueia salvar.
- **Na tela de orçamento**, o campo "Cliente" virou duas abas: "Cliente existente" (busca por nome) e "Novo cliente" (cadastrado ali mesmo, e salvo de verdade no cadastro de clientes, não só como texto solto).
- **Importante**: essa funcionalidade foi implementada só na versão hospedada no Claude (`app/bancada-3d.html`) até agora — a standalone ainda não tem cadastro de clientes.

### Converter orçamento em pedido (venda efetivada)
Pedido do usuário (como vendedor): "poder converter um orçamento em pedido após a aprovação do cliente para que eu possa efetivar minha venda".

"Pedido" não é uma tabela/coleção nova, é um terceiro valor possível no mesmo campo `status` que o orçamento já tinha (`rascunho` → `enviado` → `pedido`), guardado no mesmo registro (mesma filosofia de "entidade mínima" usada em outras partes do app, ex. kit reaproveita grupo).
- **Botão "Converter em pedido"**, confirmação de 2 cliques. Ao confirmar, grava `convertido_em`.
- **Selo "Pedido"** com destaque sólido.
- **Reverter para orçamento**: volta o status pra `enviado` (nunca `rascunho`).
- **Filtro por status** na tela de Orçamentos: chips Todos/Rascunhos/Enviados/Pedidos com contagem.

### Acompanhamento do pedido: sub-status de produção/entrega e pagamento
Desenho acertado com o usuário passo a passo (pagamento é campo independente do estágio; sequência final de `status_pedido`: **Aberto → Em produção → Pronto → Entregue**, com **Cancelado** a partir de qualquer um desses).

- Seletor troca livremente entre os 4 estágios, sem confirmação.
- **Cancelar** exige confirmação de 2 cliques; reabrir volta pra "Aberto" sem confirmação.
- **Pagamento** é um toggle independente do sub-status ("Marcar como pago"/"Desmarcar pagamento").
- Selos por fase: Aberto (`.badge-muted`), Em produção (`.badge-warn`), Pronto (`.badge-accent`), Entregue (`.badge-pedido`), Cancelado (`.badge-danger`).
- Reverter um pedido pra orçamento limpa `status_pedido` mas mantém `pago`.

### Cadastro de vendedores e "vendedor atual"
Pedido do usuário: filtro por vendedor exigia primeiro existir o conceito de "vendedor atual" — o app nunca teve login/autenticação.

- **Vendedor é uma entidade cadastrável** (Ajustes → "Vendedores"): nome (obrigatório) + contato (opcional) + "Ativo" (checkbox).
- **"Ativo/Inativo"**: sai dos seletores de escolha mas continua aparecendo em filtros/histórico.
- **Tela de bloqueio ("gate")**: ao abrir o app sem vendedor atual válido no dispositivo, cobre tudo até escolher/cadastrar um.
- **Identidade por dispositivo** (localStorage, sem senha/servidor) — não é autenticação real, é conveniência pra "de quem é esse aparelho".
- **Trocar de vendedor atual**: badge no cabeçalho abre modal pra trocar, sem travar nada.

### Vendedor no orçamento e no pedido (podem ser pessoas diferentes)
- **`vendedor_id`/`vendedor_nome`** — quem criou o orçamento (preenchido automático, editável antes de salvar, imutável depois).
- **`vendedor_pedido_id`/`vendedor_pedido_nome`** — quem converteu/toca a venda (preenchido no momento da conversão, editável depois via seletor "Vendedor do pedido").
- Reverter limpa `vendedor_pedido_*`; `vendedor_id` nunca é apagado.

### Separação das abas Orçamentos e Pedidos
Continua sendo o mesmo registro por trás (`state.orcamentos`) — Orçamentos e Pedidos são duas visões filtradas.
- **Orçamentos**: rascunhos, enviados, e "Encerrados" (só leitura, com referência ao número do pedido + botão "Copiar orçamento").
- **Pedidos**: só `status:'pedido'`, com referência ao orçamento de origem, gestão de sub-status/pagamento/vendedor do pedido.
- **Numeração sequencial independente**: `orcamento_numero` (na criação) e `pedido_numero` (na conversão), cada um "maior número usado + 1".
- **"Copiar orçamento"**: sempre cria registro novo, recalculando preços dos itens de catálogo pelas condições atuais; vendedor da cópia é sempre o vendedor atual.

### Filtros por status, cliente e vendedor (Orçamentos e Pedidos)
- **Cliente**: filtro de texto por trecho do nome.
- **Vendedor**: Orçamentos filtra por `vendedor_id` (quem criou); Pedidos filtra por `vendedor_pedido_id` (quem converteu).
- **Status**: chips específicos de cada aba. Os três filtros se combinam (E lógico); nenhum é persistido.

### Reorganização dos menus: barra lateral recolhível/gaveta, "Ajustes"→"Admin" com submenus
Pedido do usuário, com referência visual de um menu lateral escuro em lista. Uma única árvore de navegação (`NAV_TREE`) substituiu a lista plana de abas antiga.

**Estrutura atual do menu**: Catálogo · Orçamentos · Pedidos · **Admin** (grupo expansível, 6 subitens: Parâmetros de custo, Impressoras, Materiais, Grupos de kit, Promoções sazonais, Vendedores) · Clientes.

**Computador**: barra lateral fixa (240px), botão "Recolher menu" encolhe pra trilha de ícones (64px); estado lembrado via `localStorage`. Clicar em Admin recolhido reabre a barra inteira.

**Celular**: barra escondida por padrão, gaveta em tela cheia via hambúrguer, fecha ao navegar ou tocar no fundo; nunca lembra estado entre sessões; grupo Admin abre sozinho se a aba atual está dentro dele.

**Removido**: as barras de abas horizontais (topo do computador e fixa embaixo do celular) saíram por completo.

**Atualização — "Produto" saiu de Admin**: ver seção seguinte.

### Ajustes visuais e "Produto virou um modal dentro de Catálogo"
Pedido do usuário, três itens numa mesma mensagem: usar a paleta normal do app no menu lateral (não a paleta escura da imagem de referência que só indicava a estrutura desejada); unir "Produto" e "Catálogo" (Produto virou modal "Adicionar Produto" dentro de Catálogo, com o mesmo padrão de navegação dos demais cadastros); trocar toda cor verde do sistema por azul.

1. **Paleta do menu lateral**: corrigida pra usar as mesmas variáveis de cor do resto do app (`--surface`, `--border`, `--text`, `--text-muted`, `--accent`, `--accent-soft`) — se adapta ao tema claro/escuro normalmente.
2. **"Produto" virou modal em Catálogo**: removido do `NAV_TREE` (Admin voltou a 6 subitens). Botão **"Adicionar Produto"** na aba Catálogo (ao lado de "Compartilhar lista", e sozinho no estado vazio) abre um **modal** (`abrirNovoProduto`) com os mesmos campos/comportamento de antes. Salvar fecha o modal e atualiza a lista na hora. Aba inicial do app: **Catálogo**.
3. **Verde → azul em tudo**: `--accent` (e derivadas) trocou de verde pra azul nos dois temas; o botão "Enviar por WhatsApp" (que usava o verde fixo `#25D366`) passou a usar a mesma cor de destaque azul do resto do app. Nenhuma cor verde restante no CSS.

### Leva de ajustes de UI/UX na standalone (2026-09-12)
A partir daqui `app/biri-prints-3d-standalone.html` é a única versão oficial (ver "`app/biri-prints-3d-standalone.html` é a única versão oficial" no CLAUDE.md/README.md) — esta leva foi só nela, `app/bancada-3d.html` não foi tocado. Levantamento visual feito pelo usuário (screenshots reais, desktop e mobile), com decisões já definidas antes de implementar; puramente de interface, sem mudar regra de negócio, cálculo ou comportamento funcional de nenhuma tela.

1. **Cabeçalho mobile quebrava em 3 linhas**: no celular, "BIRI PRINTS 3D" + "Danilo · trocar" + "Sair" não cabiam numa linha e o título quebrava palavra por palavra. "Danilo · trocar" e "Sair" saíram do fluxo do cabeçalho no celular e foram pra trás de um ícone de usuário (`#btnUsuarioMenu`), que abre um modal compacto com as mesmas duas ações (`abrirMenuUsuarioMobile`, reaproveitando `abrirTrocaVendedorModal` e o `#btnLogout` já existentes). No computador continuam por extenso como sempre — só o celular tinha o problema de espaço.
2. **Label cortado no filtro de vendedor**: o `<select>` de filtro por vendedor (Orçamentos/Pedidos) tinha `max-width:200px` fixo, cortando "Todos os vendedores". Trocado por `width:auto` com `min-width`/`max-width:100%`, deixando o navegador dimensionar pelo conteúdo.
3. **FAB inconsistente**: Catálogo era a única tela de lista sem o FAB flutuante ("+") que Orçamentos/Clientes já tinham — só o botão centralizado no estado vazio. Catálogo ganhou o mesmo FAB (`addFab('fabAdicionarProduto', ...)`) nos dois estados (vazio e cheio), removendo o botão "Adicionar Produto" duplicado que só existia com a lista cheia. (Pedidos continua sem FAB de propósito — não existe "criar pedido do zero", só conversão a partir de um orçamento.)
4. **Ícone genérico repetido no estado vazio**: Catálogo/Orçamentos/Pedidos/Clientes usavam o mesmo ícone de caixa genérica. Trocado por reaproveitamento dos ícones que cada aba já usa no menu lateral (`iconLayers`, `iconReceipt`, `iconPedido`, `iconClientes`) — sem adicionar nenhuma biblioteca de ícones nova, já que todos os ícones do app são SVG inline nas próprias funções `iconX()`.
5. **Hierarquia inconsistente no modal de orçamento**: "Adicionar item" tinha cartão com borda própria enquanto "Itens"/"Desconto negociado" ficavam soltos. Removido o tratamento de cartão do bloco "Adicionar item"; todas as seções do modal (Cliente, Vendedor, Kit, Adicionar item, Itens, Desconto negociado, Total) passaram a usar o mesmo padrão — só separadas por uma linha fina + respiro (classe `.modal-sections`, `border-top` + `padding-top` em cada filho direto, exceto o primeiro).
6. **Sidebar recolhida sem tooltip**: itens do menu lateral (`.nav-item`) não tinham `title` — recolhida a ícones, não dava pra saber o que cada um era sem clicar. Adicionado `title="<label>"` em todos os itens de navegação (grupo Admin incluso).
7. **Toast em pílula preta**: a duração (2200ms) já estava dentro do esperado (2–3s) — não mudou. A cor mudou do preto sólido (que remetia a alerta/erro) pro azul suave já usado em badges/destaques (`--accent-soft`/`--accent`/`--accent-soft-border`), a mesma receita visual do resto do app.
8. **Fundo cinza-esverdeado**: `--bg` tinha um leve tom esverdeado que destoava do azul de destaque. Ajustado pra um cinza neutro/frio nos dois temas (`#F4F5F6` claro, `#191A1C` escuro) — só essa variável mudou; `--surface`/`--surface-2`/`--border` ficaram como estavam.

Suíte completa validada 3x seguidas (25/25) antes de comitar; `tests/test_helpers_standalone.js` e os testes que abriam "Trocar de vendedor"/"Sair" direto pelo cabeçalho (agora escondido no celular) foram ajustados pra passar pelo novo menu compacto.

### Filtros na tela de Catálogo (2026-09-12)
Pedido do usuário: filtrar o catálogo por impressora, material, faixa de preço e nome, combináveis entre si. Implementado só na standalone (`app/bancada-3d.html` não foi tocado).

1. **Impressora e material**: listas de checkboxes (`state.catalogoFiltros.impressoras`/`.materiais`, arrays de ids) — seleção múltipla dentro de cada dimensão é "OU" (mostra a peça se ela bater com qualquer impressora/material marcado), mas as duas dimensões entre si (e com faixa de preço e busca) são "E". Cada peça só tem uma impressora/material cadastrado (`impressora_id`/`material_id`); a seleção múltipla é do controle de filtro, não um novo campo de "compatível com várias impressoras" no produto.
2. **Faixa de preço**: dois `<input type=range>` sobrepostos (truque clássico de slider duplo, com `pointer-events` habilitado só no thumb) + dois campos numéricos editáveis, sincronizados nos dois sentidos. Limites do slider (`catalogoLimitesPreco()`) recalculados a cada render a partir do preço final (`precoAjustado`) de **todas** as peças do catálogo (não só as já filtradas), senão o intervalo ia encolhendo e não dava pra ampliar de novo depois de filtrar.
3. **Busca por nome**: parcial, case-insensitive e ignorando acentos (`normalizarBusca`, via `.normalize('NFD')`), com debounce de 300ms.
4. **Combinação e UI geral**: "Limpar filtros" só aparece com algum filtro ativo; contagem mostra "N de M peças encontradas" quando filtrado; estado vazio dedicado ("Nenhuma peça encontrada... ajustar ou limpar os filtros") separado do estado vazio de catálogo sem nenhuma peça cadastrada.
5. **Re-render**: checkboxes disparam `renderMain()` cheio (like os filtros já existentes de Orçamentos/Pedidos). Busca e faixa de preço usam uma função mais leve, `atualizarGridCatalogo()` (só recria o grid + contador + botão de limpar), pra não perder o foco do campo de busca nem interromper o arrasto do slider a cada re-render.
6. **URL (query params)**: filtros sincronizados via `history.replaceState` (não `pushState` — evita empilhar histórico do navegador a cada tecla/arrasto). No boot, `lerFiltrosCatalogoDaURL()` lê os params antes do primeiro render e força a aba pra Catálogo se algum filtro de catálogo estiver na URL, pra um link compartilhado abrir já filtrado.
7. **Mobile**: painel de filtros vira uma gaveta colapsável atrás de um botão "Filtros" (mesmo breakpoint de 720px já usado no resto do app); no desktop fica sempre visível, em grid de até 4 colunas.

Suíte nova dedicada (`tests/test_catalogo_filtros_standalone.js`) cobrindo cada filtro isolado, a combinação "E", o estado vazio de filtro, "Limpar filtros", debounce da busca e persistência via URL (inclusive contra o backup real importado). Suíte completa validada 3x seguidas (26/26) antes de comitar.

### Testes automatizados (Playwright)
Ver `tests/` — 18 arquivos de teste (`test_*.js`) rodando contra `app/bancada-3d.html` (17 suítes) e um (`test_standalone_firebase.js`) contra `app/biri-prints-3d-standalone.html` com um mock do Firebase. Rode `npm test` (ou `node tests/run-all.js`) depois de `npm install` — os testes usam o Chromium gerenciado pelo próprio Playwright (rode `npx playwright install chromium` na primeira vez).

Cobertura resumida por arquivo:
- `test_edit_peca.js`: edição de peça, ajuste manual de preço, persistência, preço fluindo pro orçamento.
- `test_novo_peca.js`: mesmo recurso de ajuste manual na criação de peça nova (via modal "Adicionar Produto").
- `test_duplicar_peca.js`: duplicar peça sem alterar a original.
- `test_kits_promocoes.js`: algoritmo de desconto de kit isolado + fluxo completo na UI.
- `test_kit_bulk_add.js`: botão "+ Kit" adiciona todos os produtos do grupo de uma vez, com checkboxes simulando inclusão/exclusão.
- `test_compartilhar_catalogo.js`: modal de compartilhar catálogo, seleção de peças, prévia ao vivo, aviso de promoção.
- `test_impressoras.js`: cadastro de impressora, perfis por impressora, troca de impressora no orçamento.
- `test_validacao_campos.js`: asteriscos, validação inline em todos os formulários.
- `test_whatsapp_orcamento.js`: normalização de telefone, geração de texto, proteção contra corrupção de emoji, fluxo de envio via wa.me/api.whatsapp.com.
- `test_orc_list_separacao.js`: proteção contra o bug de card "engolindo" o próximo.
- `test_clientes.js`: cadastro de clientes, validações, integração com orçamento.
- `test_converter_pedido.js`: conversão orçamento→pedido, sub-status, pagamento, cancelamento, reversão.
- `test_vendedores.js`: cadastro de vendedores, gate de login por dispositivo, ativo/inativo.
- `test_filtros_orc_pedidos.js`: filtros por vendedor respeitando `vendedor_id` vs `vendedor_pedido_id`.
- `test_validacao_contato.js`: máscara e validação de telefone/e-mail nos 3 formulários.
- `test_menu_lateral.js`: menu lateral/gaveta, recolher/expandir, navegação por `data-nav`.
- `test_standalone_firebase.js`: login, cadastro, catálogo e importação de backup na versão standalone, com Firebase mockado.
- `test_catalogo_filtros_standalone.js`: filtros de catálogo (impressora, material, faixa de preço, busca por nome), combinação "E", estado vazio de filtro, "Limpar filtros", debounce e persistência via URL.

### Versão standalone fora do Claude (Firebase + login)
Ver `docs/STANDALONE-SETUP.md` para o passo a passo completo de configuração (criar projeto Firebase, publicar no GitHub Pages, importar `data/biri-prints-3d-backup.json`).

**Limitação conhecida**: as duas versões (Claude e standalone) são independentes e **divergem em recursos** — a standalone ainda não tem "Enviar orçamento por WhatsApp", cadastro de clientes, vendedores/pedidos, nem a máscara/validação de telefone e e-mail. Isso é o principal trabalho pendente de sincronização entre as duas versões.

### Dados no banco de dados real (versão Claude, em 2026-09-08)
- Config: tarifa R$0,94375/kWh, falha 10%, mão de obra R$0, margem 100%, piso R$8.
- Impressora: "Bambu Lab A1" (0,12kW, R$4.500, 3.000h de vida útil).
- Material: PLA Básico (Multifila) R$110/kg.
- Produtos cadastrados: "cestinha de maçã", "Porta Post-it maçã", "Marca páginas maçã", "Porta canetas grande - Formato de lápis", "Porta canetas pequeno - Formato de lápis".
- Grupo de kit: "Kit Professores" (as 5 peças acima). Promoção: "Dia dos professores" (01/09 a 09/10/2026, 3+ produtos → 5%, 4+ produtos → 8%).
- Esses mesmos dados foram exportados para `data/biri-prints-3d-backup.json`.

### Observação sobre acesso multiusuário (versão Claude)
Pendente de teste: banco de dados do Artifact é compartilhado, mas restrito a membros da mesma organização Claude do dono do artefato.
