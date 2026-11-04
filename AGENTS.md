# AGENTS.md — guia de trabalho no Castle of Basilisk

Padrões obrigatórios para agentes e humanos que mexerem no código: qualquer
ajuste nasce numa branch, passa pelo gate de testes e entra na `master` via PR.

---

## 1. o fluxo, sempre nessa ordem

```
branch nova → ajuste → teste local → commit → push → PR → review
(automático + próprio) → correção volta no PR → review do dono → merge
```

NENHUM ajuste direto na `master`. Sem exceções: nem fix miúdo, nem typo,
nem "só mudei um número". A `master` recebe exclusivamente merge de PR.

**O merge é SEMPRE decisão do dono do repo.** Agentes (e humanos com menos
permissão que o dono) terminam no PR: abrem, revisam, comentam — e param.
NUNCA mergeie nada sem pedido explícito ("mergeia", "fecha o PR") do dono.
"Está pronto", "smoke verde", "passei o review" não são pedido de merge.

## 2. criar a branch ANTES de tocar no código

Comece pela branch, com o working tree limpo (`git status` precisa estar vazio):

```bash
git checkout master && git pull origin master
git checkout -b <tipo>/<slug>
```

Naming da branch:

- `feature/<slug>` — funcionalidade nova (ex.: `feature/fear-system`)
- `fix/<slug>` — correção de bug
- `audio/<slug>` — só trilha/síntese sonora (`web/game.js`)
- `docs/<slug>` — documentação (README, ARCHITECTURE, AGENTS)
- `balance/<slug>` — ajuste de números de gameplay/medo

`<slug>` em kebab-case, curto e específico (`fix/smoke-cloaca-stride`,
`audio/vento-terreo`). Nome da branch descreve o PR inteiro, não um passo dele.

## 3. padrões de código

### Rust (`src/lib.rs` — todo o jogo, ABI WASM crua)

- **Zero crates, zero std**: jogo compilando direto para
  `wasm32-unknown-unknown`. Não introduza dependência — se a função não cabe
  em Rust puro, ela nasce no JS.
- **O WASM nunca aloca**: nada de `Vec::*` que cresça em runtime persistente,
  nada de `alloc`. Estruturas são `static mut` com layout fixo documentado;
  views JS criadas uma vez e válidas para sempre.
- **REGRA DE OURO**: qualquer função que mude estado (morte/vitória/eventos/
  descida de andar) DEVE chamar `sync_stats()`. Já nasceram dois bugs de
  stats obsoletos — não seja o terceiro.
- Qualquer mudança de layout (STATS, grid, ring buffer de eventos) atualiza
  **no mesmo commit** o mapeamento em `ARCHITECTURE.md`.
- Eventos de áudio são `u32` no ring buffer `u32[16]`: produtor Rust,
  consumidor JS. ID novo = som novo no JS, no mesmo commit.

### JS (`web/game.js` — glue)

- ES module puro, Canvas 2D, WebAudio sintetizada: **zero samples** — todo
  som nasce de oscilador/noise buffer + filtro + envelope, nunca de arquivo.
- Respeitar o acoplamento do loop: tick fixo de **140 ms** por acumulador,
  render por **diff byte-a-byte** (grid `[char][attr]`), câmera fixa 56×32.
- `AudioContext` só no primeiro gesto do usuário — nada de áudio no load.
- LFOs periódicos de amplitude em ambiente produzem som de "ondas do mar":
  camadas ambiente por *scheduler irregular*, não por oscilador de
  ganho periódico.
- Manter um bloco coeso por tema/efeito (ex.: `if (th === 0) {...}` do vento)
  — nada de estado ambiente espalhado.

### Documentação

- README.md: como jogar/testar. ARCHITECTURE.md: por que cada decisão existe.
- IDs de evento, stats e ABI `pfb_*` documentados no mesmo commit que os muda.

## 4. gate de testes ANTES de cada commit

Nada entra em commit sem rodar:

```bash
./build.sh              # compila WASM e copia para web/wasm
node scripts/smoke.mjs  # gate headless: mortes, IA, medo, coroa, bot BFS, fuzz
```

- **`smoke.mjs` tem que passar por completo** — no cenário existente OU com
  o novo cenário que exercita o ajuste.
- Ajuste de gameplay afetando o medo? Rodar também
  `node scripts/fear_bench.mjs [n jogos]` e colar os números no PR
  (vence/40, loucura 40, nível de terror, ticks nv2+).
- Mudança em `web/game.js` só (áudio/render) não exige recompilar o WASM.
  Mudança em `src/lib.rs` exige `./build.sh` antes do smoke.
- Se improvavelmente mudou algo que travou o jogo (estado impossível,
  grid maior de 80×44), o fuzz de 6000 ticks do smoke pega — não silencie
  assertion para "fazer passar".

## 5. commit

- Mensagem em **português, minúsculas, sem prefixo** (`fix:`, `feat:` proibidos)
  — padrão do histórico: uma linha descritiva densa que o futuro entenda sem
  abrir o diff:

  ```
  a loucura so avanca pelo que voce VE: susto miudo (creep +2 sem LOS) nao
  empurra o topo — escapar de perto e escapar de verdade; bench: loucura
  8 -> 5/40, nv2+ 7.8% dos ticks; smoke +1 cenario (sight-only)
  ```

- O que a mensagem deve conter: **o que mudou**, e se for gameplay/balance,
  **os números de bench antes → depois**; se puxou cenário de teste novo,
  dizer.
- Quando o tooling e docs mudarem junto, tudo num commit só da branch —
  não pulverize.
- `./build.sh` também pode gerar mudança em `web/wasm/`: o `.wasm` atualizado
  entra NO MESMO commit que o `src/lib.rs` que o originou.

## 6. push, PR e review

O `/review` roda SOBRE O PR — depois de o PR existir. Antes do push, só a
leitura própria do diff:

```bash
git diff master...HEAD        # conferir o que vai no PR
git push -u origin <tipo>/<slug>
gh pr create --base master --head <tipo>/<slug> [...]
```

PR criado (número N), rodar o review automático no diff DO PR:

```bash
/review N
```

- **Passar tudo pelo `/review`** — é ele o primeiro par de olhos no diff,
  sempre, sem exceção ("só docs", "só uma linha" também passam).
- Corrigir TODO problema apontado em **commit NOVO, com mensagem própria que
  diga o que foi corrigido** — debug esquecido, comentário rascunho, mudança
  colateral que não pertence ao PR, docs/ABI que ficaram pra trás do código
  (seção 3/5). **NUNCA usar `commit --amend`, nunca reescrever histórico
  publicado** (nem `--force`, nem `--force-with-lease`): o histórico tem que
  mostrar CADA passo — cada correção é um commit, um por linha de achado
  quando couber, e o PR atualiza com `git push` normal. Rodar `/review` de
  novo até não sobrar achado relevante.
- Se o `/review` não estiver disponível no ambiente do agente, não é dispença
  para pular: anotar no PR que ele ficou a dever, reler o diff manualmente
  (finds de bug, colateral, docs/ABI) e deixar o `/review` para o dono.
- O `/review` não substitui a leitura própria: reler o diff por cima
  procurando o que automação não pega (coerência com as seções 3 e 4,
  padrões respeitados, gate de testes rodado onde o commit descreve).
- PR aberto precisa ser um PR que você assinaria por baixo.

PR para `master` (`base: master ← compare: <tipo>/<slug>`):

- Título igual o assunto do commit principal (minúsculas).
- Corpo mínimo:
  - **o quê/porquê** — o problema que motivou (bug observado, motivo do
    bench, pergunta do jogador);
  - **como testar** — comandos exatos e o que verificar (ex.: subir no
    térreo e ouvir o vento, `node scripts/smoke.mjs` verde);
  - **números** — bench antes/depois quando for gameplay.
- Se o PR atualiza ABI/stats/IDs de evento, conferir que o README e o
  ARCHITECTURE correspondentes acompanharam os números.
- Depois do review **do dono** sobre o PR, **PARAR**: PR aberto é estado
  final — o merge é do dono do repo, e só quando ELE pedir. Agentes não
  chamam `gh pr merge` jamais: nem normal, nem squash, nem sobre PRs
  "óbvios" ou verdes.
- Merge SQUASH não é o padrão: se a branch tem commits coesos, merge normal
  preserva a narrativa; se a branch ficou suja (WIP, "esqueci um `,`"),
  squash antes do merge.
- Depois do merge, apagar a branch remota e local.
