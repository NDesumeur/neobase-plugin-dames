// Dames : ton appli d'origine (HTML et code inchangés), livrée en plugin.
// Ses données sont dans le dossier du plugin, que NeoBase sauvegarde (synchro cloud et sauvegardes) ; à la première ouverture elle reprend ce que tu avais dans NeoBase.
// Elle demande l'accès complet pour utiliser les outils d'interface de NeoBase. NeoBase ne l'ouvre que si elle est signée.
const HTML = "<div class=\"appWrap wide\">\n      <div class=\"agHead\"><span class=\"label\">Dames</span><span class=\"hint\" id=\"dmInfo\"></span><div class=\"agNav\"><select class=\"f gSel\" id=\"dmLevel\"><option value=\"0\">Débutant</option><option value=\"1\">Facile</option><option value=\"2\" selected>Moyen</option><option value=\"3\">Difficile</option><option value=\"4\">Expert</option><option value=\"5\">Maître</option><option value=\"6\">Grand maître</option></select><select class=\"f gSel\" id=\"dmColor\"><option value=\"w\" selected>Je joue les blancs</option><option value=\"b\">Je joue les noirs</option><option value=\"r\">Couleur au hasard</option></select><button class=\"btn px\" id=\"dmUndo\">ANNULER</button><button class=\"btn px\" id=\"dmNew\">NOUVELLE PARTIE</button></div></div>\n      <div class=\"chMain\"><div id=\"dmBoard\" class=\"px\"></div>\n        <div class=\"chSide\"><div class=\"chState\" id=\"dmState\"></div><span class=\"hint\" id=\"dmCount\"></span><div class=\"sysCard px chMovesCard\"><span class=\"label\">Coups</span><div id=\"dmMoves\" class=\"chMoves\"></div></div></div></div>\n      <div class=\"hint\">Règles internationales (10 × 10) : la prise est obligatoire, en avant comme en arrière, et il faut prendre le plus de pièces possible. La dame se déplace de plusieurs cases. Pour une rafle, clique la case d'arrivée (ou les cases de passage).</div>\n    </div>";
/*CSS-MOVED*/ const CSS = `.gSel{width:auto;font-size:14px;padding:6px 10px;margin-right:8px}
.chMain{display:flex;gap:28px;align-items:flex-start;flex-wrap:wrap}
#dmBoard{display:grid;--sq:min(64px,calc((100vh - 260px) / 10));grid-template-columns:repeat(10,var(--sq))}
.dmSq{width:var(--sq);height:var(--sq);position:relative;display:grid;place-items:center}
.dmSq.l{background:color-mix(in srgb,var(--violet) 40%,#e8defa)}
.dmSq.d{background:color-mix(in srgb,var(--violet) 55%,#1c1238)}
.dmSq img{width:86%;height:86%;image-rendering:pixelated;pointer-events:none;position:relative;z-index:1}
.dmSq.last{box-shadow:inset 0 0 0 100px rgba(255,208,122,.28)}
.dmSq.sel{box-shadow:inset 0 0 0 4px var(--pink),inset 0 0 0 100px rgba(var(--pkr),.25)}
.dmSq.dot::after{content:"";position:absolute;width:26%;height:26%;background:rgba(5,1,11,.45);z-index:2}
.dmSq.can{box-shadow:inset 0 0 0 2px rgba(255,208,122,.5)}
.dmSq.gone::before{content:"×";position:absolute;font:16px var(--title);color:rgba(255,79,109,.7)}
.dmSq.d{cursor:var(--cp,pointer)}
.dmSq .num{position:absolute;font:9px var(--title);color:rgba(5,1,11,.55);z-index:0}
.dmSq .num{left:2px;top:2px;font-size:7px;color:rgba(255,255,255,.35)}
.chSide{display:flex;flex-direction:column;gap:14px;width:300px;min-width:240px}
.chState{font:12px var(--title);color:#fff;line-height:1.6}
.chState.win{color:#8ee8a0}
.chState.lose{color:var(--red)}
.chMovesCard{max-height:360px}
.chMoves{overflow-y:auto;max-height:300px}
.chMv{display:grid;grid-template-columns:40px 1fr 1fr;font-size:16px;padding:2px 0}
.chMv .n{color:var(--muted)}
.shGrid td.num{text-align:right}
`;  // le style de ce plugin (il utilise les variables du thème de NeoBase)
export default async function (ctx) {
  const view = ctx.view;
  if (!ctx.host) { view.textContent = "Ce plugin doit être approuvé par NeoBase pour s'ouvrir."; return; }
  const host = ctx.host, { el, toast, sfx, ask, newTab, pixIcon, PIX, WX } = host;
  const folder = ctx.folder, legacy = ctx.legacy || {};
  ctx.host.addStyle(CSS);
  view.innerHTML = HTML;
  const $ = id => id === "damesApp" ? view : (view.querySelector('#' + id) || document.getElementById(id));  // les identifiants de ta vue d'abord, puis ceux de la page (fenêtres, menus)
  const doc = async n => { try { return await folder.read(n); } catch { return null; } };
  const __icon = () => ctx.icon;  // l'icône de ce plugin
  const LEGACY_GAMES = {"top":["dames"],"best":"^$"};
  let games = await doc('games');
  if (games == null) {  // première ouverture : tu retrouves tes records et tes parties d'avant
    const old = legacy.api ? await legacy.api('games').catch(() => null) : null; games = { best: {} };
    if (old) { const re = new RegExp(LEGACY_GAMES.best); for (const [k, v] of Object.entries(old.best || {})) if (re.test(k)) games.best[k] = v; for (const k of LEGACY_GAMES.top) if (old[k] !== undefined) games[k] = old[k]; await folder.write('games', games); }
  }
  games = { best: {}, ...games };
  let gamesTimer = null;
  const saveGames = () => { clearTimeout(gamesTimer); gamesTimer = setTimeout(() => { gamesTimer = null; folder.write('games', games).catch(() => {}); }, 500); };
  const best = (k, v, higher = true) => { const b = games.best[k]; if (b == null || (higher ? v > b : v < b)) { games.best[k] = v; saveGames(); return true; } return false; };
  const gstore = (k, init) => (games[k] ??= init);  // la section d'un jeu
function gameLoop(st, appKey, update, draw) {
  cancelAnimationFrame(st.raf);
  const STEP = 1000 / 60; let acc = 0, last = performance.now();
  const frame = t => {
    if (!view.classList.contains('on')) { st.raf = 0; if (st.mode === 'play') st.mode = 'pause'; return; }  // leaving the tab pauses the game
    st.raf = requestAnimationFrame(frame);
    acc += Math.min(200, t - last); last = t;
    while (acc >= STEP) { if (st.mode === 'play') update(); st.tick++; acc -= STEP; }
    draw();
  };
  st.raf = requestAnimationFrame(frame);
}
function gameText(g, w, lines, y0) {  // centred pixel-font lines over a dark band
  g.fillStyle = 'rgba(11,3,28,.72)'; g.fillRect(0, y0 - 14, w, lines.length * 14 + 14);
  g.textAlign = 'center';
  lines.forEach(([text, color, size], i) => { g.fillStyle = color; g.font = (size || 8) + 'px "Press Start 2P", monospace'; g.fillText(text, w / 2, y0 + i * 14); });
  g.textAlign = 'left';
}
const px = (g, color, x, y, w = 1, h = 1) => { g.fillStyle = color; g.fillRect(Math.round(x), Math.round(y), w, h); };
function sprite(g, rows, x, y, pal) { rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const c = pal[r[i]]; if (c) px(g, c, x + i, y + j); } }); }
  // ---- ton code d'origine ----
const pixArt = (rows, pal, scale = 4) => {
  const colors = {o: '#130a20', ...pal}, w = rows[0].length, h = rows.length;
  let shadow = '', body = '';
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === '.') return;
    shadow += `<rect x="${x + 1}" y="${y + 1}" width="1" height="1"/>`;
    body += `<rect x="${x}" y="${y}" width="1" height="1" fill="${colors[ch] || '#fff'}"/>`;
  }));
  return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w + 1} ${h + 1}" width="${(w + 1) * scale}" height="${(h + 1) * scale}" shape-rendering="crispEdges"><g fill="#000" opacity=".45">${shadow}</g>${body}</svg>`);
};

/* ---------- international draughts (10 x 10) rules and engine: board = 100 chars, w/b men, W/B kings, '.' empty ---------- */
function damesCore() {
  const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]], on = (r, c) => r >= 0 && r < 10 && c >= 0 && c < 10;
  const mine = (x, w) => w ? x === 'w' || x === 'W' : x === 'b' || x === 'B';
  const start = () => ({b: Array.from({length: 100}, (_, i) => { const r = Math.floor(i / 10), c = i % 10; return (r + c) % 2 ? r < 4 ? 'b' : r > 5 ? 'w' : '.' : '.'; }), w: true, k: 0});
  function moves(s) {  // legal moves {path: [from, ...landings], caps: [...]}: capturing is compulsory, and the longest capture must be played
    const b = s.b, w = s.w, caps = [];
    for (let sq = 0; sq < 100; sq++) {
      if (!mine(b[sq], w)) continue;
      const king = b[sq] === 'W' || b[sq] === 'B', free = i => b[i] === '.' || i === sq;  // the moving piece has left its square
      const dfs = (pos, path, taken) => {
        let more = false; const r = Math.floor(pos / 10), c = pos % 10;
        for (const [dr, dc] of DIRS) {
          let y = r + dr, x = c + dc;
          if (king) while (on(y, x) && free(y * 10 + x)) { y += dr; x += dc; }
          if (!on(y, x)) continue;
          const mid = y * 10 + x;
          if (!mine(b[mid], !w) || taken.includes(mid)) continue;  // pieces already jumped stay on the board until the end and cannot be jumped twice
          for (let ly = y + dr, lx = x + dc; on(ly, lx) && free(ly * 10 + lx); ly += dr, lx += dc) {
            more = true; dfs(ly * 10 + lx, [...path, ly * 10 + lx], [...taken, mid]);
            if (!king) break;
          }
        }
        if (!more && taken.length) caps.push({path, caps: taken});
      };
      dfs(sq, [sq], []);
    }
    if (caps.length) { const mx = Math.max(...caps.map(m => m.caps.length)); return caps.filter(m => m.caps.length === mx); }
    const out = [];
    for (let sq = 0; sq < 100; sq++) {
      if (!mine(b[sq], w)) continue;
      const king = b[sq] === 'W' || b[sq] === 'B', r = Math.floor(sq / 10), c = sq % 10;
      for (const [dr, dc] of DIRS) {
        if (!king && dr !== (w ? -1 : 1)) continue;
        for (let y = r + dr, x = c + dc; on(y, x) && b[y * 10 + x] === '.'; y += dr, x += dc) { out.push({path: [sq, y * 10 + x], caps: []}); if (!king) break; }
      }
    }
    return out;
  }
  function make(s, m) {
    const b = s.b.slice(), from = m.path[0], to = m.path.at(-1), pc = b[from];
    b[from] = '.'; for (const c of m.caps) b[c] = '.';
    const row = Math.floor(to / 10);
    b[to] = pc === 'w' && row === 0 ? 'W' : pc === 'b' && row === 9 ? 'B' : pc;  // a man becomes a king when its move ends on the far row
    return {b, w: !s.w, k: (pc === 'W' || pc === 'B') && !m.caps.length ? s.k + 1 : 0};
  }
  const key = s => s.b.join('') + (s.w ? 'w' : 'b');
  function evaluate(s) {
    let v = 0;
    for (let i = 0; i < 100; i++) {
      const x = s.b[i]; if (x === '.') continue;
      const r = Math.floor(i / 10), c = i % 10, centre = c >= 3 && c <= 6 ? 4 : 0;
      if (x === 'w') v += 100 + (9 - r) * 3 + centre + (r === 9 ? 6 : 0);
      else if (x === 'b') v -= 100 + r * 3 + centre + (r === 0 ? 6 : 0);
      else if (x === 'W') v += 330; else v -= 330;
    }
    return s.w ? v : -v;
  }
  let nodes = 0, deadline = 0, stop = false;
  function search(s, depth, alpha, beta, ply, hist) {
    if ((++nodes & 1023) === 0 && Date.now() > deadline) stop = true;
    if (stop) return 0;
    if (s.k >= 50 || hist.includes(key(s))) return 0;
    const ms = moves(s);
    if (!ms.length) return -100000 + ply;
    if (depth <= 0 && (!ms[0].caps.length || ply > 24)) return evaluate(s);  // keep going while captures are forced
    let bestV = -Infinity;
    hist.push(key(s));
    for (const m of ms.sort((a, b) => b.caps.length - a.caps.length)) {
      const v = -search(make(s, m), depth - 1, -beta, -alpha, ply + 1, hist);
      if (v > bestV) bestV = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    hist.pop();
    return bestV;
  }
  const LEVELS = [{d: 1, noise: 70, ms: 4000}, {d: 2, noise: 25, ms: 4000}, {d: 4, noise: 0, ms: 3000}, {d: 40, noise: 0, ms: 1500}, {d: 40, noise: 0, ms: 4000}, {d: 40, noise: 0, ms: 8000}, {d: 40, noise: 0, ms: 15000}];
  function think({s, hist, level}) {
    const lv = LEVELS[level], root = moves(s);
    if (!root.length) return null;
    nodes = 0; stop = false; deadline = Date.now() + lv.ms;
    let best = root[0];
    if (root.length === 1) return best;
    for (let d = 1; d <= lv.d; d++) {
      let alpha = -Infinity, cur = null;
      for (const m of [best, ...root.filter(x => x !== best)]) {
        let v = -search(make(s, m), d - 1, -Infinity, lv.noise ? Infinity : -alpha, 1, hist.slice());
        if (stop) break;
        v += (Math.random() * 2 - 1) * lv.noise;
        if (v > alpha) { alpha = v; cur = m; }
      }
      if (stop) break;
      best = cur;
      if (alpha > 99000) break;
    }
    return best;
  }
  return {start, moves, make, key, think};
}

/* ---------- Dames: interface ---------- */
const DM = damesCore();
const damesWorker = new Worker(URL.createObjectURL(new Blob([`const D = (${damesCore})(); onmessage = e => postMessage({id: e.data.id, m: D.think(e.data)});`], {type: 'text/javascript'})));
const DM_MAN = ['............', '...oooooo...', '..owwwwwwo..', '.owsssssswo.', '.owsddddswo.', '.owsddddswo.', '.owsddddswo.', '.owsssssswo.', '..owwwwwwo..', '..ohhhhhho..', '...oooooo...', '............'];
const DM_KING = ['............', '...oooooo...', '..owwwwwwo..', '.owsssssswo.', '.owsyddyswo.', '.owsyyyyswo.', '.owsyyyyswo.', '.owsssssswo.', '..owwwwwwo..', '..ohhhhhho..', '...oooooo...', '............'];
const DM_PAL = {w: {o: '#1c1238', w: '#fff7ff', s: '#e6dcff', d: '#c9bdf0', h: '#8f7bb8', y: '#ffd07a'}, b: {o: '#05010b', w: '#ff5ad9', s: '#4a2d7a', d: '#3a1f66', h: '#2b1650', y: '#ffd07a'}};
const DM_IMG = {w: pixArt(DM_MAN, DM_PAL.w, 6), W: pixArt(DM_KING, DM_PAL.w, 6), b: pixArt(DM_MAN, DM_PAL.b, 6), B: pixArt(DM_KING, DM_PAL.b, 6)};
const dmNum = i => Math.floor(i / 10) * 5 + Math.floor(i % 10 / 2) + 1;  // official square numbers 1 to 50
let dm = null, dmId = 0;
function dmReplay(save) {
  dm = {s: DM.start(), hist: [], moves: [], level: save.level, human: save.human, path: [], over: null};
  dm.hist.push(DM.key(dm.s));
  for (const p of save.moves) { const m = DM.moves(dm.s).find(x => x.path.join() === p.join()); if (!m) break; dmApply(m, true); }
}
function dmStatus() {
  const s = dm.s;
  if (!DM.moves(s).length) return {result: s.w ? 'b' : 'w', why: s.b.some(x => x !== '.' && (x.toLowerCase() === (s.w ? 'w' : 'b'))) ? 'plus aucun coup possible' : 'plus aucune pièce'};
  if (s.k >= 50) return {result: 'd', why: '25 coups de dames sans prise'};
  if (dm.hist.filter(k => k === DM.key(s)).length >= 3) return {result: 'd', why: 'triple répétition'};
  return null;
}
function dmApply(m, quiet) {
  dm.moves.push({path: m.path, caps: m.caps, txt: dmNum(m.path[0]) + (m.caps.length ? 'x' : '-') + dmNum(m.path.at(-1))});
  dm.s = DM.make(dm.s, m); dm.hist.push(DM.key(dm.s)); dm.path = [];
  dm.over = dmStatus();
  if (quiet) return;
  sfx(m.caps.length ? 'close' : 'click');
  const st = gstore('dames', {});
  st.save = dm.over ? null : {level: dm.level, human: dm.human, moves: dm.moves.map(x => x.path)};
  if (dm.over) { const r = (st['lvl' + dm.level] ??= {w: 0, l: 0, d: 0}), k = dm.over.result === 'd' ? 'd' : dm.over.result === dm.human ? 'w' : 'l'; r[k]++; sfx(k === 'w' ? 'launch' : k === 'l' ? 'error' : 'notify'); }
  saveGames(); dmRender();
  if (!dm.over && (dm.s.w ? 'w' : 'b') !== dm.human) dmThink();
}
function dmThink() {
  dm.thinking = true; dmRender();
  const id = ++dmId;
  setTimeout(() => damesWorker.postMessage({id, s: dm.s, hist: dm.hist.slice(0, -1), level: dm.level}), 300);
}
damesWorker.onmessage = e => {
  if (e.data.id !== dmId || !dm || dm.over) return;
  dm.thinking = false;
  const m = e.data.m && DM.moves(dm.s).find(x => x.path.join() === e.data.m.path.join());
  if (m) dmApply(m);
};
function dmNew() {
  const c = $('dmColor').value, human = c === 'r' ? (Math.random() < .5 ? 'w' : 'b') : c;
  dmId++; dmReplay({level: +$('dmLevel').value, human, moves: []});
  gstore('dames', {}).save = {level: dm.level, human, moves: []}; saveGames();
  dmRender();
  if (human === 'b') dmThink();
}
function dmOpen() {
  if (dm) return dmRender();
  const save = games.dames?.save;
  if (!save) return dmNew();
  dmReplay(save); $('dmLevel').value = save.level; dmRender();
  if (!dm.over && (dm.s.w ? 'w' : 'b') !== dm.human) dmThink();
}
const dmCandidates = () => DM.moves(dm.s).filter(m => dm.path.every((p, k) => m.path[k] === p));
function dmClick(i) {
  if (!dm || dm.over || dm.thinking || (dm.s.w ? 'w' : 'b') !== dm.human) return;
  const all = DM.moves(dm.s);
  if (!dm.path.length || all.some(m => m.path[0] === i) && !dmCandidates().some(m => m.path[dm.path.length] === i)) {  // choose a piece
    dm.path = all.some(m => m.path[0] === i) ? [i] : [];
    if (!dm.path.length && dm.s.b[i] !== '.' && all[0]?.caps.length) toast('La prise est obligatoire (et la plus longue)');
    return dmRender();
  }
  const ends = dmCandidates().filter(m => m.path.at(-1) === i);
  if (ends.length === 1) return dmApply(ends[0]);  // the landing square is enough when only one capture ends there
  if (ends.length > 1 && !dmCandidates().some(m => m.path[dm.path.length] === i)) return toast('Plusieurs prises finissent ici : clique les cases de passage une par une');
  const next = dmCandidates().filter(m => m.path[dm.path.length] === i);
  if (!next.length) { dm.path = []; return dmRender(); }
  dm.path.push(i);
  const done = next.filter(m => m.path.length === dm.path.length);
  if (done.length === 1) return dmApply(done[0]);
  dmRender();
}
function dmRender() {
  const s = dm.s, flip = dm.human === 'b', cand = dm.path.length ? dmCandidates() : [], all = DM.moves(s), last = dm.moves.at(-1);
  const steps = new Set(cand.map(m => m.path[dm.path.length]).filter(x => x != null)), ends = new Set(cand.map(m => m.path.at(-1)));
  const movable = new Set((s.w ? 'w' : 'b') === dm.human && !dm.over ? all.map(m => m.path[0]) : []);
  $('dmBoard').replaceChildren(...Array.from({length: 100}, (_, k) => {
    const i = flip ? 99 - k : k, r = Math.floor(i / 10), c = i % 10, d = el('div', 'dmSq ' + ((r + c) % 2 ? 'd' : 'l'));
    if ((r + c) % 2) {
      d.onclick = () => dmClick(i);
      if (last && (last.path.includes(i))) d.classList.add('last');
      if (last?.caps.includes(i)) d.classList.add('gone');
      if (dm.path.includes(i)) d.classList.add('sel');
      if (steps.has(i) || ends.has(i)) d.classList.add('dot');
      if (movable.has(i) && !dm.path.length) d.classList.add('can');
      if (s.b[i] !== '.') { const img = el('img'); img.src = DM_IMG[s.b[i]]; img.draggable = false; d.append(img); }
      if (c === (flip ? 9 : 0) || r === (flip ? 0 : 9)) d.append(el('span', 'num', String(dmNum(i))));
    }
    return d;
  }));
  const you = dm.human, o = dm.over, count = (x, k) => s.b.filter(v => v === x).length;
  $('dmState').textContent = o ? (o.result === 'd' ? 'Nulle (' + o.why + ')' : (o.result === you ? 'Tu as gagné ! ' : 'L\'ordinateur gagne : ') + o.why)
    : (s.w ? 'w' : 'b') === you ? (all[0]?.caps.length ? 'Prise obligatoire : ' + all[0].caps.length + ' pièce' + (all[0].caps.length > 1 ? 's' : '') : 'À toi de jouer') : 'L\'ordinateur réfléchit…';
  $('dmState').className = 'chState' + (o ? (o.result === you ? ' win' : o.result === 'd' ? '' : ' lose') : '');
  const me = you, ai = you === 'w' ? 'b' : 'w';
  $('dmCount').textContent = 'Toi : ' + count(me) + ' pions, ' + count(me.toUpperCase()) + ' dames · Ordinateur : ' + count(ai) + ' pions, ' + count(ai.toUpperCase()) + ' dames';
  const ml = $('dmMoves'); ml.replaceChildren();
  for (let i = 0; i < dm.moves.length; i += 2) { const row = el('div', 'chMv'); row.append(el('span', 'n', (i / 2 + 1) + '.'), el('span', '', dm.moves[i].txt), el('span', '', dm.moves[i + 1]?.txt || '')); ml.append(row); }
  ml.scrollTop = ml.scrollHeight;
  const st = games.dames?.['lvl' + dm.level] || {w: 0, l: 0, d: 0};
  $('dmInfo').textContent = 'Niveau ' + $('dmLevel').options[dm.level].text + ' · ' + st.w + ' victoires, ' + st.d + ' nulles, ' + st.l + ' défaites';
  $('dmUndo').disabled = dm.moves.length < (dm.human === 'w' ? 1 : 2) || dm.thinking;
}
$('dmNew').onclick = dmNew;
$('dmColor').onchange = dmNew;
$('dmLevel').onchange = () => { if (!dm || dm.moves.length < 2 || dm.over) return dmNew(); dm.level = +$('dmLevel').value; games.dames.save.level = dm.level; saveGames(); dmRender(); };
$('dmUndo').onclick = () => {
  if (dm.thinking) return;
  const keep = dm.moves.slice(0, -((dm.s.w ? 'w' : 'b') === dm.human ? 2 : 1)).map(x => x.path);
  dmId++; dmReplay({level: dm.level, human: dm.human, moves: keep}); games.dames.save = {level: dm.level, human: dm.human, moves: keep}; saveGames(); dmRender();
};  // (non indenté : les textes sur plusieurs lignes restent exactement les tiens)
  // ---- fin ----
  ctx.onOpen(() => { dmOpen(); });
}
