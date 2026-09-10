## Diagnóstico da planilha de precificação (impressão 3D)

Data: 2026-09-07
Arquivo final: Precificação (ajustada).xlsx
Impressora: Bambu Lab A1 + AMS combo, comprada por R$4.500.

### Estado final do modelo (aba Custos)
- PLA BÁSICO (Voolt): R$100/Kg
- Energia: **R$0,1133/hora** = Potência (0,12 kW, estimativa p/ A1+AMS) × Tarifa cheia CPFL (R$0,94375/kWh, conta AGO/2026) — agora é fórmula (linha 3 = linha9 × linha10), recalcula sozinha se algum dos dois mudar
- Desgaste da Máquina: **R$1,50/hora** = Preço da impressora (R$4.500) ÷ Vida útil estimada (3.000h = uso moderado ~1.000h/ano, recuperando o investimento em 3 anos) — também fórmula (linha4 = linha11 ÷ linha12)
- Falhas: 10% (ainda não confirmado como taxa real — pendente)
- Mão de obra: R$0/hora (decisão do Danilo — hobby/renda extra, não cobra a própria hora)
- Embalagem: varia por produto → input manual em cada linha da aba Precificação (não é mais valor único)
- Margem: 100% markup sobre custo (= 50% de margem sobre preço de venda) — validado como dentro da faixa de mercado
- **Preço Mínimo: R$8,00/peça** — Preço Final agora nunca fica abaixo disso (fórmula com MAX), exceto em linhas de produto vazias, que ficam com preço R$0

### Exemplo TESTE (17g PLA, 1h21 de máquina) com os novos números
Material R$1,70 + Energia R$0,153 + Desgaste R$2,025 = Subtotal R$3,878 → +10% falhas = R$4,266 (Custo Técnico) → Mão de obra R$0 + Embalagem R$0 = Custo Total R$4,266 → Lucro (100%) R$4,266 → **Preço Final R$8,53** (acima do piso de R$8, então o piso não interfere aqui).

Isso é bem diferente do primeiro cálculo (R$5,52) — principalmente pela Desgaste da Máquina, que subiu de R$0,25 para R$1,50/hora ao amortizar de fato o valor da impressora.

### Estrutura da planilha
- Aba Precificação com fórmulas prontas nas linhas 2-21 (Produto/Material/Marca/Gramatura/Tempo/Embalagem = inputs; resto calcula sozinho).
- Linha de TOTAL (22) fora do intervalo somado, sem autorreferência.
- Coluna "Observação" na aba Custos documentando a origem de cada premissa, incluindo fonte da estimativa de potência ([guia de consumo Bambu Lab A1 — Call3D](https://www.call-3d.com/blogs/upgrades/bambu-lab-power-consumption-review)) e a tarifa CPFL usada (conta de AGO/2026, UC 2.431.200.035-20).

### Ainda em aberto
- Taxa de falha de 10% ainda não confirmada como real (pendente).
- Comissões de marketplace / frete ainda não estão no modelo.
- Potência de 120W é estimativa — vale confirmar com um medidor de consumo (smart plug) se quiser mais precisão.

### Planilhas de referência
As planilhas originais que documentam a evolução desse cálculo (`precificacao.xlsx`, `precificacao_v2.xlsx`, `precificacao_v3.xlsx`) não foram incluídas neste repositório — são material histórico de apoio, não fazem parte do sistema. Se quiser guardá-las junto do código de qualquer forma, é só adicioná-las numa pasta `referencias/`.
