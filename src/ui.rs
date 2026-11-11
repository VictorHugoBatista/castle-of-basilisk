//! Saída visual: barra de UI, FOV e render (grid, telas título/controles/
//! morte/vitória e render de alucinações).

use crate::*;

// ================= barra de UI =================

// a dica contextual mora na ÚLTIMA LINHA DA TELA (não do mapa): com a câmera
// do esgoto, a linha de baixo do mapa nem sempre está visível.
#[inline]
pub(crate) fn put_ui(x: usize, ch: u8, a: u8) {
    if x < W0 {
        let i = x * 2;
        unsafe { UIROW[i] = ch; UIROW[i + 1] = a; }
    }
}

// write_center para a barra de UI (mesma regra de glifos). Zera a barra
// inteira antes de escrever: os tiles fora da mensagem são SEMPRE vazio —
// sem isso, sobras de dicas anteriores (run passada ou alerta mais longo)
// ficam fantasiando a barra para sempre ('AUM TOQUE... ESCONDA0').
pub(crate) fn write_ui_center(s: &str, a: u8) {
    unsafe { UIROW.fill(0); }
    let n = s.chars().count();
    let x = if n >= W0 { 0 } else { (W0 - n) / 2 };
    for (k, c) in s.chars().enumerate() {
        let ch = if c == '\u{B7}' { 0xB7 } else if c.is_ascii() { c as u8 } else { b'?' };
        put_ui(x + k, ch, a);
    }
}

// glifo único na barra de UI (nome do andar, sem centralizar) — usado pelo
// anúncio de tema ao entrar num piso
// a barra tem W0 células: dica mais longa que 54 perde o CENTER do
// inteiro ((W0-n)/2 = 0 nasce esquerda) e acima de 56 esbarra no corte
// silencioso do put_ui — travado EM COMPILE-TIME (o bug real: 'O
// FRAGMENTO PULSA...' com 57 chars, a dica nascia esquerda e sem o 'A'
// do ESTA)
const _: () = assert!("O MISTERIOSO FRAGMENTO PULSA".len() <= 54);
const _: () = assert!("A COROA E SUA. ELA TEM FOME. FUJA PELO '<' NO TERREO".len() <= 54);
#[allow(dead_code)]
#[inline]
pub(crate) fn put_ui_str(x: usize, s: &str, a: u8) {
    for (k, c) in s.chars().enumerate() {
        let ch = if c == '\u{B7}' { 0xB7 } else if c.is_ascii() { c as u8 } else { b'?' };
        put_ui(x + k, ch, a);
    }
}

// ================= FOV =================

pub(crate) fn compute_fov() {
    unsafe {
        VIS = [0; N_MAX];
        // pânico (nível 3): o mundo ENCOLHE — raio de visão 6 em vez de 8
        let rr: i32 = if fear_level() >= 3 { 6 } else { 8 };
        let y0 = PY.saturating_sub(rr as usize);
        let y1 = (PY + rr as usize).min(H() - 1);
        let x0 = PX.saturating_sub(rr as usize);
        let x1 = (PX + rr as usize).min(W() - 1);
        for y in y0..=y1 {
            for x in x0..=x1 {
                let ddx = x as i32 - PX as i32;
                let ddy = y as i32 - PY as i32;
                let d2 = ddx * ddx + ddy * ddy;
                let r2: i32 = if tile_at(x, y) == T_SHADOW { 16 } else { rr * rr };
                if d2 > r2 { continue; }
                if los(PX, PY, x, y) {
                    let i = idx(x, y);
                    VIS[i] = 1;
                    SEEN[(DEPTH as usize - 1) * N_MAX + i] = 1;
                }
            }
        }
    }
}

// ================= render =================

#[inline]
pub(crate) fn put(x: usize, y: usize, ch: u8, a: u8) {
    if x < W() && y < H() {
        let i = idx(x, y) * 2;
        unsafe { GRID[i] = ch; GRID[i + 1] = a; }
    }
}
#[inline]
pub(crate) fn clear_cell(x: usize, y: usize, a: u8) { put(x, y, b' ', a); }

pub(crate) fn write_str(x: usize, y: usize, s: &str, a: u8) {
    for (k, c) in s.chars().enumerate() {
        // '·' (U+00B7) vira o byte 0xB7 — o JS renderiza fromCharCode(0xB7) = '·'
        let ch = if c == '\u{B7}' { 0xB7 } else if c.is_ascii() { c as u8 } else { b'?' };
        put(x + k, y, ch, a);
    }
}
pub(crate) fn write_center(y: usize, s: &str, a: u8) {
    let n = s.chars().count();
    let x = if n >= W() { 0 } else { (W() - n) / 2 };
    write_str(x, y, s, a);
}

// arte multilinha centralizada: TODAS as linhas no mesmo x — o alinhamento
// interno vem dos espaços à esquerda de cada literal (nunca torto).
pub(crate) fn write_block_center(y0: usize, rows: &[&str], a: u8) {
    let maxlen = rows.iter().map(|r| r.len()).max().unwrap_or(0);
    let x0 = if maxlen >= W() { 0 } else { (W() - maxlen) / 2 };
    for (k, r) in rows.iter().enumerate() {
        write_str(x0, y0 + k, r, a);
    }
}

const FONT5: [[&str; 5]; 26] = [
    /*A*/ ["#####", "#...#", "#####", "#...#", "#...#"],
    /*B*/ ["####.", "#...#", "####.", "#...#", "####."],
    /*C*/ ["#####", "#....", "#....", "#....", "#####"],
    /*D*/ ["####.", "#...#", "#...#", "#...#", "####."],
    /*E*/ ["#####", "#....", "####.", "#....", "#####"],
    /*F*/ ["#####", "#....", "####.", "#....", "#...."],
    /*G*/ ["#####", "#....", "#..##", "#...#", "#####"],
    /*H*/ ["#...#", "#...#", "#####", "#...#", "#...#"],
    /*I*/ ["#####", "..#..", "..#..", "..#..", "#####"],
    /*J*/ ["..###", "...#.", "...#.", "#..#.", ".##.."],
    /*K*/ ["#..#.", "#.#..", "##...", "#.#..", "#..#."],
    /*L*/ ["#....", "#....", "#....", "#....", "#####"],
    /*M*/ ["#...#", "##.##", "#.#.#", "#...#", "#...#"],
    /*N*/ ["#...#", "##..#", "#.#.#", "#..##", "#...#"],
    /*O*/ ["#####", "#...#", "#...#", "#...#", "#####"],
    /*P*/ ["#####", "#...#", "#####", "#....", "#...."],
    /*Q*/ ["#####", "#...#", "#...#", "#..#.", ".##.#"],
    /*R*/ ["#####", "#...#", "####.", "#..#.", "#...#"],
    /*S*/ ["#####", "#....", "#####", "....#", "#####"],
    /*T*/ ["#####", "..#..", "..#..", "..#..", "..#.."],
    /*U*/ ["#...#", "#...#", "#...#", "#...#", "#####"],
    /*V*/ ["#...#", "#...#", "#...#", ".#.#.", "..#.."],
    /*W*/ ["#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
    /*X*/ ["#...#", ".#.#.", "..#..", ".#.#.", "#...#"],
    /*Y*/ ["#...#", ".#.#.", "..#..", "..#..", "..#.."],
    /*Z*/ ["#####", "...#.", "..#..", ".#...", "#####"],
];

pub(crate) fn write_big(x: usize, y: usize, s: &str, a: u8) {
    let mut cx = x;
    for chb in s.bytes() {
        if chb == b' ' {
            // espaço: avança uma coluna de glifo sem desenhar nada
            cx += 6;
            continue;
        }
        let g = &FONT5[(chb as usize).wrapping_sub(b'A' as usize).min(25)];
        for r in 0..5 {
            for c in 0..5 {
                if g[r].as_bytes()[c] == b'#' { put(cx + c, y + r, b'#', a); }
            }
        }
        cx += 6;
    }
}

// glifos FONT5 centralizados horizontalmente
pub(crate) fn write_big_center(y: usize, s: &str, a: u8) {
    let width = s.chars().count() * 6 - 1; // cada glifo avança 6; o ultimo não usa o espaçador
    if width >= W() { write_big(0, y, s, a); return; }
    write_big((W() - width) / 2, y, s, a);
}

// ================= fonte DENTE (a boca da logo) =================
// glifos 5x6: cada letra É um dente. Na fileira de CIMA (dente_cima) a letra
// pende da gengiva — borda de cima reta, a de baixo afina em dente; o T e o
// F nascem PRESAS (a haste afina em ponta única). Na fileira de BAIXO
// (dente_sobe) a letra ergue do chão — ponta em cima, base apoiada embaixo.
// Só as letras que as duas palavras usam existem; o '_' cobre o resto com
// um bloco (nunca deve ocorrer: as strings são fixas).
fn dente_cima(c: u8) -> &'static [&'static str; 6] {
    match c {
        b'A' => &["#####", "#...#", "#####", "#...#", ".#.#.", "..#.."],
        b'C' => &[".####", "#....", "#....", "#....", "#....", ".###."],
        b'E' => &["#####", "#....", "####.", "#....", "#....", "####."],
        b'F' => &["#####", "#....", "####.", "#....", "##...", ".#..."],
        b'L' => &["#....", "#....", "#....", "#....", "##...", ".###."],
        b'O' => &["#####", "#...#", "#...#", "#...#", "#...#", ".###."],
        b'S' => &[".####", "#....", ".###.", "....#", "....#", "####."],
        b'T' => &["#####", ".###.", ".###.", "..#..", "..#..", "..#.."],
        _ => &["#####", "#####", "#####", "#####", "#####", "#####"],
    }
}
fn dente_sobe(c: u8) -> &'static [&'static str; 6] {
    match c {
        b'A' => &["..#..", ".#.#.", "#...#", "#####", "#...#", "#...#"],
        b'B' => &[".###.", "#...#", "#...#", "####.", "#...#", "####."],
        b'I' => &["..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
        b'K' => &["#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
        b'L' => &[".#...", "##...", "##...", "##...", "##...", "####."],
        // o S ergue EM PÉ: espelhado, o ziguezague inverte a leitura e o
        // dente vira um Z (BAZILISK) — de pé ele continua dente e lera
        b'S' => &[".####", "#....", ".###.", "....#", "....#", "####."],
        _ => &["#####", "#####", "#####", "#####", "#####", "#####"],
    }
}

// a fonte dente desenhada na tela: mesmo contrato do write_big (avanço de 6
// por glifo, sem alocação) com glifos de 6 linhas
pub(crate) fn write_dente(x: usize, y: usize, s: &str, a: u8, sobe: bool) {
    let mut cx = x;
    for chb in s.bytes() {
        if chb == b' ' {
            cx += 6;
            continue;
        }
        let g = if sobe { dente_sobe(chb) } else { dente_cima(chb) };
        for r in 0..6 {
            for c in 0..5 {
                if g[r].as_bytes()[c] == b'#' { put(cx + c, y + r, b'#', a); }
            }
        }
        cx += 6;
    }
}

// glifos dente centralizados horizontalmente (mesma conta do write_big_center)
pub(crate) fn write_dente_center(y: usize, s: &str, a: u8, sobe: bool) {
    let width = s.chars().count() * 6 - 1;
    if width >= W() { write_dente(0, y, s, a, sobe); return; }
    write_dente((W() - width) / 2, y, s, a, sobe);
}

pub(crate) fn attr_of(t: u8) -> u8 {
    match t {
        T_FLOOR => A_FLOOR,
        T_WALL => A_WALL,
        T_SHADOW => A_SHADOW,
        T_DOOR => A_DOOR,
        T_DOWN | T_UP => A_STAIR,
        T_CROWN | T_SHARD => A_CROWN, // '§' e '¤': a MESMA matéria (o brilho é igual, o glifo é o que distingue)
        T_PILLAR => A_WALL,
        T_RUBBLE => A_RUBBLE,
        T_WATER | T_SHALLOW => A_WATER,
        T_BARS => A_WALL,
        T_SKULL | T_CORPSE => A_RUBBLE, // '¥'/'¶': osso e carne do acervo, cor de osso
        _ => A_FLOOR,
    }
}

pub(crate) fn render() {
    unsafe {
        let st = STATE;
        // Telas de UI (título/controles/morte/vitoria) sao compostas SEMPRE no
        // viewport padrao 56x32 — senao morrer num andar largo (esgoto 80x44)
        // rasgava a tela de morte: o JS fora de jogo le o grid como 56 colunas.
        if st != ST_PLAY && (DIMW != W0 || DIMH != H0) {
            DIMW = W0;
            DIMH = H0;
        }
        // fundo
        for y in 0..H() {
            for x in 0..W() {
                let i = idx(x, y);
                if st == ST_PLAY {
                    if SEEN[(DEPTH as usize - 1) * N_MAX + i] == 1 {
                        let t = MAP[i];
                        let a = attr_of(t) | if VIS[i] == 1 { 0 } else { DIM };
                        put(x, y, t, a);
                    } else {
                        clear_cell(x, y, A_VOID);
                    }
                } else {
                    clear_cell(x, y, A_VOID);
                }
            }
        }

        if st == ST_PLAY {
            // corpo (rastro de escamas): só o que você CONSEGUE ver dela
            let blen = BODYBUF[0] as usize;
            for k in 0..blen {
                let sx = BODYBUF[k * 2 + 1] as usize;
                let sy = BODYBUF[k * 2 + 2] as usize;
                if sx == BX && sy == BY { continue; }
                let i = idx(sx, sy);
                if VIS[i] == 1 && cheb(sx, sy, PX, PY) <= 14 {
                    put(sx, sy, b'~', A_BODY);
                }
            }
            // cabeça (só o que você CONSEGUE ver)
            let bi = idx(BX, BY);
            if VIS[bi] == 1 {
                let d = cheb(BX, BY, PX, PY);
                if d <= 14 { put(BX, BY, b'B', A_BAS); }
            }
            put(PX, PY, b'@', A_PLAYER);

            // ---- medo: as mentiras do RT (nunca no MAP/SEEN: só no render) ----
            render_phantoms();

            // dica contextual
            let msg: &str = if CROWN {
                "A COROA E SUA. ELA TEM FOME. FUJA PELO '<' NO TERREO"
            } else if SHARD {
                "O MISTERIOSO FRAGMENTO PULSA"
            } else if tile_at(PX, PY) == T_RUBBLE {
                "ESCOMBROS. ELA NAO PATRULHA AQUI. NAO FAC BARULHO"
            } else if BST == B_HUNT {
                "ELA TE VIU. CORRA. QUEBRE A LINHA DE VISAO"
            } else if BST == B_INVEST {
                "ELA OUVIU ALGO. IMOBILIZA-SE. SE ESCONDA"
            } else if TICK < 90 && DEPTH == 1 {
                "ALGO RONDA O CASTELO. NUNCA OLHE PARA ELE"
            } else {
                "UM TOQUE MATA. UM OLHAR MATA. SE ESCONDA"
            };
            // chegada num andar novo: o NOME do lugar fala por uns ticks;
            // depois a dica contextual toma a barra
            if TICK - ARRIV < 18 {
                write_ui_center(floor_name(DEPTH), A_TITLE);
            } else {
                write_ui_center(msg, if BST == B_HUNT { A_ALERT } else { A_UI });
            }
        } else if st == ST_TITLE {
            render_title();
        } else if st == ST_CONTROLS {
            render_controls();
        } else if st == ST_SELECT {
            render_select();
        } else if st == ST_DEAD {
            render_dead();
        } else {
            render_win();
        }
        diff_pass(); // o diff acompanha TODA composição (jogo e telas de UI)
    }
}

// as alucinações desenham por ÚLTIMO (sobre a memória do mapa). Fantasmas
// vivem no "lembrado": fora do VIS, escurecem como qualquer tile 0x80.
// Falso B desenha só quando VISÍVEL — exatamente como o real se esconde.
pub(crate) fn render_phantoms() {
    unsafe {
        for k in 0..4 {
            if !PH_ON[k] { continue; }
            let (x, y) = (PH_X[k] as usize, PH_Y[k] as usize);
            if tile_at(x, y) == T_WALL || tile_at(x, y) == T_PILLAR { continue; } // parede sólida engole
            let i = idx(x, y);
            let mut a = A_GHOST;
            if VIS[i] != 1 { a |= DIM; }          // na memória: dim
            if PH_FADE[k] > 0 { a |= DIM; }        // evaporando: dim duplo do JS (shade)
            put(x, y, b'o', a);
        }
        if FB_ON && VIS[idx(FB_X, FB_Y)] == 1 {
            let a = if FB_FADE > 0 { A_BAS | DIM } else { A_BAS };
            put(FB_X, FB_Y, b'B', a);
        }
        if PC_ON && SEEN[(DEPTH as usize - 1) * N_MAX + idx(PC_X, PC_Y)] == 1 {
            let i = idx(PC_X, PC_Y);
            let mut a = A_CROWN;
            if VIS[i] != 1 { a |= DIM; }
            if PC_FADE > 0 { a |= DIM; }
            put(PC_X, PC_Y, T_CROWN, a);
        }
    }
}

pub(crate) fn render_title() {
    // moldura
    for x in 0..W() {
        put(x, 0, b'-', A_TITLE);
        put(x, H() - 2, b'-', A_TITLE);
    }
    for y in 0..H() {
        put(0, y, b'|', A_TITLE);
        put(W() - 1, y, b'|', A_TITLE);
    }
    put(0, 0, b'+', A_TITLE);
    put(W() - 1, 0, b'+', A_TITLE);
    put(0, H() - 2, b'+', A_TITLE);
    put(W() - 1, H() - 2, b'+', A_TITLE);

    // A LOGO: a boca dela. As letras SÃO os dentes, na fonte dente (5x6): a
    // fileira de cima PENDE da gengiva — borda reta em cima, afilando em
    // dente embaixo; o T e o F nascem PRESAS (a haste afina em ponta). A de
    // baixo ERGUE do chão do escuro — ponta em cima, base apoiada embaixo.
    // Os dois olhos vermelhos (o mesmo A_BAS do B em jogo) moram nos VÃOS
    // dos dentes de cima: o primeiro no vão entre o A e o S, o segundo no
    // vão entre o espaço e o O (cada glifo avança 6 colunas; o vão entre o
    // glifo k e o k+1 nasce em xc + (k+1)*6 - 1).
    let wc = "CASTLE OF".chars().count() * 6 - 1;
    let xc = (W() - wc) / 2;
    let ea = xc + 2 * 6 - 1; // olho 1: o vão entre o A e o S
    let eb = xc + 7 * 6 - 1; // olho 2: o vão entre o espaço e o O
    for r in 0..2 {
        for c in 0..2 {
            put(ea + c, 2 + r, b'#', A_BAS);
            put(eb + c, 2 + r, b'#', A_BAS);
        }
    }
    // a luz dos olhos escorre (dim)
    put(ea, 4, b'~', A_BAS | DIM);
    put(ea + 1, 4, b'~', A_BAS | DIM);
    put(eb, 4, b'~', A_BAS | DIM);
    put(eb + 1, 4, b'~', A_BAS | DIM);

    // dentes de cima: a palavra pende da gengiva
    write_dente_center(5, "CASTLE OF", A_TITLE, false);
    // o veneno pinga no escuro da goela
    put(W() / 2 - 20, 11, 0xB7, A_BAS | DIM);
    put(W() / 2 - 1, 11, 0xB7, A_BAS | DIM);
    put(W() / 2 + 17, 11, 0xB7, A_BAS | DIM);
    put(W() / 2 - 10, 12, 0xB7, A_BAS | DIM);
    put(W() / 2 + 8, 12, 0xB7, A_BAS | DIM);
    // dentes de baixo: a palavra ergue do chão do escuro — na MESMA cor do
    // título (ambar, sem vida): o vermelho é só dos olhos, que são os únicos
    // a respirar na boca
    write_dente_center(13, "BASILISK", A_TITLE, true);

    write_center(20, "um conceito de survival horror", A_UI);
    write_center(21, "nao existe vida. nao existe ouro. existe a besta.", A_UI);
    write_center(22, "esconda-se. nunca olhe para ela.", A_UI);

    // menu centralizado: a opcao com cursor fica em ambar (A_TITLE).
    // SEM alocacao: format! cresceria a memoria do wasm e desanexava as views do JS.
    unsafe {
        let items = [("INICIAR", 24), ("CONTROLES", 26)];
        for (k, (label, y)) in items.iter().enumerate() {
            let sel = MENU_SEL == k as u8;
            let a = if sel { A_TITLE } else { A_UI };
            let n = label.chars().count();
            let x = (W() - n) / 2;
            write_str(x, *y, label, a);
            if sel {
                write_str(x - 2, *y, "> ", a);
                write_str(x + n + 1, *y, "<", a);
            }
        }
    }

    write_center(28, "W/S ou setas escolhem · ENTER confirma", A_UI);
}

pub(crate) fn render_controls() {
    // moldura (igual ao titulo, em ambar)
    for x in 0..W() {
        put(x, 0, b'-', A_TITLE);
        put(x, H() - 2, b'-', A_TITLE);
    }
    for y in 0..H() {
        put(0, y, b'|', A_TITLE);
        put(W() - 1, y, b'|', A_TITLE);
    }
    put(0, 0, b'+', A_TITLE);
    put(W() - 1, 0, b'+', A_TITLE);
    put(0, H() - 2, b'+', A_TITLE);
    put(W() - 1, H() - 2, b'+', A_TITLE);

    // cabeçalho grande
    write_big_center(1, "CONTROLES", A_TITLE);

    // escolha do esquema de teclas (alternavel com A/D ou esquerda/direita)
    unsafe {
        write_center(8, "ESCOLHA COMO VOCE VAI ANDAR:", A_UI);
        let wasd_on = SCHEME == 0;
        write_str(15, 10, "WASD", if wasd_on { A_TITLE } else { A_UI });
        write_str(31, 10, "SETAS", if wasd_on { A_UI } else { A_TITLE });
        if wasd_on {
            write_str(13, 10, ">", A_TITLE);
            write_str(20, 10, "<", A_TITLE);
        } else {
            write_str(29, 10, ">", A_TITLE);
            write_str(37, 10, "<", A_TITLE);
        }
        write_center(12, "A/D ou esquerda/direita alternam", A_UI);

        // tabela de comandos: coluna fixa — o modo escolhido ganha ambar (A_TITLE)
        cmd_row(15, "mover", "WASD  /  SETAS");
        cmd_row(16, "esperar", "ESPACO");
        cmd_row(17, "calar-se", "SHIFT");
        cmd_row(18, "correr", "X      /      K");
        cmd_row(19, "portais < e >", "andar sobre eles");
        if wasd_on {
            write_str(31, 15, "WASD", A_TITLE);
            write_str(31, 18, "X", A_TITLE);
            write_str(45, 18, "K", A_TITLE);
        } else {
            write_str(40, 15, "SETAS", A_TITLE);
            write_str(31, 18, "X", A_TITLE);
            write_str(45, 18, "K", A_TITLE);
        }
    }

    write_center(22, "os dois esquemas de mover e as duas", A_UI);
    write_center(23, "teclas de correr funcionam sempre;", A_UI);
    write_center(24, "o modo so registra sua preferencia.", A_UI);

    // piscar: JS faz attr 9 tremer
    write_center(28, "ENTER ou ESC - VOLTAR", A_ALERT);
}

// linha da tabela: rotulo, pontilhado ate a coluna 29 e o valor na 31
pub(crate) fn cmd_row(y: usize, label: &str, val: &str) {
    let lx = 11;
    write_str(lx, y, label, A_UI);
    let start = lx + label.chars().count() + 1; // 1 respiro depois do rotulo
    for x in start..30 {
        put(x, y, b'.', A_UI);
    }
    write_str(31, y, val, A_UI);
}

// a ESCOLHA DE ANDAR (o konami, nas controles): quem conhece a casa escolhe
// por onde entrar. Mesma moldura/linguagem do título; nada na tela de
// controles anuncia o código — a escolha é segredo de quem o sabe
pub(crate) fn render_select() {
    // moldura (igual ao titulo, em ambar)
    for x in 0..W() {
        put(x, 0, b'-', A_TITLE);
        put(x, H() - 2, b'-', A_TITLE);
    }
    for y in 0..H() {
        put(0, y, b'|', A_TITLE);
        put(W() - 1, y, b'|', A_TITLE);
    }
    put(0, 0, b'+', A_TITLE);
    put(W() - 1, 0, b'+', A_TITLE);
    put(0, H() - 2, b'+', A_TITLE);
    put(W() - 1, H() - 2, b'+', A_TITLE);

    // respiro: o big-font nasce UMA LINHA abaixo da moldura (o topo respira)
    // e solta mais uma antes do subtítulo (os glifos grandes moram em y 2..6)
    write_big_center(2, "ANDARES", A_TITLE);
    write_center(8, "escolha por onde entrar:", A_UI);

    // cursor 0..7 (andar 1..8): a linha escolhida ambar (A_TITLE); ESC volta
    unsafe {
        let depths: [u8; 8] = [1, 2, 3, 4, 5, 6, 7, 8];
        let mut names: [&str; 8] = [""; 8];
        for (k, d) in depths.iter().enumerate() {
            names[k] = floor_name(*d);
        }
        for k in 0..8usize {
            let y = 10 + k;
            let sel = KONSEL == k as u8;
            let a = if sel { A_TITLE } else { A_UI };
            let num: u8 = b'1' + k as u8;
            if sel { write_str(9, y, ">", A_TITLE); }
            put(11, y, num, a);
            write_str(14, y, names[k], a);
            if k == 7 {
                // o último andar carrega o prêmio: anotação na própria linha
                write_str(14 + names[7].chars().count() + 2, y, "a coroa", A_CROWN);
            }
        }
    }

    write_center(20, "W/S - escolher  ·  ENTER - comecar la", A_UI);
    write_center(21, "ESC - voltar", A_UI);
}



pub(crate) fn render_dead() {
    unsafe {
        // moldura completa da tela
        for x in 0..W() {
            put(x, 0, b'-', A_ALERT);
            put(x, H() - 1, b'-', A_ALERT);
        }
        for y in 0..H() {
            put(0, y, b'|', A_ALERT);
            put(W() - 1, y, b'|', A_ALERT);
        }
        put(0, 0, b'+', A_ALERT);
        put(W() - 1, 0, b'+', A_ALERT);
        put(0, H() - 1, b'+', A_ALERT);
        put(W() - 1, H() - 1, b'+', A_ALERT);

        // crânio da besta (todas as linhas com 26 colunas, espelhadas no eixo)
        let skull: [&str; 7] = [
            "         ________         ",
            "       .\"        \".       ",
            "       /          \\       ",
            "       |  o    o  |       ",
            "       |    __    |       ",
            "         \\  vv  /         ",
            "          |||||           ",
        ];
        write_block_center(4, &skull, A_BAS);

        let msg = if DEATH_R == 1 { "O OLHAR TE ENCONTROU." } else { "AS ESCAMAS TE TOCARAM." };
        write_center(14, msg, A_ALERT);
        write_center(16, "seus ossos guardam o castelo agora.", A_UI);
        write_center(17, "o basilisco volta a rondar, paciente.", A_UI);
        write_center(29, "ENTER - TENTAR DE NOVO", A_ALERT);
    }
}

pub(crate) fn render_win() {
    write_center(10, "A COROA E SUA.", A_CROWN);
    write_center(12, "voce escapou do olhar que comeu uma era.", A_UI);
    write_center(14, "o castelo fica orfao de reis.", A_UI);
    write_center(16, "a besta continua, paciente, no escuro.", A_UI);
    write_center(30, "ENTER - OUTRO DESTINO", A_ALERT);
}

// ================= diff de render (produtor Rust) =================

// câmera do RT: segue o jogador, clampa nas bordas do andar (a mesma conta
// que o JS fazia — nasceu aqui, onde o jogador mora; o JS só lê DIFF[1]/[2]).
// Fora de jogo: janela 0,0 (as telas de UI compõem no viewport padrão).
pub(crate) fn cam() -> (usize, usize) {
    unsafe {
        if STATE != ST_PLAY { return (0, 0); }
        (
            PX.saturating_sub(W0 / 2).min(W().saturating_sub(W0)),
            PY.saturating_sub(H0 / 2).min(H().saturating_sub(H0)),
        )
    }
}

// roda no FIM de render(): compara o viewport 56×32 corrente com DIFF_PREV e
// marca em DIFF o que mudou (sticky: OR de todos os renders entre acks).
// Mudança de câmera/andar/tela => bit0 (repinte integral); célula a célula =>
// bitmap em DIFF[3..]. SEM alocação: buffers fixos de state.rs.
pub(crate) fn diff_pass() {
    unsafe {
        let (cx, cy) = cam();
        let wsp = W();
        if cx != DIFF[1] as usize || cy != DIFF[2] as usize || STATE != DIFF_ST || DEPTH != DIFF_DP {
            DIFF[0] |= 1; // repinte integral
        }
        DIFF[1] = cx as u8;
        DIFF[2] = cy as u8;
        DIFF_ST = STATE;
        DIFF_DP = DEPTH;
        for sy in 0..H0 {
            for sx in 0..W0 {
                let si = sy * W0 + sx;
                let wi = ((cy + sy) * wsp + cx + sx) * 2;
                let c0 = GRID[wi];
                let c1 = GRID[wi + 1];
                let p = si * 2;
                if c0 != DIFF_PREV[p] || c1 != DIFF_PREV[p + 1] {
                    DIFF[3 + (si >> 3)] |= 1 << (si & 7); // bit si do bitmap
                    DIFF_PREV[p] = c0;
                    DIFF_PREV[p + 1] = c1;
                }
            }
        }
    }
}

pub(crate) fn sync_stats() {
    unsafe {
        STATS[0] = STATE;
        STATS[1] = DEATH_R;
        STATS[2] = DEPTH;
        STATS[3] = PX as u8;
        STATS[4] = PY as u8;
        STATS[5] = BX as u8;
        STATS[6] = BY as u8;
        STATS[7] = BST;
        STATS[8] = CROWN as u8;
        STATS[10] = NOISEL;                      // HUD: medidor de som
        STATS[11] = STAM.clamp(0, 100) as u8;    // HUD: fôlego
        STATS[12] = (tile_at(PX, PY) == T_RUBBLE) as u8; // você está nos escombros
        STATS[13] = START_REQ;                   // menu: pedido de "Iniciar"
        STATS[14] = MENU_SEL;                    // menu: cursor da tela inicial
        STATS[15] = SCHEME;                      // menu: modo de teclas (0 WASD, 1 SETAS)
        STATS[16] = W().min(255) as u8;            // largura do mapa atual
        STATS[17] = H().min(255) as u8;            // altura do mapa atual
        STATS[18] = FEAR.clamp(0, 100) as u8;      // HUD: medo (0..100)
        STATS[19] = fear_level();                  // HUD: nível do medo (0..4)
        // [20]: o pulso — 1 = você carrega o que chia (fragmento OU coroa,
        // a mesma matéria). Espelho do gate do heart_tick (evento 24)
        STATS[20] = (SHARD || CROWN) as u8;
        AI_DBG[0] = ROOMT;
        AI_DBG[1] = RTX;
        AI_DBG[2] = RTY;
        AI_DBG[3] = BST as usize;
        AI_DBG[4] = PLOITER.max(0) as usize;
        AI_DBG[5] = LOITER.max(0) as usize;
        AI_DBG[6] = RH.max(0) as usize;
        AI_DBG[7] = EAR_CD.max(0) as usize;
    }
}
