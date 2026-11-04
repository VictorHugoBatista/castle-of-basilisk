//! Geração procedural dos 5 andares (salões, celas, canais imperiais),
//! becos de escombro e o BFS que ela usa para caçar/ouvir.

use crate::*;

// ================= geração procedural =================

pub(crate) fn set_room(r: usize, x0: i32, y0: i32, x1: i32, y1: i32) {
    unsafe {
        if r >= 16 { return; } // ROOMS: 16 salas no máximo — fora disso, dorme
        ROOMS[r * 4] = x0;
        ROOMS[r * 4 + 1] = y0;
        ROOMS[r * 4 + 2] = x1;
        ROOMS[r * 4 + 3] = y1;
    }
}
#[inline]
pub(crate) fn rget(r: usize, k: usize) -> i32 { unsafe { ROOMS[r * 4 + k] } }

pub(crate) fn carve_h(y: i32, x0: i32, x1: i32) {
    let (a, b) = if x0 <= x1 { (x0, x1) } else { (x1, x0) };
    for x in a..=b {
        if x > 0 && x < W() as i32 - 1 && y > 0 && y < H() as i32 - 1 {
            let i = idx(x as usize, y as usize);
            unsafe {
                if MAP[i] == T_WALL { MAP[i] = T_FLOOR; }
            }
        }
    }
}
pub(crate) fn carve_v(x: i32, y0: i32, y1: i32) {
    let (a, b) = if y0 <= y1 { (y0, y1) } else { (y1, y0) };
    for y in a..=b {
        if x > 0 && x < W() as i32 - 1 && y > 0 && y < H() as i32 - 1 {
            let i = idx(x as usize, y as usize);
            unsafe {
                if MAP[i] == T_WALL { MAP[i] = T_FLOOR; }
            }
        }
    }
}

pub(crate) fn rcenter(r: usize) -> (i32, i32) {
    ((rget(r, 0) + rget(r, 2)) / 2, (rget(r, 1) + rget(r, 3)) / 2)
}

// sala que contém o tile (-1 se corredor/livre)
pub(crate) fn room_of(x: i32, y: i32) -> i32 {
    unsafe {
        for r in 0..RN {
            if x >= rget(r, 0) && x <= rget(r, 2) && y >= rget(r, 1) && y <= rget(r, 3) {
                return r as i32;
            }
        }
    }
    -1
}

// alvo caminhável dentro da sala (o centro pode cair em pilar)
pub(crate) fn room_target(r: usize) -> (usize, usize) {
    unsafe {
        if r >= RN { return (W() / 2, H() / 2); }
        let (cx, cy) = rcenter(r);
        if walkable(cx, cy) { return (cx as usize, cy as usize); }
        for _ in 0..24 {
            let w = (rget(r, 2) - rget(r, 0) + 1) as usize;
            let h = (rget(r, 3) - rget(r, 1) + 1) as usize;
            let x = rget(r, 0) + rndn(w) as i32;
            let y = rget(r, 1) + rndn(h) as i32;
            if walkable(x, y) { return (x as usize, y as usize); }
        }
        (cx as usize, cy as usize)
    }
}

// próxima sala da patrulha: ela caça o RASTRO do jogador — sala que você
// visitou recentemente pesa muito no sorteio (o passado cheira), distância
// desempata. Daqui nasce o "entrei e ela acabou de sair". Nunca repete a
// sala que ela acabou de farejar (r == ROOMT é descartado).
pub(crate) fn pick_next_room() {
    unsafe {
        let rn = if RN > 0 { RN } else { 1 };
        let pr = room_of(PX as i32, PY as i32);
        let (rfx, rfy) = if pr >= 0 { rcenter(pr as usize) } else { (PX as i32, PY as i32) };
        let mut best: (i32, usize) = (i32::MIN, 0);
        let mut second: (i32, usize) = (i32::MIN, 0);
        for r in 0..rn {
            if r == ROOMT { continue; }
            if r as i32 == pr { continue; } // a sala onde você está AGORA não é sorteável
            let (cx, cy) = rcenter(r);
            let mut score = (cx - rfx).abs() + (cy - rfy).abs() + (rndn(7) as i32 - 3);
            // o cheiro do seu passado: sala visitada é ímã — mas com maturidade:
            // saiu agora? pouco interesse; foi há um tempo? muito interesse.
            for k in 0..6 {
                if PHIST[k] == r as i32 {
                    let ago = TICK - PHT[k];
                    let (w_recent, w_old) = trail_weights();
                    if ago >= 20 && ago < 140 { score += w_recent; }
                    else if ago >= 140 && ago < TRAIL_SCENT { score += w_old; }
                    break;
                }
            }
            if score > best.0 { second = best; best = (score, r); }
            else if score > second.0 { second = (score, r); }
        }
        ROOMT = if rn > 1 && rnd() % 4 == 0 && second.0 > i32::MIN { second.1 } else { best.1 };
        let (tx, ty) = room_target(ROOMT);
        RTX = tx;
        RTY = ty;
        PLOITER = 0;
    }
}

// o jogador muda de sala: grava no anel do rastro (ela fareja isso)
pub(crate) fn note_player_room() {
    unsafe {
        let r = room_of(PX as i32, PY as i32);
        if r < 0 { return; }
        if PHIST[PH_HEAD] == r && PHIST[PH_HEAD] != -1 { return; } // já é a anotada
        // só avança o anel em MUDANÇA de sala (evita reciclagem no mesmo lugar)
        let prev = if PH_HEAD == 0 { 5 } else { PH_HEAD - 1 };
        if PHIST[prev] == r { return; }
        PHIST[PH_HEAD] = r;
        PHT[PH_HEAD] = TICK;
        PH_HEAD = (PH_HEAD + 1) % 6;
    }
}

pub(crate) fn clear_player_trail() {
    unsafe {
        PHIST = [-1; 6];
        PHT = [0; 6];
        PH_HEAD = 0;
    }
}

// valida: partindo de '<', todas as salas e o objetivo ('>' ou '§') são alcançáveis
pub(crate) fn connectivity_ok(depth: u8) -> bool {
    unsafe {
        let mut up: usize = usize::MAX;
        for i in 0..N_MAX {
            if MAP[i] == T_UP { up = i; break; }
        }
        if up == usize::MAX { return false; }
        let (ux, uy) = (up % W(), up / W());
        bfs(ux, uy); // trata portas fechadas como abertas (abíveis)
        let need: u8 = if depth < FLOORS as u8 { T_DOWN } else { T_CROWN };
        for i in 0..N_MAX {
            if MAP[i] == need && DMAP[i] == 0xFFFF { return false; }
        }
        let rn = RN;
        for r in 0..rn {
            let (cx, cy) = rcenter(r);
            if DMAP[idx(cx as usize, cy as usize)] == 0xFFFF { return false; }
        }
        true
    }
}

pub(crate) fn gen_floor(depth: u8, seed: u32) {
    // regenera até o andar ser um grafo conectado (pilares podem selar corredores)
    let mut s = seed | 1;
    for _ in 0..10 {
        gen_once(depth, s);
        if connectivity_ok(depth) { return; }
        s = s.wrapping_mul(1664525).wrapping_add(1013904223) | 1;
    }
}

pub(crate) fn floor_dims(depth: u8) -> (usize, usize) {
    // térreo: o palácio de sempre. Masmorras: a ala de celas — maior que o
    // palácio, menor que a cloaca. Esgotos: a rede imperial, consideravelmente
    // maior — dois andares inteiros de cloaca para atravessar.
    if depth >= 4 { (W_MAX, H_MAX) } else if depth >= 2 { (W_BANK, H_BANK) } else { (W0, H0) }
}

pub(crate) fn gen_once(depth: u8, seed: u32) {
    unsafe {
        let (fw, fh) = floor_dims(depth);
        DIMW = fw;
        DIMH = fh;
        MAP = [T_WALL; N_MAX];
        RN = 0;
        repick();
        R32 = seed;
    }

    let th = theme(depth);

    // esgoto: canais imperiais (1-2 rios verticais) — declarados aqui: o
    // desenho do leito (desabamentos/funduras) vem depois do cave de salas
    let mut canals: [(i32, i32, i32, i32); 2] = [(0, 0, 0, 0), (0, 0, 0, 0)]; // (leito esquerdo, água, margem esq., margem dir.)
    let mut nc = 0usize;
    // ---- salas: cada tema tem seu caráter ----
    // castle: salões amplos de palácio · dungeon: celas pequenas e endurecidas
    // · sewer: bacias/cisternas grandes numa rede muito maior
    let (w_span, w_base, h_span, h_base, max_rooms, room_gap, door_pct, shadow_n,
         rub_quota, pil_min_w, pil_min_h, extra_loops, attempt_n) = match th {
        TH_CASTLE  => (6, 5, 4, 4, 13, 1, 4, 55, 1, 6, 4, 2, 240),
        TH_DUNGEON => (4, 3, 3, 2, 16, 2, 5, 75, 3, 7, 5, 2, 420),
        _          => (5, 6, 3, 4, 14, 2, 1, 60, 2, 6, 4, 4, 420),
    };
    // ---- posicionamento das salas: o palácio tem fase própria, o resto
    // mantém o sorteio de sempre ----
    if th == TH_CASTLE {
        // PALÁCIO: primeiro os GRANDES SALÕES (11-15 × 7-9, separados por um
        // fio de parede >= 2) — é neles que a colunata interna vai morar.
        // Depois, os CÔMODOS (3-6 × 3-4) nascem colados na parede de um salão,
        // com exatamente 1 tile de parede entre cômodo e salão: aí os gargalos
        // viram portas. Tudo o que vem depois (corredores de conexão, loops,
        // portas) é genérico — são eles que cercam os salões.
        let mut halls = 0usize;
        for _ in 0..400 {
            if halls >= 3 { break; }
            let w = (rndn(5) + 11) as i32;
            let h = (rndn(3) + 7) as i32;
            let x0 = (rndn(W() - w as usize - 2) + 1) as i32;
            let y0 = (rndn(H() - h as usize - 2) + 1) as i32;
            let x1 = x0 + w - 1;
            let y1 = y0 + h - 1;
            let mut ok = true;
            let n = unsafe { RN };
            for r in 0..n {
                if x0 <= rget(r, 2) + 2 && x1 + 2 >= rget(r, 0) &&
                   y0 <= rget(r, 3) + 2 && y1 + 2 >= rget(r, 1) { ok = false; break; }
            }
            if !ok { continue; }
            for y in y0..=y1 {
                for x in x0..=x1 {
                    unsafe { MAP[idx(x as usize, y as usize)] = T_FLOOR; }
                }
            }
            set_room(n, x0, y0, x1, y1);
            unsafe { RN += 1; }
            halls += 1;
        }
        // cômodos: pai sorteado SÓ ENTRE OS SALÕES (as primeiras `halls`
        // salas) — cômodo pendurado em cômodo viraria vecindário, não palácio
        for _ in 0..600 {
            let n = unsafe { RN };
            if n == 0 || n >= max_rooms { break; }
            let hr = rndn(halls); // pai = um dos salões
            let hw = (rget(hr, 2) - rget(hr, 0) + 1) as usize;
            let hh = (rget(hr, 3) - rget(hr, 1) + 1) as usize;
            let cw = rndn(4) + 3; // 3-6 de vão
            let ch = rndn(2) + 3; // 3-4 de fundura
            let mut ok = true;
            let mut x0 = 0i32;
            let mut y0 = 0i32;
            if hw >= cw && hh >= ch {
                match rndn(4) {
                    0 => { // à direita do salão
                        x0 = rget(hr, 2) + 2;
                        y0 = rget(hr, 1) + rndn(hh - ch + 1) as i32;
                        if x0 + cw as i32 - 1 > W() as i32 - 2 { ok = false; }
                    }
                    1 => { // à esquerda
                        x0 = rget(hr, 0) - 1 - cw as i32;
                        y0 = rget(hr, 1) + rndn(hh - ch + 1) as i32;
                        if x0 < 1 { ok = false; }
                    }
                    2 => { // abaixo
                        y0 = rget(hr, 3) + 2;
                        x0 = rget(hr, 0) + rndn(hw - cw + 1) as i32;
                        if y0 + ch as i32 - 1 > H() as i32 - 2 { ok = false; }
                    }
                    _ => { // acima
                        y0 = rget(hr, 1) - 1 - ch as i32;
                        x0 = rget(hr, 0) + rndn(hw - cw + 1) as i32;
                        if y0 < 1 { ok = false; }
                    }
                }
            } else { ok = false; }
            let x1 = x0 + cw as i32 - 1;
            let y1 = y0 + ch as i32 - 1;
            if ok {
                // qualquer sala já posta exige 1 parede de distância no mínimo;
                // o salão pai fica a exatamente 2 (1 tile de parede entre eles)
                for r in 0..n {
                    if x0 <= rget(r, 2) + 1 && x1 + 1 >= rget(r, 0) &&
                       y0 <= rget(r, 3) + 1 && y1 + 1 >= rget(r, 1) { ok = false; break; }
                }
            }
            if !ok { continue; }
            for y in y0..=y1 {
                for x in x0..=x1 {
                    unsafe { MAP[idx(x as usize, y as usize)] = T_FLOOR; }
                }
            }
            set_room(n, x0, y0, x1, y1);
            unsafe { RN += 1; }
        }
    } else if th == TH_DUNGEON {
        // ---- ALA DE CELAS: galerias de corredor largo (3 tiles) com celas de
        // 2x2 dos dois lados, na planta das prisões antigas: o corredor
        // central e as barras na altura dos olhos. Celas de quatro destinos:
        // TRANCADA (grade integral), ABERTA (portas, com os ossos), MEIA
        // (porta de um lado, barra do outro) ou LACRADA (maciço de rocha).
        // O corredor de serviço atinge as galerias nos vãos de rocha. ----
        // a ala (64x36) é MAIOR que o palácio (56x32), MENOR que a cloaca
        // (80x44): grupos e passos se leem das dims do andar, nunca fixos

        // vãos de rocha: grupos sem cela, 3-5 por andar (número SORTEADO) —
        // é neles que os corredores de serviço ligam as três galerias; o
        // quantas ligações e onde, nunca nasce duas vezes igual
        let groups = (W() - 6) / 3; // grupos de 3 colunas, margem 3 de cada lado
        let cend = 3 + groups as i32 * 3 - 2; // última coluna do corredor
        let mut links: u32 = 0; // bit g aceso = o grupo g é um vão de serviço
        let nl = 3 + rndn(3) as u32;
        let mut used = 0u32;
        let mut tries = 0u32;
        while used < nl && tries < 40 {
            tries += 1;
            let bit = 1u32 << rndn(groups);
            if links & bit == 0 { links |= bit; used += 1; }
        }

        // pass 1: os três corredores largos nasceram PRIMEIRO — as celas
        // preenchem o resto da tabela de salas, nunca antes deles
        for bi in 0..3usize {
            let by = 2 + bi as i32 * 11; // a galeria ocupa 9 rows, passo 11: 2-10 · 13-21 · 24-32
            let cy0 = by + 3;
            for y in cy0..=cy0 + 2 {
                for x in 3..=cend {
                    unsafe { MAP[idx(x as usize, y as usize)] = T_FLOOR; }
                }
            }
            set_room(unsafe { RN }, 3, cy0, cend, cy0 + 2);
            unsafe { RN += 1; }
        }
        // pass 2: celas — grupos de 3 colunas (2 de cela + 1 de parede)
        for bi in 0..3usize {
            let by = 2 + bi as i32 * 11;
            for gi in 0..groups {
                let gx = 3 + gi as i32 * 3;
                if links & (1u32 << gi) != 0 { continue; } // vão de rocha: corredor de serviço
                for side in 0..2usize {
                    let iy0 = if side == 0 { by } else { by + 7 };
                    let iy1 = iy0 + 1;
                    let frow = if side == 0 { by + 2 } else { by + 6 };
                    // o destino da cela, sorteado antes de escavar
                    let fate = rndn(20);
                    // TRANCADA — grade integral: luz passa, pés não, sempre
                    if fate < 9 {
                        for x in gx..=gx + 1 { unsafe { MAP[idx(x as usize, frow as usize)] = T_BARS; } }
                        for y in iy0..=iy1 { for x in gx..=gx + 1 { unsafe { MAP[idx(x as usize, y as usize)] = T_FLOOR; } } }
                    } else if fate < 17 {
                        // ABERTA (fate 9-13): portas na frente; MEIA (14-16):
                        // porta de um lado, barra do outro. As duas recebem
                        // ossos às vezes e contam como sala dela (quando RN
                        // cabe) — a patrulha entra nas celas abertas
                        if fate >= 14 {
                            unsafe {
                                MAP[idx(gx as usize, frow as usize)] = T_DOOR;
                                MAP[idx((gx + 1) as usize, frow as usize)] = T_BARS;
                            }
                        } else {
                            for x in gx..=gx + 1 { unsafe { MAP[idx(x as usize, frow as usize)] = T_DOOR; } }
                        }
                        for y in iy0..=iy1 { for x in gx..=gx + 1 { unsafe { MAP[idx(x as usize, y as usize)] = T_FLOOR; } } }
                        // os ossos de um infeliz anterior (abertas: 50%; meias: 1/3)
                        if rndn(2) == 0 || (fate >= 14 && rndn(3) == 0) {
                            let sx2 = gx + rndn(2) as i32;
                            let sy2 = iy0 + rndn(2) as i32;
                            let pi = idx(sx2 as usize, sy2 as usize);
                            if unsafe { MAP[pi] == T_FLOOR } { unsafe { MAP[pi] = T_SKULL; } }
                        }
                        if unsafe { RN } < 16 {
                            set_room(unsafe { RN }, gx, iy0, gx + 1, iy1);
                            unsafe { RN += 1; }
                        }
                    } // fate >= 17: LACRADA — nada: maciço de rocha na frente
                }
            }
        }
        // corredores de serviço: coluna vertical estreita atravessando os
        // vãos de rocha entre as galerias (do corredor de uma à outra)
        for g in 0..groups {
            if links & (1u32 << g) == 0 { continue; }
            let x = 3 + g as i32 * 3;
            carve_v(x, 5, 18);
            carve_v(x, 16, 29);
        }
    } else {
        // ---- CANAIS IMPERIAIS: 1-2 rios verticais de '=' correndo o andar de
        // cima a baixo — água de 1 (córrego fino) a 5 de largura, FLANQUEADA
        // por margens secas de alvenaria (1-2 de cada lado), os lados do leito
        // ondulando devagar (o rio não é régua). Posição à sorte, separados.
        // desabamentos/funduras e as cavernas-bacia veem mais adiante. ----
        nc = 1 + rndn(2) as usize;
        canals[0] = (4 + rndn(24) as i32, 1 + rndn(5) as i32, 1 + rndn(3) as i32, 1 + rndn(3) as i32);
        if nc == 2 { canals[1] = (45 + rndn(22) as i32, 1 + rndn(5) as i32, 1 + rndn(3) as i32, 1 + rndn(3) as i32); }
        for ci in 0..nc {
            let (sx, cw, bl, br) = canals[ci];
            let span = bl + cw + br;
            let mut d = 0i32; // a maré balança: margem de um lado engorda quando a do outro emagrece
            for y in 1..H() as i32 - 1 {
                if rndn(2) == 0 { d += if rndn(2) == 0 { 1 } else { -1 }; }
                if d < 1 - bl { d = 1 - bl; }
                if d > br - 1 { d = br - 1; }
                let wx = sx + bl + d; // água da linha: começa aqui
                for x in sx..sx + span {
                    unsafe {
                        MAP[idx(x as usize, y as usize)] =
                            if x >= wx && x < wx + cw { T_WATER } else { T_FLOOR };
                    }
                }
            }
        }
        // cavernas bizarras CORTANDO os canais: uma garantida por canal,
        // escavada seca sobre a água E as margens — o vão é a ponte de pedra
        for ci in 0..nc {
            let (sx, cw, bl, br) = canals[ci];
            if sx == 0 { continue; }
            let span = bl + cw + br;
            for _ in 0..8 {
                let h = (4 + rndn(3)) as i32;
                let mut x0 = sx - (1 + rndn(3) as i32);
                if x0 < 1 { x0 = 1; }
                let w = (sx + span - x0) + (2 + rndn(4) as i32); // cobre a galeria inteira + folga
                if x0 + w - 1 > W() as i32 - 2 { continue; }
                let y0 = 1 + rndn(H() as usize - 2 - h as usize) as i32;
                let mut ok = true;
                let n = unsafe { RN };
                for r in 0..n {
                    if x0 <= rget(r, 2) + 2 && x0 + w - 1 + 2 >= rget(r, 0) &&
                       y0 <= rget(r, 3) + 2 && y0 + h - 1 + 2 >= rget(r, 1) { ok = false; break; }
                }
                if !ok { continue; }
                for y in y0..y0 + h {
                    for x in x0..x0 + w {
                        unsafe { MAP[idx(x as usize, y as usize)] = T_FLOOR; }
                    }
                }
                set_room(unsafe { RN }, x0, y0, x0 + w - 1, y0 + h - 1);
                unsafe { RN += 1; }
                break; // um cortador por canal (o esgoto nunca fica sem ponte)
            }
        }
        // as bacias/cisternas bizarras de sempre preenchem o resto do andar —
        // mas FORA das galerias (margens incluídas): o rio não é cava de graça
        for _ in 0..attempt_n {
            if unsafe { RN } >= max_rooms { break; }
            let w = (rndn(w_span) + w_base) as i32;
            let h = (rndn(h_span) + h_base) as i32;
            let x0 = (rndn(W() - w as usize - 2) + 1) as i32;
            let y0 = (rndn(H() - h as usize - 2) + 1) as i32;
            let x1 = x0 + w - 1;
            let y1 = y0 + h - 1;
            // sobrepõe alguma galeria? a caverna não cava dentro do rio de graça
            let mut in_canal = false;
            for ci in 0..nc {
                let (cxs, cw, bl, br) = canals[ci];
                if cxs == 0 { continue; }
                if x0 <= cxs + cw + bl + br - 1 + room_gap && x1 + room_gap >= cxs { in_canal = true; break; }
            }
            if in_canal { continue; }
            let mut ok = true;
            let n = unsafe { RN };
            for r in 0..n {
                if x0 <= rget(r, 2) + room_gap && x1 + room_gap >= rget(r, 0) &&
                   y0 <= rget(r, 3) + room_gap && y1 + room_gap >= rget(r, 1) { ok = false; break; }
            }
            if !ok { continue; }
            for y in y0..=y1 {
                for x in x0..=x1 {
                    unsafe { MAP[idx(x as usize, y as usize)] = T_FLOOR; }
                }
            }
            set_room(n, x0, y0, x1, y1);
            unsafe { RN += 1; }
        }
    }

    let mut rn = unsafe { RN };
    if rn < 2 {
        // fallback: sala única gigante
        unsafe {
            MAP = [T_WALL; N_MAX];
            for y in 6..26 { for x in 8..48 { MAP[idx(x, y)] = T_FLOOR; } }
            set_room(0, 8, 6, 47, 25);
            set_room(1, 14, 10, 41, 21);
            RN = 2;
        }
        rn = 2;
    }

    // ---- corredores: liga cada sala não-conectada à mais próxima conectada
    // (a ala de celas se liga sozinha pelas escalas de serviço: pular) ----
    let mut linked: [bool; 16] = [false; 16];
    linked[0] = true;
    if th != TH_DUNGEON {
        loop {
        let mut best: (i32, usize, usize) = (i32::MAX, 0, 0);
        for a in 0..rn {
            if linked[a] { continue; }
            for b in 0..rn {
                if !linked[b] { continue; }
                let (ax, ay) = rcenter(a);
                let (bx, by) = rcenter(b);
                let c = (ax - bx).abs() + (ay - by).abs();
                if c < best.0 { best = (c, a, b); }
            }
        }
        if best.0 == i32::MAX { break; }
        let (ax, ay) = rcenter(best.1);
        let (bx, by) = rcenter(best.2);
        if rnd() & 1 == 1 {
            carve_h(ay, ax, bx);
            carve_v(bx, ay, by);
        } else {
            carve_v(ax, ay, by);
            carve_h(by, ax, bx);
        }
        linked[best.1] = true;
        }
    }

    // ---- corredores extras (loops de fuga) — o esgoto precisa de mais, é imenso ----
    if th != TH_DUNGEON {
        for _ in 0..extra_loops {
            let a = rndn(rn);
            let b = rndn(rn);
            if a == b { continue; }
            let (ax, ay) = rcenter(a);
            let (bx, by) = rcenter(b);
            if rnd() & 1 == 1 {
                carve_h(ay, ax, bx);
                carve_v(bx, ay, by);
            } else {
                carve_v(ax, ay, by);
                carve_h(by, ax, bx);
            }
        }
    }

    // ---- portas nos gargalos de corredor (a ala de celas tem as portas
    // dela expostas nas frentes — sem pinch genérico por cima) ----
    if th != TH_DUNGEON {
    for y in 1..H() - 1 {
        for x in 1..W() - 1 {
            let i = idx(x, y);
            if tile_at(x, y) != T_FLOOR { continue; }
            let u = tile_at(x, y - 1);
            let d = tile_at(x, y + 1);
            let l = tile_at(x - 1, y);
            let r = tile_at(x + 1, y);
            let pinch_v = u == T_WALL && d == T_WALL && l != T_WALL && r != T_WALL;
            let pinch_h = l == T_WALL && r == T_WALL && u != T_WALL && d != T_WALL;
            if (pinch_v || pinch_h) && rndn(5) < door_pct {
                unsafe { MAP[i] = T_DOOR; }
            }
        }
    }
    }

    // ---- pilares nas salas grandes ----
    for r in 0..rn {
        let (x0, y0, x1, y1) = (rget(r, 0), rget(r, 1), rget(r, 2), rget(r, 3));
        if x1 - x0 >= pil_min_w && y1 - y0 >= pil_min_h {
            for p in [(x0 + 2, y0 + 2), (x1 - 2, y0 + 2), (x0 + 2, y1 - 2), (x1 - 2, y1 - 2)] {
                unsafe {
                    let i = idx(p.0 as usize, p.1 as usize);
                    if MAP[i] == T_FLOOR { MAP[i] = T_PILLAR; }
                }
            }
            // palácio: nos salões, colunata interna — colunas a cada 3 tiles,
            // vãos de 2 para a vista atravessar e o medo rondar entre elas
            if th == TH_CASTLE {
                let mut px = x0 + 3;
                while px <= x1 - 3 {
                    let mut py = y0 + 3;
                    while py <= y1 - 3 {
                        unsafe {
                            let i = idx(px as usize, py as usize);
                            if MAP[i] == T_FLOOR { MAP[i] = T_PILLAR; }
                        }
                        py += 3;
                    }
                    px += 3;
                }
            }
        }
    }

    // ---- poças de sombra ----
    for _ in 0..shadow_n {
        let x = 1 + rndn(W() - 2);
        let y = 1 + rndn(H() - 2);
        unsafe {
            let i = idx(x, y);
            if MAP[i] == T_FLOOR { MAP[i] = T_SHADOW; }
        }
    }

    // ---- esgoto: DESABAMENTOS E FUNDURAS nos canais imperiais — pedra
    // derrubada fecha MARGEM E LEITO juntos (a galeria parte-se em pedaços,
    // religados pelas cavernas) e uns vãos afundam todos ('÷'): não se
    // passa. Só na galeria FORA de sala, para não comer cavernas ----
    if th == TH_SEWER && nc > 0 {
        for ci in 0..nc {
            let (cxs, cw, bl, br) = canals[ci];
            if cxs == 0 { continue; }
            let span = cw + bl + br;
            // desabamento: 0-2 por canal — a rocha cai em MONTINHO: bordas
            // escalonadas linha a linha (cada linha sela o leito DELA com
            // franjas a sorte) e cacos de '%' espalhados para fora
            let npl = rndn(3) as i32;
            for _ in 0..npl {
                let h = 2 + rndn(3) as i32; // altura do montinho 2-4
                let y0 = 2 + rndn(H() as usize - 3 - h as usize) as i32;
                let mut ok = true;
                for y in y0..y0 + h {
                    for x in cxs..cxs + span {
                        let t = unsafe { MAP[idx(x as usize, y as usize)] };
                        if t != T_WATER && t != T_FLOOR { ok = false; }
                        if room_of(x, y) >= 0 { ok = false; }
                    }
                }
                if !ok { continue; }
                // monte: cada linha sela o leito DELA (encontra a água que
                // meandrou nessa linha) com franjas de largura à sorte
                for k in 0..h {
                    let y = y0 + k;
                    let (mut a, mut b) = (i32::MAX, i32::MIN);
                    for x in cxs..cxs + span {
                        if unsafe { MAP[idx(x as usize, y as usize)] } == T_WATER {
                            if x < a { a = x; }
                            if x > b { b = x; }
                        }
                    }
                    if a > b { continue; }
                    let kL = 1 + rndn(3) as i32;
                    let kR = 1 + rndn(3) as i32;
                    for x in (a - kL)..=(b + kR) {
                        if x <= 0 || x >= W() as i32 - 1 { continue; }
                        unsafe { MAP[idx(x as usize, y as usize)] = T_WALL; }
                    }
                }
                // cacos: o desabamento joga pedra além do monte
                for _ in 0..(2 + rndn(4) as usize) {
                    let x = cxs - 1 + rndn((span + 2) as usize) as i32;
                    let y = y0 - 1 + rndn((h + 2) as usize) as i32;
                    if x < 1 || y < 1 || x >= W() as i32 - 1 || y >= H() as i32 - 1 { continue; }
                    let t = unsafe { MAP[idx(x as usize, y as usize)] };
                    if t == T_WATER || t == T_FLOOR {
                        unsafe { MAP[idx(x as usize, y as usize)] = T_RUBBLE; }
                    }
                }
            }
            // fundura: 1-2 trechos — a galeria INTEIRA afunda ('÷' na margem
            // também: a seca não dá por cima)
            let nd = 1 + rndn(2) as i32;
            for _ in 0..nd {
                let len = 2 + rndn(4) as i32; // 2-5 linhas fundas
                let y0 = 2 + rndn(H() as usize - 4 - len as usize) as i32;
                let mut ok = true;
                for y in y0..y0 + len {
                    for x in cxs..cxs + span {
                        let t = unsafe { MAP[idx(x as usize, y as usize)] };
                        if t != T_WATER && t != T_FLOOR { ok = false; }
                        if room_of(x, y) >= 0 { ok = false; }
                    }
                }
                if ok {
                    for y in y0..y0 + len {
                        for x in cxs..cxs + span {
                            unsafe { MAP[idx(x as usize, y as usize)] = T_DEEP; }
                        }
                    }
                }
            }
        }
    }

    // ---- masmorra funda (andar 3): perto dos canais, POÇAS RASAS varrem o
    // chão — o esgoto respira lá embaixo: encharcadas e frequentes, do
    // corredor largo ao fundo das celas. Glifo igual ao da água imperial,
    // mas rasa: maré nenhuma. Nascem em PISO, encharcam 3-8 tiles e acabam
    // onde o chão acaba ----
    if th == TH_DUNGEON && depth == 3 {
        for _ in 0..34 {
            let mut cx = (1 + rndn(W() - 2)) as i32;
            let mut cy = (1 + rndn(H() - 2)) as i32;
            let i0 = idx(cx as usize, cy as usize);
            if unsafe { MAP[i0] != T_FLOOR } { continue; }
            unsafe { MAP[i0] = T_SHALLOW; }
            let mut len = 2 + rndn(6) as i32; // poça de 3-8 tiles: rasas, não rios
            while len > 0 {
                let ndx: i32 = match rndn(4) { 0 => 1, 1 => -1, _ => 0 };
                let ndy = if ndx == 0 { if rndn(2) == 0 { 1 } else { -1 } } else { 0 };
                cx += ndx;
                cy += ndy;
                if cx < 1 || cy < 1 || cx >= W() as i32 - 1 || cy >= H() as i32 - 1 { break; }
                let i = idx(cx as usize, cy as usize);
                if unsafe { MAP[i] == T_FLOOR } {
                    unsafe { MAP[i] = T_SHALLOW; }
                    len -= 1;
                } else { break; } // a poça acaba onde o chão acaba
            }
        }
    }

    // ---- entrada '<' na sala 0 ----
    let (ex, ey) = rcenter(0);
    unsafe { MAP[idx(ex as usize, ey as usize)] = T_UP; }

    // ---- saída '>' (até o andar 4) ou coroa '§' com altar (andar 5: a Cloaca
    // Maxima profunda, onde o rei morto coroou-se a si mesmo) ----
    // ala de celas: a DESCIDA também é sorteada — galeria de 2º/3º andar à
    // sorte, coluna aleatória do corredor dela: nunca na galeria do '<',
    // nunca na mesma posição duas vezes
    let (dx, dy) = if th == TH_DUNGEON {
        let byl = 13 + (rndn(2) as i32) * 11; // galeria 2 (linhas 16-18) ou 3 (27-29)
        (4 + rndn(W() - 9) as i32, byl + 4) // meio do corredor dela, x sorteado
    } else {
        rcenter(rn - 1)
    };
    if depth < FLOORS as u8 {
        set_room_t(dx, dy, T_DOWN);
    } else {
        set_room_t(dx, dy, T_CROWN);
        for off in [(-2, 0i32), (2, 0), (0, -2), (0, 2), (-2, -2), (2, 2), (-2, 2), (2, -2)] {
            let tx = dx + off.0;
            let ty = dy + off.1;
            if tx > 0 && tx < W() as i32 - 1 && ty > 0 && ty < H() as i32 - 1 {
                unsafe {
                    let i = idx(tx as usize, ty as usize);
                    if MAP[i] == T_FLOOR { MAP[i] = T_PILLAR; }
                }
            }
        }
    }

    // ---- becos de escombro: esconderijos que ela não patrulha (por último:
    // escava só em parede, nunca conecta nem encolhe caminhos) ----
    dig_pockets(depth, rub_quota);
}

pub(crate) fn set_room_t(x: i32, y: i32, t: u8) {
    unsafe { MAP[idx(x as usize, y as usize)] = t; }
}

// ================= becos de escombro =================

// algo especial (<, >, §, outro escombro) perto demais do ponto (px,py)?
pub(crate) fn near_tile(px: i32, py: i32, lim: i32) -> bool {
    unsafe {
        for i in 0..N_MAX {
            let t = MAP[i];
            if t == T_UP || t == T_DOWN || t == T_CROWN || t == T_RUBBLE {
                let (ix, iy) = ((i % W()) as i32, (i / W()) as i32);
                if (ix - px).abs() + (iy - py).abs() <= lim { return true; }
            }
        }
    }
    false
}

// escava cavas de escombro fora das salas: uma fila reta de 2-4 tiles numa
// parede lateral de corredor. Regra de ouro da validação: cada tile do beco
// só pode vizinhar parede (ou o tile anterior do próprio beco) — becos são
// ONE-WAY por construção, então conectividade e rotas dela não mudam.
// append-only: só converte parede em escombro, nunca apaga chão.
pub(crate) fn dig_pockets(_depth: u8, quota: usize) {
    unsafe {
        let mut placed = 0usize;
        for _ in 0..260 {
            if placed >= quota { break; }
            let x = rndn(W() - 2) as i32 + 1;
            let y = rndn(H() - 2) as i32 + 1;
            let t0 = MAP[idx(x as usize, y as usize)];
            if t0 != T_FLOOR && t0 != T_SHADOW { continue; }        // só corredor
            if room_of(x, y) >= 0 { continue; }                     // fora de sala
            if near_tile(x, y, 6) { continue; }                     // longe de < > § %
            let dirs: [(i32, i32); 4] = [(0, -1), (0, 1), (-1, 0), (1, 0)];
            let di = rndn(4);
            for k in 0..4 {
                let (dx, dy) = dirs[(di + k) % 4];
                let len = 2 + rndn(3) as i32; // 2..4 fundo
                // validação: fila reta toda em parede, vizinhância lateral sólida
                let mut ok = true;
                let (mut tx, mut ty) = (x, y);
                let mut cells: [usize; 4] = [0; 4];
                for s in 0..len {
                    tx += dx; ty += dy;
                    if tx < 1 || ty < 1 || tx >= W() as i32 - 1 || ty >= H() as i32 - 1 { ok = false; break; }
                    let i = idx(tx as usize, ty as usize);
                    if MAP[i] != T_WALL { ok = false; break; }
                    // vizinhos além da linha do beco: só parede ou forro do mapa
                    for (nx, ny) in [(tx + 1, ty), (tx - 1, ty), (tx, ty + 1), (tx, ty - 1)] {
                        let is_line = (nx == tx - dx && ny == ty - dy) || (nx == x && ny == y);
                        if is_line { continue; }
                        if nx < 0 || ny < 0 || nx >= W() as i32 || ny >= H() as i32 { continue; }
                        let nt = tile_at(nx as usize, ny as usize);
                        if nt != T_WALL { ok = false; break; }
                    }
                    if !ok { break; }
                    cells[s as usize] = i;
                }
                if !ok { continue; }
                for s in 0..len { MAP[cells[s as usize]] = T_RUBBLE; }
                placed += 1;
                break;
            }
        }
    }
}

// ================= BFS (caça) =================

// BFS com campo de distância, origem em (tx,ty). rubble_ok=false: caminho "de
// ela" evitando escombros; true: terreno do jogador (conectividade/audição).
pub(crate) fn bfs_impl(tx: usize, ty: usize, rubble_ok: bool) {
    unsafe {
        DMAP = [0xFFFF_u16; N_MAX];
        let src_ok = if rubble_ok { walkable(tx as i32, ty as i32) } else { bas_walkable(tx as i32, ty as i32) };
        if !src_ok { return; }
        let start = idx(tx, ty);
        let mut qh = 0usize;
        let mut qt = 1usize;
        DMAP[start] = 0;
        QUEUE[0] = start as u16;
        while qh < qt {
            let c = QUEUE[qh] as usize;
            qh += 1;
            let d = DMAP[c] + 1;
            let cx = c % W();
            let cy = c / W();
            for (nx, ny) in [(cx + 1, cy), (cx.wrapping_sub(1), cy), (cx, cy + 1), (cx, cy.wrapping_sub(1))] {
                if nx >= W() || ny >= H() { continue; }
                let ni = idx(nx, ny);
                if DMAP[ni] <= d { continue; }
                let ok = if rubble_ok { walkable(nx as i32, ny as i32) } else { bas_walkable(nx as i32, ny as i32) };
                if !ok { continue; }
                DMAP[ni] = d;
                if qt < N_MAX { QUEUE[qt] = ni as u16; qt += 1; }
            }
        }
    }
}

pub(crate) fn bfs(tx: usize, ty: usize) { bfs_impl(tx, ty, true); }
