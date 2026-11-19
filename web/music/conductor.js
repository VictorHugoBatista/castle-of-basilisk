// music/conductor.js — O MAESTRO das trilhas: registro de músicas, fade das
// velhas e a geração que mata correntes de scheduler velhas. game.js só
// mapeia estado de jogo → id e chama setMusic(); NENHUMA receita musical
// mora aqui. Trilha nova = arquivo em music/track-*.js + uma linha no
// TRACKS abaixo (+ o ponto de chamada no glue).
import { trackTitulo } from './track-titulo.js?v=10'; // ?v= versionado junto: mudou a trilha, bumpa aqui e nos imports do glue
import { trackAbertura } from './track-abertura.js?v=10';

const TRACKS = { titulo: trackTitulo, abertura: trackAbertura };

let ctx = null;
let buses = null;
let current = null; // id da trilha vigente (null = silêncio de propósito)
let gen = 0; // geração: correntes de scheduler da trilha velha morrem nela
let nodes = []; // nós vivos da trilha vigente: o fade mata todos junto
let timers = []; // timers explícitos da trilha vigente (além dos schedulers que se matam pelo alive)

// alive() da trilha vigente: os schedulers consultam a cada passada e se
// matam sozinhos quando a trilha perde o posto (mesma semântica do musicGen
// que o glue usava antes da separação)
function makeAlive(id, myGen) {
  return () => current === id && gen === myGen && !!ctx;
}

// UMA vez, dentro do audioOn() do glue: o castelo acorda no primeiro gesto
export function initMusic(audioCtx, audioBuses) {
  ctx = audioCtx;
  buses = audioBuses;
}

// troca de trilha: velha morre no fade (0.4 s de alvo, stop @1600 ms — os
// mesmos números do glue), nova arranca; id === current sem force não
// recomeça (menus atravessam tela sem recomeçar), null silencia.
// id fora do TRACKS falha ALTO e silencia: fingir trilha tocando
// (current=id mudo) prenderia o retry num early-return para sempre
export function setMusic(id, force) {
  if (!ctx) return;
  if (id && !TRACKS[id]) {
    console.warn('[music] trilha "' + id + '" não está no TRACKS — silêncio. (trilha nova = arquivo em music/ + 1 linha no TRACKS)');
    id = null;
  }
  if (id === current && !force) return;
  const now = ctx.currentTime;
  for (const n of nodes) {
    try { n.gain.setTargetAtTime(0, now, 0.4); } catch (e) {}
    setTimeout(() => { try { n.stop ? n.stop() : n.disconnect(); } catch (e) {} }, 1600);
  }
  for (const t of timers) clearTimeout(t);
  nodes = [];
  timers = [];
  gen++; // correntes da trilha velha morrem na próxima passada do alive()
  current = id;
  if (id) {
    const handle = TRACKS[id].start(ctx, buses, makeAlive(id, gen));
    nodes = handle.nodes;
    timers = handle.timers || []; // trilha sem timers: os schedulers se matam pelo alive()
  }
}
