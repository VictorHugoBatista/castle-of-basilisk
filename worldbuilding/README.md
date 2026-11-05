# worldbuilding — índice do canon escondido

> Documento interno. Nada aqui aparece ao jogador; o README publicado não
> linka esta pasta (regra de canon, LORE.md §9.6). Cada arquivo declara o
> próprio status no header. Se um texto de jogo vier a contradizer qualquer
> documento daqui, o jogo vence — e o documento muda no MESMO commit
> (mesma regra de ABI do ARCHITECTURE).

## arquivos

| arquivo | status | o que é |
|---|---|---|
| [`LORE.md`](LORE.md) | canon | O canon inteiro: respostas rápidas, cronologia (Império→Regência), a coisa da bacia, o Massacre Silencioso (anúncio/noite/ironia/periferia), a Descida como superstição, o Ferro e o porão, o ladrão e a Liga das Beiras — com as **16 lacunas deliberadas** (§8, o combustível das teorias), as pílulas autorizadas (§7) e as regras de canon para devs (§9) |
| [`LOCALIZACOES.md`](LOCALIZACOES.md) | canon | O reino no mapa: um **Y de rio** (braços Manso e Fundo; o stem, o Cala), a floresta cerrada (o anel), o castelo **na goela** com a cidade interna **dizimada**, a cidade média **esvaziada**, as palafitas ao longo dos três e os povoados de fora — longe de toda margem, e por isso sem o aviso |

## planejados (criar nesta estrutura conforme o futuro demandar)

| arquivo previsto | status | o que abrigará |
|---|---|---|
| `ANDARES.md` | planejado | Um capítulo por andar (1–5): habitat, temperamento dela e o que a geração de cada tema semeia — hoje espalhado entre README e LORE |
| `ANDAR6-CAVERNA.md` | implementado em tela (andares 6–8, Bocarra Diabólica) — o doc de canon por trás dos níveis é o próprio LORE.md §5; separar um arquivo próprio ainda pode valer a pena para as paredes pintadas (lacuna 16) |
| `BEIRA.md` | planejado | Os povos da beira e a Liga: protocolo da maré, o caderno da ladrã, o talho `L.B.`, as três leituras do empregador (lacuna 9) |

## convenções para documento novo

1. Header igual ao do LORE.md: **Documento interno** — e o aviso de que o
   jogo vence.
2. Status no topo, entre `canon` (verdade de bastidor firmada), `pendente`
   (canon de nível/estória amarrada a implementação futura) e `proposta`
   (não-canon: só para discussão, nunca referenciado por outro arquivo).
3. Documento novo NÃO fecha lacuna do LORE.md sem atualizar o LORE.md no
   MESMO commit — lacuna fechada é decisão do PR que a conta por inteiro
   (LORE.md §9.5).
4. Pílula nova exige duas leituras vivas: pílula confirma imagem, jamais
   mecanismo (LORE.md §9.5/§7).
5. Nada daqui entra em tela sem branch própria + smoke verde + PR;
   docs-only passa pelo mesmo gate (build + smoke) antes do commit.
