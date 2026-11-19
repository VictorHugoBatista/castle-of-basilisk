// music/track-abertura.js — A MÚSICA DA ABERTURA: a trama sonora da
// cutscene da porta, ANTES do castelo acordar (referência: Cimerion &
// Oublieth, "Arcanes" — <https://www.youtube.com/watch?v=GooffnSe5D4> —
// o mesmo Cimerion de Contresort, a referência da trilha do título; um
// único tecido sonoro dedicado a Klaus Schulze e Vangelis, dark ambient
// analógico sem o pulso do sequencer). Ré menor — a MESMA tônica da
// trilha do título: a abertura ensaia o que o título vai cantar, e o
// maestro faz a passagem (fade 1.6 s) sem quebrar o fio.
//
// O que muda do título: NADA pulsa aqui — o ostinato de Berlim é o
// castelo VIVO, e a abertura é o nascer do dia anterior a ele. No lugar:
// uma linha de arco que anda (o passo largo do ladrão), pads de longa
// forma (Schulze) e um coro lento de synth (Vangelis), tudo por
// scheduler irregular — a regra do glue vale por inteiro.
//
// E a abertura TEM FIM: não é loop eterno cortado no fade. O glue avisa
// o maestro (musicCoda()) quando a última cena entra nos últimos ~6.5 s
// e a trilha executa a CODA escrita — a cadência andalusa acha a tônica
// no exato instante em que a cutscene afunda no breu. Contrato de
// trilha: start(ctx, buses, alive) → { nodes, timers, coda? }.
export const trackAbertura = {
  id: 'abertura',
  start(ctx, buses, alive) {
    const AC = ctx;
    const ambGain = buses.amb;
    const ambNodes = []; // nós vivos DESTA execução: o fade do maestro mata todos

    const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
    // a CODA: schedulers soltos se calam quando ela começa (os acordes
    // e frases já agendados terminam suas caudas naturais por conta
    // própria — cancelar envelope agendado não dá, e as duas vozes são
    // da mesma família harmônica)
    let codaing = false;
    // relógio congelado (contexto ainda suspenso — o AC pode acordar no
    // MEIO da cutscene, pelo primeiro gesto do jogador): re-agenda curto
    // SEM tocar no relógio — senão coro, olho e flauta nascem todos no
    // MESMO instante quando o contexto finalmente abre
    const aguardaRodando = (rearm) => {
      if (AC.state === 'running') return false;
      setTimeout(rearm, 300);
      return true;
    };

    // ---- 1. o grão da pedra: D1 + A1 + D2 — o castelo ANTES de respirar:
    // duas saws desafinadas (batimento lento) sob um sub de sine e um
    // lowpass que deriva na frequência mais devagar que o do título —
    // a pedra tem séculos, não tem pressa
    const padG = AC.createGain();
    padG.gain.value = 0;
    padG.gain.setTargetAtTime(0.05, AC.currentTime, 3.5); // acorda devagar, mais que o título
    const padLp = AC.createBiquadFilter();
    padLp.type = 'lowpass';
    padLp.frequency.value = 240;
    padLp.Q.value = 0.7;
    for (const [f, type, v] of [[36.71, 'sawtooth', 1], [37.1, 'sawtooth', 0.7], [55, 'triangle', 0.6], [73.42, 'sine', 0.5]]) {
      const o = AC.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const og = AC.createGain();
      og.gain.value = v;
      o.connect(og);
      og.connect(padLp);
      o.start();
      ambNodes.push(o);
    }
    const padDrift = AC.createOscillator();
    padDrift.frequency.value = 0.017; // deriva ~1 volta por minuto
    const padDriftG = AC.createGain();
    padDriftG.gain.value = 80;
    padDrift.connect(padDriftG);
    padDriftG.connect(padLp.frequency);
    padDrift.start();
    padLp.connect(padG);
    padG.connect(ambGain);
    ambNodes.push(padLp, padG, padDrift, padDriftG);

    // ---- 2. a caminhada do ladrão: linha de arco lenta que anda pelo Ré
    // menor — notas inteiras em legato (a próxima nasce DENTRO da cauda
    // da anterior: contrabaixo de synth sem pulso nenhum, o passo é largo
    // demais para dançar). É o chão que preenche os vãos entre os acordes
    // — e a mão do texto: o aspirante entrando na morada
    const walkG = AC.createGain();
    walkG.gain.value = 1;
    walkG.connect(ambGain);
    ambNodes.push(walkG);
    const CAMINHO = [38, 41, 36, 34, 33, 38]; // D2 F2 C2 Bb1 A1 (→ D2): a descida andalusa caminhando
    let wi = CAMINHO.length - 1;
    const anda = () => {
      if (!alive() || codaing) return;
      if (aguardaRodando(anda)) return;
      wi = (wi + 1 + Math.floor(Math.random() * 2)) % CAMINHO.length; // anda 1-2 degraus, nunca estaca
      const f = mf(CAMINHO[wi]);
      const t = AC.currentTime + 0.05;
      const dur = 3.5 + Math.random() * 2.5;
      const o = AC.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const o2 = AC.createOscillator(); // oitava acima: corpo de arco
      o2.type = 'sine';
      o2.frequency.value = f * 2.001;
      const g = AC.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.035, t + 0.9); // o arco puxa
      g.gain.setValueAtTime(0.035, t + dur - 0.4);
      g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.2); // cauda longa: o próximo passo nasce nela
      o.connect(g);
      o2.connect(g);
      g.connect(walkG);
      o.start(t);
      o2.start(t);
      o.stop(t + dur + 1.4);
      o2.stop(t + dur + 1.4);
      setTimeout(anda, dur * 1000 * 0.72); // legato: sobrepõe a cauda
    };
    anda();

    // ---- 3. a corrente do cano: a água da cena do túnel (não é a goteira
    // do esgoto in-game — é o RIO parado lá no fundo do breu). Ruído num
    // bandpass fino que deriva devagar + redemoinhos: aberturas curtas do
    // filtro, sorteadas por scheduler irregular (nada de LFO periódico)
    const noiseBuf = AC.createBuffer(1, Math.floor(AC.sampleRate * 4), AC.sampleRate);
    const nch = noiseBuf.getChannelData(0);
    for (let i = 0; i < nch.length; i++) nch[i] = Math.random() * 2 - 1;
    const water = AC.createBufferSource();
    water.buffer = noiseBuf;
    water.loop = true;
    const waterBp = AC.createBiquadFilter();
    waterBp.type = 'bandpass';
    waterBp.frequency.value = 880;
    waterBp.Q.value = 8;
    const waterG = AC.createGain();
    waterG.gain.value = 0;
    waterG.gain.setTargetAtTime(0.007, AC.currentTime, 4);
    const waterDrift = AC.createOscillator();
    waterDrift.frequency.value = 0.04;
    const waterDriftG = AC.createGain();
    waterDriftG.gain.value = 260;
    waterDrift.connect(waterDriftG);
    waterDriftG.connect(waterBp.frequency);
    waterDrift.start();
    water.connect(waterBp);
    waterBp.connect(waterG);
    waterG.connect(ambGain);
    water.start();
    ambNodes.push(water, waterBp, waterG, waterDrift, waterDriftG);
    const eddy = () => {
      if (!alive() || codaing) return;
      if (aguardaRodando(eddy)) return;
      const t = AC.currentTime;
      const up = 1.5 + Math.random() * 3;      // o redemoinho cresce
      const down = 3 + Math.random() * 4;      // e se aquieta
      const open = 1400 + Math.random() * 900; // abre a boca do filtro
      waterBp.frequency.setTargetAtTime(open, t, up * 0.5);
      waterBp.frequency.setTargetAtTime(880, t + up, down * 0.5);
      setTimeout(eddy, (up + down) * 1000 * (0.7 + Math.random() * 0.9));
    };
    eddy();

    // ---- 4. o coro do breu (Vangelis): acordes de synth que incham do
    // nada e voltam ao nada — UM acorde por vez, dentro do Ré menor; nada
    // repete de imediato. Ciclo FECHADO (corpo 4-6 s, dissolução 5-8 s,
    // vão de 2-6 s: um acorde a cada ~11-20 s — o breu responde, não
    // cala). Cada voz é triangle + sine de quinta/oitava com ataque de
    // SEGUNDOS: cordas de catedral lentas, não stinger
    const choirG = AC.createGain();
    choirG.gain.value = 1;
    choirG.connect(ambGain);
    ambNodes.push(choirG);
    const CHORDS = [
      [50, 57, 60, 64, 69],  // Dm add9 — a abertura em si
      [46, 53, 58, 62, 65],  // Bb maj — o lado que consola
      [43, 50, 55, 62, 67],  // Gm — o lado que aperta
      [45, 52, 57, 60, 64],  // Am — o olho se abrindo
    ];
    let lastCh = -1;
    const choirTick = () => {
      if (!alive() || codaing) return;
      if (aguardaRodando(choirTick)) return;
      let ci = Math.floor(Math.random() * CHORDS.length);
      if (ci === lastCh) ci = (ci + 1) % CHORDS.length;
      lastCh = ci;
      const t = AC.currentTime + 0.1;
      const rise = 4 + Math.random() * 2; // 4-6 s até o corpo
      const fall = 5 + Math.random() * 3; // 5-8 s se dissolvendo
      for (const m of CHORDS[ci]) {
        const f = mf(m);
        const o = AC.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        const o5 = AC.createOscillator(); // quinta 1.003x: batimento miudo
        o5.type = 'sine';
        o5.frequency.value = f * 1.5 * 1.003;
        const g = AC.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.019, t + rise);
        g.gain.setValueAtTime(0.019, t + rise + fall * 0.4);
        g.gain.linearRampToValueAtTime(0.0001, t + rise + fall);
        o.connect(g);
        o5.connect(g);
        g.connect(choirG);
        o.start(t);
        o5.start(t);
        o.stop(t + rise + fall + 0.5);
        o5.stop(t + rise + fall + 0.5);
      }
      setTimeout(choirTick, (rise + fall) * 1000 + 2000 + Math.random() * 4000);
    };
    choirTick();

    // ---- 5. a flauta que ensaia: a torre AINDA não canta — ela ensaia as
    // frases do título, cochichada, em VISITAS encadeadas (1-2 frases por
    // vez, vão de 6-18 s). O eco é mais longo: o pátio vazio devolve de
    // longe. É o fio que costura a abertura no título: quem ouviu os dois
    // reconhece a frase
    const leadG = AC.createGain();
    leadG.gain.value = 0.9;
    leadG.connect(ambGain);
    ambNodes.push(leadG);
    const leadDly = AC.createDelay(1.5);
    leadDly.delayTime.value = 0.58; // pátio maior que a torre
    const leadFb = AC.createGain();
    leadFb.gain.value = 0.5;
    const leadWet = AC.createGain();
    leadWet.gain.value = 0.6;
    leadDly.connect(leadFb);
    leadFb.connect(leadDly);
    leadDly.connect(leadWet);
    leadWet.connect(leadG);
    ambNodes.push(leadDly, leadFb, leadWet);
    const FRASES = [ // as mesmas 3 frases da torre do título — em ensaio
      [[69, 1], [72, 1], [74, 1], [72, 1], [69, 1], [70, 1], [69, 4]],
      [[65, 1], [67, 1], [69, 2], [67, 1], [65, 1], [64, 1], [62, 4]],
      [[62, 1], [65, 1], [69, 2], [67, 1], [65, 1], [64, 1], [58, 1], [62, 4]],
    ];
    let lastPh = -1;
    const tocaFrase = (pi, offset = 0.2) => { // offset: a frase pode ENCADear
      // a anterior (começa onde a cauda dela começa a morrer), não sobrepor
      const BEAT = 60 / 66; // o andamento do título, já respirando aqui
      let t = AC.currentTime + offset;
      for (const [m, b] of FRASES[pi]) {
        const dur = b * BEAT;
        const o = AC.createOscillator();
        o.type = 'triangle';
        o.frequency.value = mf(m);
        const o2 = AC.createOscillator();
        o2.type = 'sine';
        o2.frequency.value = mf(m) * 2.002;
        const vib = AC.createOscillator();
        vib.frequency.value = 4.6 + Math.random() * 0.7;
        const vibG = AC.createGain();
        vibG.gain.value = 5.5; // o mesmo sopro do título
        vib.connect(vibG);
        vibG.connect(o.detune);
        vibG.connect(o2.detune);
        const g = AC.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.03, t + 0.14);
        g.gain.setValueAtTime(0.03, t + dur - 0.1);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);
        o.connect(g);
        o2.connect(g);
        g.connect(leadG);
        g.connect(leadDly);
        o.start(t);
        o2.start(t);
        vib.start(t);
        o.stop(t + dur + 0.4);
        o2.stop(t + dur + 0.4);
        vib.stop(t + dur + 0.4);
        t += dur;
      }
      return t - AC.currentTime; // a cauda da frase, em segundos
    };
    const ensaiaTick = () => {
      if (!alive() || codaing) return;
      if (aguardaRodando(ensaiaTick)) return;
      let pi = Math.floor(Math.random() * FRASES.length);
      if (pi === lastPh) pi = (pi + 1) % FRASES.length; // nunca repete
      lastPh = pi;
      let cauda = tocaFrase(pi);
      if (Math.random() < 0.45) { // visita encadeada: a 2a frase nasce na
        // cauda da 1a (offset), nunca por cima — sobrepostas davam pares
        // de notas que chegavam a tritona sustentada
        let pj = Math.floor(Math.random() * FRASES.length);
        if (pj === pi) pj = (pj + 1) % FRASES.length;
        lastPh = pj;
        cauda = tocaFrase(pj, cauda);
      }
      setTimeout(ensaiaTick, cauda * 1000 + 6000 + Math.random() * 12000);
    };
    ensaiaTick();

    // ---- 6. o olho: de vez em quando, o par de olhos vermelhos do fundo
    // do túnel respira — dois graves desafinados batendo (o desconforto
    // vive do batimento, nunca de ganho periódico) + um golpe fundo.
    // Bus próprio: o tail morre junto no fade
    const eyeG = AC.createGain();
    eyeG.gain.value = 1;
    eyeG.connect(ambGain);
    ambNodes.push(eyeG);
    const eyeTick = () => {
      if (!alive() || codaing) return;
      if (aguardaRodando(eyeTick)) return;
      const t = AC.currentTime + 0.05;
      const rise = 3 + Math.random() * 2;
      const fall = 4 + Math.random() * 3;
      for (const f of [43.65, 45.5]) { // F#1/G#1: batem ~1.9/s no breu
        const o = AC.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const g = AC.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.05, t + rise);
        g.gain.linearRampToValueAtTime(0.0001, t + rise + fall);
        o.connect(g);
        g.connect(eyeG);
        o.start(t);
        o.stop(t + rise + fall + 0.3);
      }
      const thud = AC.createOscillator();
      thud.type = 'sine';
      thud.frequency.setValueAtTime(52, t);
      thud.frequency.exponentialRampToValueAtTime(28, t + 0.6);
      const thudG = AC.createGain();
      thudG.gain.setValueAtTime(0.0001, t);
      thudG.gain.linearRampToValueAtTime(0.06, t + 0.03);
      thudG.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      thud.connect(thudG);
      thudG.connect(eyeG);
      thud.start(t);
      thud.stop(t + 1.5);
      setTimeout(eyeTick, 18000 + Math.random() * 22000);
    };
    eyeTick();

    // ---- 7. a fita: o chiado baixo que cola as camadas (o mesmo lo-fi
    // do título — a mesma fita, o mesmo castelo)
    const hissBuf = AC.createBuffer(1, Math.floor(AC.sampleRate * 3), AC.sampleRate);
    const hch = hissBuf.getChannelData(0);
    for (let i = 0; i < hch.length; i++) hch[i] = Math.random() * 2 - 1;
    const hiss = AC.createBufferSource();
    hiss.buffer = hissBuf;
    hiss.loop = true;
    const hissHp = AC.createBiquadFilter();
    hissHp.type = 'highpass';
    hissHp.frequency.value = 5200;
    const hissG = AC.createGain();
    hissG.gain.value = 0.004;
    hiss.connect(hissHp);
    hissHp.connect(hissG);
    hissG.connect(ambGain);
    hiss.start();
    ambNodes.push(hiss, hissHp, hissG);

    // ---- a CODA: a cadência ESCRITA que fecha a abertura. O glue avisa
    // (maestro → musicCoda()) quando faltam ~6.5 s de cutscene; a
    // descida andalusa (C2 → Bb1 → A1 → D2) acha a tônica, o coro abre
    // em Dm inteiro, a flauta resolve em D5 e a pedra exhala — tudo
    // calibrado pra terminar de se dissolver ANTES do fade do maestro
    // cortar: ninguém é cortado no pico. O D2 que sustenta no fim é a
    // tônica do drone do título: a passagem sai sem costura
    const coda = () => {
      if (codaing || !alive()) return;
      if (aguardaRodando(coda)) return; // AC suspenso: sem o guarda, a
      // cadência inteira (6.5 s de eventos) nascia agendada no MESMO
      // instante contra o relógio congelado — o mesmo motivo dos
      // schedulers soltos usarem aguardaRodando
      codaing = true;
      const t0 = AC.currentTime + 0.05;
      // a caminhada fecha o passo: C2 → Bb1 → A1 → D2
      let tb = t0;
      for (const [m, dur] of [[48, 1.1], [34, 1.1], [33, 1.2], [38, 3.2]]) {
        const f = mf(m);
        const o = AC.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        const o2 = AC.createOscillator();
        o2.type = 'sine';
        o2.frequency.value = f * 2.001;
        const g = AC.createGain();
        g.gain.setValueAtTime(0.0001, tb);
        g.gain.linearRampToValueAtTime(0.042, tb + Math.min(0.5, dur * 0.4));
        g.gain.setValueAtTime(0.042, tb + dur - 0.15);
        g.gain.exponentialRampToValueAtTime(0.0001, tb + dur + 0.9);
        o.connect(g);
        o2.connect(g);
        g.connect(walkG);
        o.start(tb);
        o2.start(tb);
        o.stop(tb + dur + 1.1);
        o2.stop(tb + dur + 1.1);
        tb += dur;
      }
      // o coro abre em Dm inteiro e se desfaz antes do fim da cutscene
      const tc = t0 + 0.5;
      for (const m of [50, 57, 62, 65, 69]) {
        const f = mf(m);
        const o = AC.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        const o5 = AC.createOscillator();
        o5.type = 'sine';
        o5.frequency.value = f * 1.5 * 1.003;
        const g = AC.createGain();
        g.gain.setValueAtTime(0.0001, tc);
        g.gain.linearRampToValueAtTime(0.02, tc + 2.4);
        g.gain.setValueAtTime(0.02, tc + 3.6);
        g.gain.linearRampToValueAtTime(0.0001, tc + 5.8);
        o.connect(g);
        o5.connect(g);
        g.connect(choirG);
        o.start(tc);
        o5.start(tc);
        o.stop(tc + 6.2);
        o5.stop(tc + 6.2);
      }
      // a flauta canta a última vez e resolve em D5
      let tn = t0 + 1.1;
      for (const [m, dur] of [[69, 0.9], [72, 0.9], [74, 2.9]]) {
        const f = mf(m);
        const o = AC.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        const o2 = AC.createOscillator();
        o2.type = 'sine';
        o2.frequency.value = f * 2.002;
        const vib = AC.createOscillator();
        vib.frequency.value = 4.8;
        const vibG = AC.createGain();
        vibG.gain.value = 5.5;
        vib.connect(vibG);
        vibG.connect(o.detune);
        vibG.connect(o2.detune);
        const g = AC.createGain();
        g.gain.setValueAtTime(0.0001, tn);
        g.gain.linearRampToValueAtTime(0.034, tn + 0.18);
        g.gain.setValueAtTime(0.034, tn + dur - 0.1);
        g.gain.exponentialRampToValueAtTime(0.0001, tn + dur + 0.4);
        o.connect(g);
        o2.connect(g);
        g.connect(leadG);
        g.connect(leadDly);
        o.start(tn);
        o2.start(tn);
        vib.start(tn);
        o.stop(tn + dur + 0.5);
        o2.stop(tn + dur + 0.5);
        vib.stop(tn + dur + 0.5);
        tn += dur;
      }
      // a pedra exhala: o drone abre a boca antes do título entrar
      padLp.frequency.setTargetAtTime(560, t0, 2.2);
    };

    return { nodes: ambNodes, timers: [], coda }; // os schedulers se matam pelo alive()
  },
};
