// music/track-vitoria.js — A CODA DA VITÓRIA: os motivos da tela de título
// (referência: track-titulo.js, Cimerion "Contresort") RECONHECIDOS e depois
// RESOLVIDOS em ré MAIOR (a tierce de Picardie — o castelo abre a boca e
// deixa sair). Ré menor → maior, 66 bpm, peça one-shot (~30 s): o drone das
// muralhas é o MESMO, mas o lowpass ABRE (380 → 1100 Hz, as paredes deixam
// passar a luz); o pulso de Berlim toca o ostinato do título uma vez inteiro,
// repete com o F# no lugar do Fá (o sol dentro) e cadencia com o C# até D4;
// a flauta da torre canta a PRIMEIRA frase do título por inteiro e responde
// com a terceira, virando o Si bemol em Fá# e segurando o D5 no fim; os sinos
// do salão tocam a tríade (D5, F#5, A5 — a terça maior é o sino novo); em
// cima do drone entra o acorde maior (D4 A3 F#4), assenta e apaga suave no
// fim — a tela fica muda até o ENTER, igual à da morte. Contrato de trilha:
// start(ctx, buses, alive) →
// { nodes, timers }. Tudo agendado de UMA vez no timeline do contexto (a
// vitória só acontece com o castelo acordado); o fade do maestro mata o que
// estiver vivo se o jogador apertar ENTER antes do fim.
export const trackVitoria = {
  id: 'vitoria',
  start(ctx, buses, alive) {
    const AC = ctx;
    const ambGain = buses.amb;
    const ambNodes = [];

    const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const BEAT = 60 / 66;
    const STEP = BEAT / 2; // a colcheia do pulso de Berlim, a mesma do título
    const t0 = AC.currentTime + 0.15; // o arpejo de fuga (evento 8) fala primeiro

    // drone das muralhas: o MESMO acorde do título (D2 + A2 + D3, saws
    // desafinadas batendo devagar), mas o lowpass sobe de 380 para 1100 Hz —
    // o ar abre; o acorde MAIOR (D4 A3 F#4, a mesma matéria do pad) entra
    // junto com os sinos, assenta e apaga antes do stop (o mesmo final em
    // silêncio da derrota)
    const padG = AC.createGain();
    padG.gain.value = 0;
    padG.gain.setTargetAtTime(0.05, t0, 1.2);
    padG.gain.setTargetAtTime(0.02, t0 + 24, 1.5); // o acorde assenta no drone
    padG.gain.setValueAtTime(0.02, t0 + 30);       // assentado: âncora do apagar
    padG.gain.linearRampToValueAtTime(0.0001, t0 + 33.5); // apaga ANTES do stop (t0+34) — sem corte seco
    const padLp = AC.createBiquadFilter();
    padLp.type = 'lowpass';
    padLp.Q.value = 0.6;
    padLp.frequency.setValueAtTime(380, t0);
    padLp.frequency.linearRampToValueAtTime(1100, t0 + 12); // as paredes abrem
    for (const [f, type, v, tin] of [
      [73.42, 'sawtooth', 1, t0], [74.2, 'sawtooth', 0.8, t0],
      [110, 'triangle', 0.7, t0], [146.83, 'sine', 0.4, t0],
      [293.66, 'sawtooth', 0.5, t0 + 13.8],  // D4 — o acorde maior entra
      [220, 'triangle', 0.45, t0 + 13.8],    // A3
      [369.99, 'sine', 0.5, t0 + 13.8],      // F#4 — a terça que o título não tinha
    ]) {
      const o = AC.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const og = AC.createGain();
      og.gain.value = 0;
      og.gain.setTargetAtTime(v, tin, tin === t0 ? 1.2 : 2.5);
      o.connect(og);
      og.connect(padLp);
      o.start(tin);
      o.stop(t0 + 34);
      ambNodes.push(o);
    }
    const padDrift = AC.createOscillator();
    padDrift.frequency.value = 0.025;
    const padDriftG = AC.createGain();
    padDriftG.gain.value = 110;
    padDrift.connect(padDriftG);
    padDriftG.connect(padLp.frequency);
    padDrift.start(t0);
    padDrift.stop(t0 + 34);
    padLp.connect(padG);
    padG.connect(ambGain);
    ambNodes.push(padLp, padG, padDrift, padDriftG);

    // o pulso de Berlim vence em três passadas: o ostinato do título INTEIRO
    // (reconhecimento), a mesma linha com o Fá# no lugar do Fá (passada 2, o
    // sol entra por dentro), e a cadência com o C# puxando para D4 (passada
    // 3). Bus próprio (seqG): o fade do maestro mata tudo junto
    const seqG = AC.createGain();
    seqG.gain.value = 0.85;
    seqG.connect(ambGain);
    ambNodes.push(seqG);
    const golpe = (m, t, cutoff, v) => {
      const o = AC.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mf(m);
      const lp = AC.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 3.2;
      lp.frequency.value = cutoff;
      const g = AC.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v, t + 0.014);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
      o.connect(lp);
      lp.connect(g);
      g.connect(seqG);
      o.start(t);
      o.stop(t + 0.45);
      ambNodes.push(o);
    };
    const passada = (NOTAS, ini, corte) => {
      for (let k = 0; k < 8; k++) {
        const t = ini + k * STEP + (Math.random() - 0.5) * 0.024;
        golpe(NOTAS[k], t, (k % 4 === 0 ? 780 : corte) + Math.random() * corte, (k % 4 === 0 ? 0.052 : 0.028) * (0.85 + Math.random() * 0.3));
      }
    };
    const SEQ = [50, 62, 60, 57, 53, 55, 57, 60];       // D3 D4 C4 A3 F3 G3 A3 C4 — o motivo do título
    const MAIOR = [50, 62, 60, 57, 54, 55, 57, 60];     // D3 D4 C4 A3 F#3 G3 A3 C4 — o sol por dentro
    const CADENCIA = [50, 62, 61, 57, 54, 55, 57, 62];  // D3 D4 C#4 A3 F#3 G3 A3 D4 — puxa para D
    passada(SEQ, t0 + 1.2, 420);      // passada 1: o título, inteiro
    passada(MAIOR, t0 + 5.0, 520);    // passada 2: a terça maior entra
    passada(CADENCIA, t0 + 9.4, 560); // passada 3: a cadência resolve em D4
    // o acorde final do pulso: D3 + D4 juntos, segurando
    for (const m of [50, 62]) {
      const t = t0 + 13.7;
      const o = AC.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mf(m);
      const lp = AC.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 3.2;
      lp.frequency.value = 900;
      const g = AC.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.045, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.connect(lp);
      lp.connect(g);
      g.connect(seqG);
      o.start(t);
      o.stop(t + 1.5);
      ambNodes.push(o);
    }

    // a flauta da torre canta INTEIRA: a frase 1 do título exata (a que a
    // derrota não terminou) e a resposta — a frase 3 do título com o Si
    // bemol virando Fá# (66), resolvendo no D5 (74) segurado. Voz e eco: a
    // mesma receita do título (triângulo + sine de oitava, vibrato miudo,
    // delay 0.42 s que a pedra devolve)
    const leadG = AC.createGain();
    leadG.gain.value = 0.9;
    leadG.connect(ambGain);
    ambNodes.push(leadG);
    const leadDly = AC.createDelay(1.5);
    leadDly.delayTime.value = 0.42;
    const leadFb = AC.createGain();
    leadFb.gain.value = 0.42;
    const leadWet = AC.createGain();
    leadWet.gain.value = 0.55;
    leadDly.connect(leadFb);
    leadFb.connect(leadDly);
    leadDly.connect(leadWet);
    leadWet.connect(leadG);
    ambNodes.push(leadDly, leadFb, leadWet);
    const sopro = (NOTAS, ini) => {
      let t = ini;
      for (const [m, b] of NOTAS) {
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
        vibG.gain.value = 5.5; // ±5.5 cents: sopro, não sirene (a regra do título)
        vib.connect(vibG);
        vibG.connect(o.detune);
        vibG.connect(o2.detune);
        const g = AC.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.05, t + 0.14);
        g.gain.setValueAtTime(0.05, t + dur - 0.1);
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
        ambNodes.push(o, o2, vib);
        t += dur;
      }
    };
    const FRASE_1 = [[69, 1], [72, 1], [74, 1], [72, 1], [69, 1], [70, 1], [69, 2]]; // a frase do título, inteira
    const RESPOSTA = [[62, 1], [65, 1], [69, 2], [67, 1], [65, 1], [64, 1], [66, 2], [74, 5]]; // Bb → F#, resolve em D5
    sopro(FRASE_1, t0 + 1.2);
    sopro(RESPOSTA, t0 + 9.0);

    // os sinos do salão tocam a TRÍADE: a mesma matéria do sino do título
    // (parciais inarmônicas 1, 2.76, 5.4), um nota por vez — D5, F#5 (o sino
    // que o título não tinha), A5
    const bell = (f, t, vol, decay) => {
      for (const [r, v] of [[1, vol], [2.76, vol * 0.45], [5.4, vol * 0.22]]) {
        const o = AC.createOscillator();
        o.type = 'sine';
        o.frequency.value = f * r;
        const g = AC.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(v, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
        o.connect(g);
        g.connect(leadG);
        o.start(t);
        o.stop(t + decay + 0.2);
        ambNodes.push(o);
      }
    };
    bell(587.33, t0 + 3.0, 0.022, 3.2);  // D5
    bell(739.99, t0 + 8.5, 0.022, 3.2);  // F#5 — a terça maior soa
    bell(880, t0 + 13.5, 0.024, 3.6);    // A5 — a tríade completa

    // a fita: o chiado do título cola a peça no castelo — aqui ele fica
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
    hiss.start(t0);
    ambNodes.push(hiss, hissHp, hissG);

    return { nodes: ambNodes, timers: [] }; // one-shot: nada re-agenda
  },
};
