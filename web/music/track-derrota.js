// music/track-derrota.js — A CODA DA MORTE: os motivos da tela de título
// (referência: track-titulo.js, Cimerion "Contresort") RECONHECIDOS e depois
// ENGOLIDOS. Ré menor, 66 bpm, peça one-shot (~22 s): o drone das muralhas é
// o MESMO, mas o lowpass afunda (as paredes fecham); o pulso de Berlim toca
// o ostinato do título uma vez inteiro e, na segunda passada, afunda um tom
// por dentro de Dm (o Eb emprestado do esgoto) com os passos esticando até
// tombar em D3; a flauta da torre sobe a frase de abertura e não resolve —
// cai, e o vibrato quebra na última nota; o sino do salão bate duas vezes, a
// segunda rachada; o tambor fundo do título fecha a peça. Depois: silêncio
// quase absoluto — a tela de morte fica só com o resto do ar. Contrato de
// trilha: start(ctx, buses, alive) → { nodes, timers }. Tudo é agendado de
// UMA vez no timeline do contexto (a morte só acontece com o castelo
// acordado — sem relógio suspenso para guardar); o fade do maestro mata o
// que estiver vivo se o jogador apertar ENTER antes do fim.
export const trackDerrota = {
  id: 'derrota',
  start(ctx, buses, alive) {
    const AC = ctx;
    const ambGain = buses.amb;
    const ambNodes = [];

    const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const BEAT = 60 / 66;
    const STEP = BEAT / 2; // a colcheia do pulso de Berlim, a mesma do título
    const t0 = AC.currentTime + 0.15; // o baque da morte (evento 7) fala primeiro

    // drone das muralhas: o MESMO acorde do título (D2 + A2 + D3, saws
    // desafinadas batendo devagar), mas o lowpass desce de 380 para 95 Hz ao
    // longo da peça — o ar fecha; o corpo some junto no fim (rampa para
    // 0.0001 e a tela fica muda até o ENTER recomeçar)
    const padG = AC.createGain();
    padG.gain.value = 0;
    padG.gain.setTargetAtTime(0.05, t0, 1.2);
    padG.gain.setValueAtTime(0.05, t0 + 15);
    padG.gain.linearRampToValueAtTime(0.0001, t0 + 21.5);
    const padLp = AC.createBiquadFilter();
    padLp.type = 'lowpass';
    padLp.Q.value = 0.6;
    padLp.frequency.setValueAtTime(380, t0);
    padLp.frequency.linearRampToValueAtTime(95, t0 + 19); // as paredes fecham
    for (const [f, type, v] of [[73.42, 'sawtooth', 1], [74.2, 'sawtooth', 0.8], [110, 'triangle', 0.7], [146.83, 'sine', 0.4]]) {
      const o = AC.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const og = AC.createGain();
      og.gain.value = v;
      o.connect(og);
      og.connect(padLp);
      o.start(t0);
      o.stop(t0 + 23);
      ambNodes.push(o);
    }
    const padDrift = AC.createOscillator();
    padDrift.frequency.value = 0.025;
    const padDriftG = AC.createGain();
    padDriftG.gain.value = 110;
    padDrift.connect(padDriftG);
    padDriftG.connect(padLp.frequency);
    padDrift.start(t0);
    padDrift.stop(t0 + 23);
    padLp.connect(padG);
    padG.connect(ambGain);
    ambNodes.push(padLp, padG, padDrift, padDriftG);

    // o pulso de Berlim morre em três gestos: o ostinato do título INTEIRO e
    // em ponto (passada 1, reconhecimento), a mesma linha afundada um tom
    // com os passos esticando (passada 2, o chão cede — o Eb é o escuro que
    // o esgoto já usa por dentro do Dm), e D3 batendo duas vezes sozinho (o
    // pulso acaba). Bus próprio (seqG): o fade do maestro mata tudo junto
    const seqG = AC.createGain();
    seqG.gain.value = 0.85;
    seqG.connect(ambGain);
    ambNodes.push(seqG);
    const SEQ = [50, 62, 60, 57, 53, 55, 57, 60]; // D3 D4 C4 A3 F3 G3 A3 C4 — o motivo do título
    const golpe = (m, t, dur, cutoff, v) => {
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
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp);
      lp.connect(g);
      g.connect(seqG);
      o.start(t);
      o.stop(t + dur + 0.1);
      ambNodes.push(o);
    };
    // passada 1: o motivo como no título (colcheias, acento nos tempos fortes)
    for (let k = 0; k < 8; k++) {
      const t = t0 + 0.6 + k * STEP + (Math.random() - 0.5) * 0.024;
      golpe(SEQ[k], t, 0.36, (k % 4 === 0 ? 780 : 420) + Math.random() * 360, (k % 4 === 0 ? 0.052 : 0.028) * (0.85 + Math.random() * 0.3));
    }
    // passada 2: um tom abaixo, o passo estica a cada nota (0.45 s → 1.2 s) e
    // o corte fecha — a linha afunda e não tem pressa de sumir
    const SAG = [48, 60, 58, 55, 51, 53, 50, 50]; // C3 C4 Bb3 G3 Eb3 F3 D3 D3
    let ts = t0 + 4.5;
    for (let k = 0; k < 8; k++) {
      const dur = STEP * (1 + k * 0.22);
      golpe(SAG[k], ts, dur + 0.5, 400 - k * 30 + Math.random() * 160, 0.026 * (0.85 + Math.random() * 0.3));
      ts += dur;
    }
    // o pulso sozinho: duas batidas de D3 e silêncio
    golpe(50, t0 + 12.6, 0.9, 260, 0.03);
    golpe(50, t0 + 14.0, 1.4, 240, 0.02);

    // a flauta da torre: a frase de abertura do título sobe (69 72 74) e NÃO
    // resolve — cai (70 62) e morre no 58 segurado, com o vibrato abrindo até
    // quebrar (o sopro inteiro virando tremor). Voz e eco: a mesma receita do
    // título (triângulo + sine de oitava, delay 0.42 s que a pedra devolve)
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
    let tf = t0 + 1.0;
    const FRASE = [[69, 1], [72, 1], [74, 1], [70, 2], [62, 2], [58, 6]];
    for (let i = 0; i < FRASE.length; i++) {
      const [m, b] = FRASE[i];
      const dur = b * BEAT;
      const quebra = i === FRASE.length - 1; // a última nota: o vibrato quebra
      const o = AC.createOscillator();
      o.type = 'triangle';
      o.frequency.value = mf(m);
      const o2 = AC.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = mf(m) * 2.002;
      const vib = AC.createOscillator();
      vib.frequency.value = 4.6 + Math.random() * 0.7;
      const vibG = AC.createGain();
      vibG.gain.setValueAtTime(5.5, tf);
      if (quebra) vibG.gain.linearRampToValueAtTime(15, tf + dur); // ±5.5 → ±15 cents
      vib.connect(vibG);
      vibG.connect(o.detune);
      vibG.connect(o2.detune);
      const g = AC.createGain();
      g.gain.setValueAtTime(0.0001, tf);
      g.gain.linearRampToValueAtTime(0.05, tf + 0.14);
      g.gain.setValueAtTime(0.05, tf + Math.max(0.2, dur - 0.1));
      g.gain.exponentialRampToValueAtTime(0.0001, tf + dur + (quebra ? 1.8 : 0.3));
      o.connect(g);
      o2.connect(g);
      g.connect(leadG);
      g.connect(leadDly);
      o.start(tf);
      o2.start(tf);
      vib.start(tf);
      const fin = tf + dur + (quebra ? 1.9 : 0.4);
      o.stop(fin);
      o2.stop(fin);
      vib.stop(fin);
      ambNodes.push(o, o2, vib);
      tf += dur;
    }

    // os sinos do salão: a receita do título (parciais inarmônicas 1, 2.76,
    // 5.4), D5 duas vezes — a segunda rachada (desafinada −35 cents, mais
    // baixa, morre antes)
    const bell = (f, t, vol, decay, det) => {
      for (const [r, v] of [[1, vol], [2.76, vol * 0.4], [5.4, vol * 0.2]]) {
        const o = AC.createOscillator();
        o.type = 'sine';
        o.frequency.value = f * r * det;
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
    bell(587.33, t0 + 2.2, 0.02, 2.8, 1);        // o sino do título, inteiro
    bell(587.33, t0 + 9.5, 0.012, 1.6, 0.9795);  // o sino rachado

    // o tambor fundo do título fecha a peça: o mesmo golpe (sine 62 → 36 Hz)
    const thudT = t0 + 13.4;
    const thud = AC.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(62, thudT);
    thud.frequency.exponentialRampToValueAtTime(36, thudT + 0.5);
    const thudG = AC.createGain();
    thudG.gain.setValueAtTime(0.0001, thudT);
    thudG.gain.linearRampToValueAtTime(0.055, thudT + 0.02);
    thudG.gain.exponentialRampToValueAtTime(0.0001, thudT + 1.1);
    thud.connect(thudG);
    thudG.connect(leadG);
    thud.start(thudT);
    thud.stop(thudT + 1.2);
    ambNodes.push(thud, thudG);

    // a fita: o chiado do título cola a peça no castelo e baixa com ela
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
    hissG.gain.setTargetAtTime(0.0008, t0 + 16, 3);
    hiss.connect(hissHp);
    hissHp.connect(hissG);
    hissG.connect(ambGain);
    hiss.start(t0);
    ambNodes.push(hiss, hissHp, hissG);

    return { nodes: ambNodes, timers: [] }; // one-shot: nada re-agenda
  },
};
