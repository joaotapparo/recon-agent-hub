# Avaliação da triagem por IA (RF17) - 3 rodadas

- Data: 2026-11-24 17:20
- Modelo(s): claude-opus-5-5
- Casos: 40 (20 reais, 20 falsos positivos)
- Rodadas: 3 (temperatura 1.0; a IA não é determinística)

| Métrica | Média | Mín. | Máx. |
|---|---|---|---|
| Acurácia (todos os casos) | 84.2% | 82.5% | 85.0% |
| Acurácia (só casos decididos) | 100.0% | 100.0% | 100.0% |
| Precisão (alarme falso) | 100.0% | 100.0% | 100.0% |
| Recall (achados reais confirmados) | 78.3% | 75.0% | 80.0% |
| Especificidade (falsos positivos descartados) | 90.0% | 90.0% | 90.0% |
| Cobertura (decididos sem revisão) | 84.2% | 82.5% | 85.0% |
| Reais descartados como falso positivo | 0.0% | 0.0% | 0.0% |

## Matriz de confusão (soma das rodadas)

| Gabarito \ IA | Real | Falso positivo | Revisão |
|---|---|---|---|
| Real | 47 | 0 | 13 |
| Falso positivo | 0 | 54 | 6 |

## Casos em que a IA divergiu do gabarito

- **E-R01** (gabarito: true_positive): rodada 1: needs_review; rodada 2: needs_review; rodada 3: needs_review
- **E-R02** (gabarito: true_positive): rodada 1: needs_review; rodada 2: needs_review; rodada 3: needs_review
- **E-R03** (gabarito: true_positive): rodada 1: needs_review; rodada 2: needs_review; rodada 3: needs_review
- **E-R04** (gabarito: true_positive): rodada 1: needs_review; rodada 2: needs_review; rodada 3: needs_review
- **S-F03** (gabarito: false_positive): rodada 1: needs_review; rodada 2: needs_review; rodada 3: needs_review
- **S-F11** (gabarito: false_positive): rodada 1: needs_review; rodada 2: needs_review; rodada 3: needs_review
- **S-R05** (gabarito: true_positive): rodada 2: needs_review

Rodadas executadas em duas chamadas do script (avaliacao-20261124-1712.json, avaliacao-20261124-1720.json), juntadas aqui. Custo medido pelos tokens de cada resposta: US$ 0,33 + US$ 0,72 = **US$ 1,04**.
