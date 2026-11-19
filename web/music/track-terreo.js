// music/track-terreo.js — A MÚSICA DO TÉRREO (o castelo): dungeon synth /
// dark ambient nórdico SEM PULSO. Referência: Trollslottet — "Nordanvinden"
// (Sorgeberget, Cryo Crypt, 2024): <https://www.youtube.com/watch?v=wEdRb27q-Dw&t=196s>
// Ré menor — a tônica do título e da abertura passa de mão em mão (o drone
// nasce no MESMO D2: quando o jogo começa, o fade carrega a nota de um pro
// outro sem costura). Sem batida nenhuma: o castelo fora do habitat dela é
// um lugar frio e vazio — o pulso de Berlim é do castelo VIVO (título).
// A peça mora DEBAIXO do vento: o dono do térreo é o vento, ela acompanha —
// camadas ~15% abaixo do equivalente do título, e nenhuma voz sustentada
// na faixa do assobio da fresta (1,5-2 kHz), que não divide octava com ela.
// Contrato de trilha: start(ctx, buses, alive) → { nodes, timers }.
export const trackTerreo = {
  id: 'terreo',
  start(ctx, buses, alive) {
    const AC = ctx;            // o corpo da receita é o glue nome por nome
    const ambGain = buses.amb; // bus da ambiência (o mesmo de sempre)
    const ambNodes = [];       // nós vivos DESTA execução: o fade do maestro mata todos

    // Camadas, todas por scheduler irregular (nada de LFO de amplitude
    // periódico — a regra do glue vale aqui por inteiro): o fôlego do
    // portão (drone que deriva devagar na FREQUÊNCIA), o coro do frio
    // (acordes de longa forma que incham e se dissolvem), o canto da fresta
    // (a melodia — o vento cantando, frases esparsas com eco comprido),
    // e o corno do norte (a chamada distante, raríssima). Cada camada mora
    // num bus próprio nos ambNodes: o fade da troca de tema mata tudo junto
    const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
    // relógio congelado (contexto ainda suspenso): re-agenda curto SEM tocar
    // no relógio — senão duas frases/acordes nascem no MESMO instante quando
    // o contexto finalmente abre
    const aguardaRodando = (rearm) => {
      if (AC.state === 'running') return false;
      setTimeout(rearm, 300);
      return true;
    };

    // o fôlego do portão: D2 + A2 + D1 — duas saws desafinadas (batimento
    // lento, o ar "não afina") sob um lowpass que deriva; o corpo respira na
    // frequência, nunca no volume. O MESMO D2 do drone do título: a tônica
    // passa de mão em mão no fade da entrada no jogo
    const padG = AC.createGain();
    padG.gain.value = 0;
    padG.gain.setTargetAtTime(0.026, AC.currentTime, 3); // o portão respira devagar
    const padLp = AC.createBiquadFilter();
    padLp.type = 'lowpass';
    padLp.frequency.value = 260;
    padLp.Q.value = 0.5;
    for (const [f, type, v] of [[73.42, 'sawtooth', 1], [74.05, 'sawtooth', 0.7], [110, 'triangle', 0.5], [36.71, 'sine', 0.5]]) {
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
    padDrift.frequency.value = 0.02;
    const padDriftG = AC.createGain();
    padDriftG.gain.value = 90;
    padDrift.connect(padDriftG);
    padDriftG.connect(padLp.frequency);
    padDrift.start();
    padLp.connect(padG);
    padG.connect(ambGain);
    ambNodes.push(padLp, padG, padDrift, padDriftG);

    // o coro do frio: acordes de longa forma (Vangelis melancólico) girando
    // pelo lado escuro do Dm (Dm C Bb Am Gm) — dois coros desafinados por
    // nota; cada acorde incha em 4,5-7,5 s e se dissolve em 6-10 s, um a
    // cada ~17-29 s, sempre diferente do anterior. Lowpass fechado: o coro
    // fica longe da faixa do assobio da fresta
    const coroG = AC.createGain();
    coroG.gain.value = 0.9;
    coroG.connect(ambGain);
    ambNodes.push(coroG);
    const COROS = [
      [50, 53, 57], // Dm: D3 F3 A3
      [48, 52, 55], // C:  C3 E3 G3
      [46, 50, 53], // Bb: Bb2 D3 F3
      [45, 48, 52], // Am: A2 C3 E3
      [43, 46, 50], // Gm: G2 Bb2 D3
    ];
    let lastCoro = -1;
    const coroTick = () => {
      if (!alive()) return;
      if (aguardaRodando(coroTick)) return;
      let ci = Math.floor(Math.random() * COROS.length);
      if (ci === lastCoro) ci = (ci + 1) % COROS.length;
      lastCoro = ci;
      const t = AC.currentTime + 0.1;
      const sobe = 4.5 + Math.random() * 3;  // inchaço: 4,5-7,5 s
      const desce = 6 + Math.random() * 4;   // dissolução: 6-10 s
      const dur = sobe + desce;
      for (const m of COROS[ci]) {
        for (const cents of [-3.5, 3.5]) {
          const o = AC.createOscillator();
          o.type = 'triangle';
          o.frequency.value = mf(m);
          o.detune.value = cents;
          const g = AC.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.009, t + sobe);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
          o.connect(g);
          g.connect(coroG);
          o.start(t);
          o.stop(t + dur + 0.3);
        }
      }
      setTimeout(coroTick, (dur + 4 + Math.random() * 8) * 1000);
    };
    coroTick();

    // o canto da fresta: a MELANCOLIA da peça — o vento cantando nas fendas
    // do salão. Voz = triângulo + sine de oitava com vibrato miúdo (sopro,
    // não sirene), frases DESCENDENTES em Dm (a tristeza nórdica cai), eco
    // comprido (a pedra devolve devagar). Às vezes a fresta cala um bom
    // tempo; e nunca repete a mesma frase duas vezes seguidas
    const leadG = AC.createGain();
    leadG.gain.value = 0.9;
    leadG.connect(ambGain);
    ambNodes.push(leadG);
    const leadDly = AC.createDelay(1.5);
    leadDly.delayTime.value = 0.5;
    const leadFb = AC.createGain();
    leadFb.gain.value = 0.45;
    const leadWet = AC.createGain();
    leadWet.gain.value = 0.5;
    leadDly.connect(leadFb);
    leadFb.connect(leadDly);
    leadDly.connect(leadWet);
    leadWet.connect(leadG);
    ambNodes.push(leadDly, leadFb, leadWet);
    const FRASES = [
      [[74, 1.8], [72, 1.2], [69, 2.2], [67, 1.2], [65, 2.6], [64, 1.4], [62, 4.2]],
      [[65, 1.6], [64, 1.2], [62, 2.4], [60, 1.4], [62, 1.8], [65, 1.2], [64, 4.6]],
      [[69, 2], [67, 1.2], [65, 1.6], [64, 1.2], [62, 2.4], [57, 4.4]],
      [[74, 2.2], [69, 1.2], [70, 1.6], [69, 1.2], [67, 1.6], [65, 1.2], [64, 4.4]],
    ];
    let lastFr = -1;
    const leadTick = () => {
      if (!alive()) return;
      if (aguardaRodando(leadTick)) return;
      if (Math.random() < 0.28) {
        setTimeout(leadTick, 7000 + Math.random() * 12000); // a fresta cala
        return;
      }
      let fi = Math.floor(Math.random() * FRASES.length);
      if (fi === lastFr) fi = (fi + 1) % FRASES.length;
      lastFr = fi;
      let t = AC.currentTime + 0.2;
      for (const [m, dur] of FRASES[fi]) {
        const o = AC.createOscillator();
        o.type = 'triangle';
        o.frequency.value = mf(m);
        const o2 = AC.createOscillator();
        o2.type = 'sine';
        o2.frequency.value = mf(m) * 2.002;
        const vib = AC.createOscillator();
        vib.frequency.value = 4.4 + Math.random() * 0.7;
        const vibG = AC.createGain();
        vibG.gain.value = 5.5; // ±5.5 cents: sopro, não sirene
        vib.connect(vibG);
        vibG.connect(o.detune);
        vibG.connect(o2.detune);
        const g = AC.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.036, t + 0.35); // ataque lento: a frase chega, não arrepia
        g.gain.setValueAtTime(0.036, t + dur - 0.2);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6);
        o.connect(g);
        o2.connect(g);
        g.connect(leadG);
        g.connect(leadDly);
        o.start(t);
        o2.start(t);
        vib.start(t);
        o.stop(t + dur + 0.7);
        o2.stop(t + dur + 0.7);
        vib.stop(t + dur + 0.7);
        t += dur;
      }
      setTimeout(leadTick, (t - AC.currentTime) * 1000 + 2500 + Math.random() * 9000);
    };
    setTimeout(leadTick, 3000 + Math.random() * 4000); // a fresta demora a achar a voz

    // o corno do norte: a chamada distante (o lur que atravessa o frio) —
    // duas saws desafinadas sob lowpass, ataque longo, a quinta que cai
    // (A3→D3 ou F3→D3) e morre na tônica. Raríssima: uma chamada a cada
    // ~40-85 s — o épico da peça, nunca o dono dela
    const hornG = AC.createGain();
    hornG.gain.value = 1;
    hornG.connect(ambGain);
    ambNodes.push(hornG);
    const hornTick = () => {
      if (!alive()) return;
      if (aguardaRodando(hornTick)) return;
      const notas = Math.random() < 0.5 ? [57, 50] : [53, 50];
      const t = AC.currentTime + 0.1;
      for (let i = 0; i < notas.length; i++) {
        const t0 = t + i * 3.2;
        for (const cents of [-4, 4]) {
          const o = AC.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = mf(notas[i]);
          o.detune.value = cents;
          const lp = AC.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 420;
          lp.Q.value = 1.1;
          const g = AC.createGain();
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.linearRampToValueAtTime(0.013, t0 + 1.4); // o sopro inchando longe
          g.gain.setValueAtTime(0.013, t0 + 3);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 5.4);
          o.connect(lp);
          lp.connect(g);
          g.connect(hornG);
          o.start(t0);
          o.stop(t0 + 5.6);
        }
      }
      setTimeout(hornTick, 40000 + Math.random() * 45000);
    };
    setTimeout(hornTick, 25000 + Math.random() * 20000); // o primeiro chamado vem depois de a gente já ter entrado

    return { nodes: ambNodes, timers: [] }; // os schedulers se matam pelo alive()
  },
};
