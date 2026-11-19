// music/track-masmorra.js — A MÚSICA DA MASMORRA (a cripta): dark ambient
// de descida, ASSOMBRADO — e quase sem pulso. Referência: Trollslottet —
// "Som Vore Det Evigt" (Kryptan, Cryo Crypt, 2025):
// <https://youtu.be/qJraAOi-bD8?t=2440> (a faixa começa nesse ponto) — o
// MESMO Pär Boström da trilha do térreo, o álbum seguinte. A profecia do
// Kryptan é a tese do fundo: "Deep and silent, the heart shall beat".
// O terror da peça é o canon do LORE: a masmorra foi a prisão política da
// era que caiu — as celas trancadas para sempre guardam os que o tribunal
// recolheu por "semear o medo", os que morreram CALADOS POR DENTRO, os
// que tinham razão e não ficaram nem com ossos à vista. A música é o que
// eles não puderam dizer: os sussurros voltam (noise sussurrado, com pan,
// sempre em célula diferente), e o coro dos mortos canta desafinado
// (segunda menor inchando — quem não tem mais corpo afina errado).
// O SILÊNCIO PERTURBADOR continua dono do BUS (SFX abafados, estalo de
// pedra do glue): a trilha é mais presente que antes, mas mora DEBAIXO do
// silêncio — atmosfera vazia, lugar morto, nada dança. Ré menor — a
// tônica desce de andar em andar (título → térreo → masmorra, sempre no
// D). Contrato de trilha: start(ctx, buses, alive) → { nodes, timers }.
export const trackMasmorra = {
  id: 'masmorra',
  start(ctx, buses, alive) {
    const AC = ctx;            // o corpo da receita é o glue nome por nome
    const ambGain = buses.amb; // bus da ambiência (o mesmo de sempre)
    const ambNodes = [];       // nós vivos DESTA execução: o fade do maestro mata todos

    // Camadas, todas por scheduler irregular (nada de LFO de amplitude
    // periódico — a regra do glue vale aqui por inteiro): a pedra funda
    // (drone que deriva devagar na FREQUÊNCIA), o coração fundo (lub-dub
    // longínquo, o batimento que a profecia promete), os sussurros (os
    // calados por dentro, falando de novo — noise em bandpass com pan), o
    // coro de baixo (acordes de longa forma, raros e escuros), o coro dos
    // mortos (segunda menor inchando: os sem ossos cantando desafinado) e
    // o lamento da cripta (a melodia — se é que se pode chamar de
    // melodia: notas afundando). Cada camada mora num bus próprio nos
    // ambNodes: o fade da troca de tema mata tudo junto
    const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
    // relógio congelado (contexto ainda suspenso): re-agenda curto SEM tocar
    // no relógio — senão duas frases/acordes nascem no MESMO instante quando
    // o contexto finalmente abre
    const aguardaRodando = (rearm) => {
      if (AC.state === 'running') return false;
      setTimeout(rearm, 300);
      return true;
    };

    // a pedra funda: D1 + A1 + D2 — o grão do túnel (a mesma tonalidade do
    // "grão da pedra" da abertura, uma oitava de fôlego mais fundo que o
    // portão), duas saws desafinadas sob sine sub; lowpass fechadíssimo:
    // a pedra não canta, rumina
    const padG = AC.createGain();
    padG.gain.value = 0;
    padG.gain.setTargetAtTime(0.03, AC.currentTime, 4); // a cripta acorda devagar, mas acorda
    const padLp = AC.createBiquadFilter();
    padLp.type = 'lowpass';
    padLp.frequency.value = 230;
    padLp.Q.value = 0.5;
    for (const [f, type, v] of [[36.71, 'sawtooth', 1], [36.98, 'sawtooth', 0.7], [55, 'triangle', 0.5], [73.42, 'sine', 0.4]]) {
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
    padDrift.frequency.value = 0.015;
    const padDriftG = AC.createGain();
    padDriftG.gain.value = 80;
    padDrift.connect(padDriftG);
    padDriftG.connect(padLp.frequency);
    padDrift.start();
    padLp.connect(padG);
    padG.connect(ambGain);
    ambNodes.push(padLp, padG, padDrift, padDriftG);

    // o coração fundo: lub-dub longínquo — dois sopros de sine descendo
    // (52→28 Hz), o segundo mais fraco e 0.3 s atrás do primeiro, um coração
    // a cada ~8-16 s. É o que a profecia do Kryptan manda: fundo e calado,
    // o coração bate. O terror da masmorra agora tem metrônomo irregular
    const heartG = AC.createGain();
    heartG.gain.value = 1;
    heartG.connect(ambGain);
    ambNodes.push(heartG);
    const heartBeat = (t, v) => {
      const o = AC.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(52, t);
      o.frequency.exponentialRampToValueAtTime(28, t + 0.45);
      const g = AC.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g);
      g.connect(heartG);
      o.start(t);
      o.stop(t + 1);
    };
    const heartTick = () => {
      if (!alive()) return;
      if (aguardaRodando(heartTick)) return;
      const t = AC.currentTime + 0.05;
      heartBeat(t, 0.03);
      heartBeat(t + 0.3, 0.02); // o dub do lub-dub: a sístole volta
      setTimeout(heartTick, 8000 + Math.random() * 8000);
    };
    setTimeout(heartTick, 4000 + Math.random() * 5000);

    // os sussurros: os calados por dentro falando de novo — o canon do
    // LORE em som. Noise branco em bandpass estreito de "boca" (a voz é
    // só ar: o filtro desliza como língua), cada sussurro 0.15-0.45 s,
    // em PAN aleatório (a voz vem de uma cela diferente a cada vez) e
    // volume baixo; em grupos de 1-3, um grupo a cada ~6-18 s. Sem
    // oscilador tonal: sussurro que afina é voz, sussurro de filtro é
    // conversa de pedra
    const whisperBuf = AC.createBuffer(1, Math.floor(AC.sampleRate * 3), AC.sampleRate);
    const wch = whisperBuf.getChannelData(0);
    for (let i = 0; i < wch.length; i++) wch[i] = Math.random() * 2 - 1;
    const whisperG = AC.createGain();
    whisperG.gain.value = 1;
    whisperG.connect(ambGain);
    ambNodes.push(whisperG);
    const whisperOnce = (t) => {
      const src = AC.createBufferSource();
      src.buffer = whisperBuf;
      src.loop = true;
      const bp = AC.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 5;
      bp.frequency.setValueAtTime(900 + Math.random() * 500, t);
      bp.frequency.setTargetAtTime(1200 + Math.random() * 1400, t + 0.08, 0.12); // a "boca" muda no meio
      const g = AC.createGain();
      const v = 0.012 + Math.random() * 0.008;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15 + Math.random() * 0.3);
      const pan = AC.createStereoPanner();
      pan.pan.value = (Math.random() * 2 - 1) * 0.6; // a cela de onde a voz volta
      src.connect(bp);
      bp.connect(g);
      g.connect(pan);
      pan.connect(whisperG);
      src.start(t);
      src.stop(t + 0.6);
    };
    const whisperTick = () => {
      if (!alive()) return;
      if (aguardaRodando(whisperTick)) return;
      const n = 1 + Math.floor(Math.random() * 3); // 1-3 vozes por visita
      const t = AC.currentTime + 0.05;
      for (let i = 0; i < n; i++) whisperOnce(t + i * (0.25 + Math.random() * 0.5));
      setTimeout(whisperTick, 6000 + Math.random() * 12000);
    };
    setTimeout(whisperTick, 5000 + Math.random() * 6000); // os primeiros sussurros cedo: o lugar apresenta os donos

    // o coro de baixo: acordes de longa forma pelo lado mais escuro do Dm
    // (Dm Bb Gm Am — sem C maior nenhuma: aqui não há clareza), dois coros
    // desafinados por nota; cada acorde incha em 6-9 s e se dissolve em
    // 7-12 s, um a cada ~25-42 s. A base harmônica da prisão: o lugar
    // responde de longe
    const coroG = AC.createGain();
    coroG.gain.value = 0.9;
    coroG.connect(ambGain);
    ambNodes.push(coroG);
    const COROS = [
      [38, 41, 45], // Dm: D2 F2 A2
      [34, 38, 41], // Bb: Bb1 D2 F2
      [31, 34, 38], // Gm: G1 Bb1 D2
      [33, 36, 40], // Am: A1 C2 E2
    ];
    let lastCoro = -1;
    const coroTick = () => {
      if (!alive()) return;
      if (aguardaRodando(coroTick)) return;
      let ci = Math.floor(Math.random() * COROS.length);
      if (ci === lastCoro) ci = (ci + 1) % COROS.length;
      lastCoro = ci;
      const t = AC.currentTime + 0.1;
      const sobe = 6 + Math.random() * 3;   // inchaço: 6-9 s
      const desce = 7 + Math.random() * 5;  // dissolução: 7-12 s
      const dur = sobe + desce;
      for (const m of COROS[ci]) {
        for (const cents of [-3.5, 3.5]) {
          const o = AC.createOscillator();
          o.type = 'triangle';
          o.frequency.value = mf(m);
          o.detune.value = cents;
          const g = AC.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.011, t + sobe);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
          o.connect(g);
          g.connect(coroG);
          o.start(t);
          o.stop(t + dur + 0.3);
        }
      }
      setTimeout(coroTick, (dur + 6 + Math.random() * 10) * 1000);
    };
    setTimeout(coroTick, 6000 + Math.random() * 7000); // o primeiro acorde demora a vir

    // o coro dos mortos: a assombração em nota — dois coros a SEGUNDA
    // MENOR de distância (F3/E3, D3/C#3, Bb2/A2), inchando juntos em 4-6 s
    // e se dissolvendo em 5-8 s, uma vez a cada ~40-80 s. Quem não tem
    // mais corpo afina errado: o batimento áspero da segunda menor é o
    // coro desafinado dos que não ficaram nem com ossos à vista
    const mortosG = AC.createGain();
    mortosG.gain.value = 1;
    mortosG.connect(ambGain);
    ambNodes.push(mortosG);
    const PARES = [
      [53, 52], // F3 + E3
      [50, 49], // D3 + C#3
      [46, 45], // Bb2 + A2
    ];
    let lastPar = -1;
    const mortosTick = () => {
      if (!alive()) return;
      if (aguardaRodando(mortosTick)) return;
      let pi = Math.floor(Math.random() * PARES.length);
      if (pi === lastPar) pi = (pi + 1) % PARES.length;
      lastPar = pi;
      const t = AC.currentTime + 0.1;
      const sobe = 4 + Math.random() * 2;  // inchaço: 4-6 s
      const desce = 5 + Math.random() * 3; // dissolução: 5-8 s
      const dur = sobe + desce;
      for (const m of PARES[pi]) {
        const o = AC.createOscillator();
        o.type = 'triangle';
        o.frequency.value = mf(m);
        const vib = AC.createOscillator();
        vib.frequency.value = 3.6 + Math.random() * 0.8; // vibrato lento: coro que balança
        const vibG = AC.createGain();
        vibG.gain.value = 9;
        vib.connect(vibG);
        vibG.connect(o.detune);
        const g = AC.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.014, t + sobe);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g);
        g.connect(mortosG);
        o.start(t);
        vib.start(t);
        o.stop(t + dur + 0.3);
        vib.stop(t + dur + 0.3);
      }
      setTimeout(mortosTick, (dur + 25 + Math.random() * 40) * 1000);
    };
    setTimeout(mortosTick, 30000 + Math.random() * 25000); // o primeiro coro dos mortos: só depois de a gente ter se acostumado com o sussurro

    // o lamento da cripta: a MELANCOLIA afundada — frases curtíssimas de
    // duas/três notas DESCENDENTES no registro grave (a tristeza aqui não
    // cai de cima como na fresta do térreo: afunda), voz de triângulo com
    // vibrato miúdo, eco comprido. Bem mais presente que antes — o
    // lamento é dos presos, não da pedra — mas ainda cala bastante
    const leadG = AC.createGain();
    leadG.gain.value = 0.9;
    leadG.connect(ambGain);
    ambNodes.push(leadG);
    const leadDly = AC.createDelay(2);
    leadDly.delayTime.value = 0.6;
    const leadFb = AC.createGain();
    leadFb.gain.value = 0.4;
    const leadWet = AC.createGain();
    leadWet.gain.value = 0.55;
    leadDly.connect(leadFb);
    leadFb.connect(leadDly);
    leadDly.connect(leadWet);
    leadWet.connect(leadG);
    ambNodes.push(leadDly, leadFb, leadWet);
    const FRASES = [
      [[50, 2.2], [48, 1.6], [46, 4.5]], // D3 C3 Bb2: a descida de meio tom
      [[53, 1.8], [50, 2.2], [45, 4.5]], // F3 D3 A2: a quinta que desaba
      [[45, 2.4], [43, 1.6], [38, 4.5]], // A2 G2 D2: morrendo na tônica
    ];
    let lastFr = -1;
    const leadTick = () => {
      if (!alive()) return;
      if (aguardaRodando(leadTick)) return;
      if (Math.random() < 0.3) {
        setTimeout(leadTick, 7000 + Math.random() * 11000); // a cripta cala
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
        const vib = AC.createOscillator();
        vib.frequency.value = 4.2 + Math.random() * 0.6;
        const vibG = AC.createGain();
        vibG.gain.value = 5.5; // ±5.5 cents: sopro, não sirene
        vib.connect(vibG);
        vibG.connect(o.detune);
        const g = AC.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.042, t + 0.6); // ataque lento: a nota afunda antes de existir
        g.gain.setValueAtTime(0.042, t + dur - 0.3);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.8);
        o.connect(g);
        g.connect(leadG);
        g.connect(leadDly);
        o.start(t);
        vib.start(t);
        o.stop(t + dur + 0.9);
        vib.stop(t + dur + 0.9);
        t += dur;
      }
      setTimeout(leadTick, (t - AC.currentTime) * 1000 + 3000 + Math.random() * 9000);
    };
    setTimeout(leadTick, 9000 + Math.random() * 8000); // o primeiro lamento depois de a gente já ter descido

    return { nodes: ambNodes, timers: [] }; // os schedulers se matam pelo alive()
  },
};
