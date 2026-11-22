/* 證明圖譜互動模組：總覽架構圖、元件與宣告側邊抽屜、藍圖依賴圖與導覽路線。
   資料來源：由正體中文建置腳本寫入的 <script id="atlas-data" type="application/json">。 */
(() => {
  'use strict';
  const A = JSON.parse(document.getElementById('atlas-data').textContent);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const NS = 'http://www.w3.org/2000/svg';
  const comp = Object.fromEntries(A.components.map(c => [c.id, c]));
  const node = Object.fromEntries(A.nodes.map(n => [n.id, n]));
  const strat = Object.fromEntries(A.strata.map(s => [s.id, s]));
  const T = A.tiers;
  const KIND = {
    export: '匯出定理',
    wrapper: '封裝定理',
    reducer: '化約引理',
    lemma: '引理',
    definition: '定義',
    bundle: '打包結構',
    producer: '建構定理',
    alternative: '替代路徑',
    motivation: '歷史動機'
  };
  const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------- 文字與語法高亮度輔助函式 */
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function md(s) {
    const parts = String(s ?? '').split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+\$)/g);
    return parts.map((p, i) => i % 2 ? esc(p) : esc(p)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|[\s(「（，、])\*([^*\n]+)\*/g, '$1<em>$2</em>')).join('');
  }
  const KW = /^(theorem|lemma|def|structure|where|fun|by|exact|intro|have|obtain|rcases|with|match|namespace|end|variable|inductive|example|import|rw|at|refine|generalize|subst|change|apply|let|show|from|if|then|else|calc|noncomputable|section|open|instance|class|abbrev|private|protected|deriving|set_option|simp|simpa|omega|decide|exists|use)$/;
  function hl(code) {
    if (!code) return '';
    const re = /(--[^\n]*|\/-[\s\S]*?-\/|"(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_'.₀-₉]*|\d+)/g;
    let out = '', last = 0, m;
    while ((m = re.exec(code))) {
      out += esc(code.slice(last, m.index));
      const t = m[0];
      if (t.startsWith('--') || t.startsWith('/-')) out += `<span class="c">${esc(t)}</span>`;
      else if (t.startsWith('"')) out += `<span class="s">${esc(t)}</span>`;
      else if (KW.test(t)) out += `<span class="k">${esc(t)}</span>`;
      else if (/^(Type|Prop|Sort|True|False|RiemannHypothesis)$/.test(t)) out += `<span class="t">${esc(t)}</span>`;
      else if (/^\d+$/.test(t)) out += `<span class="n">${esc(t)}</span>`;
      else out += esc(t);
      last = m.index + t.length;
    }
    return out + esc(code.slice(last));
  }
  const tierBadge = t => `<span class="tier" style="--tc:${T[t].color}" title="${esc(T[t].meaning)}"><i>${esc(T[t].icon)}</i>${esc(T[t].label)}</span>`;
  const stratTextColor = s => (s.id === 'ana' ? 'var(--ana-text, #0e7490)' : s.color);
  const typeset = el => { if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([el]).catch(() => {}); };
  const compChip = id => { const c = comp[id], s = strat[c.stratum];
    return `<button type="button" class="chip" data-open-comp="${id}"><span class="dot" style="background:${s.color}"></span>${c.n}. ${esc(c.title)}</button>`; };
  const nodeChip = id => { const n = node[id];
    return `<button type="button" class="chip" data-open-node="${id}" title="${esc(n.declaration || n.title)}"><span class="dot" style="background:${T[n.tier].color}"></span>${esc(n.title)}</button>`; };

  /* ---------------------------------------------------------------- 側邊詳細資訊抽屜（原生 modal <dialog>） */
  const drawer = $('#drawer'), dc = $('#drawer-content');
  let supportsDisplayTransition;
  function canTransitionDisplay() {
    if (supportsDisplayTransition !== undefined) return supportsDisplayTransition;
    if (!window.CSS?.supports?.('transition-behavior', 'allow-discrete') || !document.body) {
      return false;
    }
    const probe = document.createElement('div');
    probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
    document.body.appendChild(probe);
    getComputedStyle(probe).display;
    probe.style.display = 'none';
    supportsDisplayTransition = getComputedStyle(probe).display === 'block';
    probe.remove();
    return supportsDisplayTransition;
  }
  function supportsTopLayerExit() {
    return Boolean(window.CSS?.supports?.('overlay', 'auto') && canTransitionDisplay());
  }
  function openDrawer(html) {
    const wasOpen = drawer.open;
    drawer.removeAttribute('data-closing');
    dc.innerHTML = html;
    drawer.setAttribute('aria-labelledby', 'drawer-title');
    dc.scrollTop = 0;
    const body = $('.drawer-body', dc);
    if (body) body.scrollTop = 0;
    if (!wasOpen) drawer.showModal();
    typeset(dc);
    const btn = $('.close', dc);
    if (btn) {
      btn.addEventListener('click', closeDrawer);
      if (wasOpen) btn.focus({ preventScroll: true });
    }
  }
  async function closeDrawer() {
    if (!drawer.open) return;
    if (!supportsTopLayerExit()) {
      if (drawer.hasAttribute('data-closing')) return;
      drawer.setAttribute('data-closing', '');
      const animations = typeof drawer.getAnimations === 'function' ? drawer.getAnimations({ subtree: true }) : [];
      if (animations.length > 0) {
        await Promise.race([
          Promise.allSettled(animations.map(a => a.finished)),
          new Promise(r => setTimeout(r, 2000))
        ]);
      }
      if (!drawer.hasAttribute('data-closing')) return;
      drawer.removeAttribute('data-closing');
    }
    if (drawer.open) drawer.close();
  }
  drawer.addEventListener('cancel', e => {
    if (!supportsTopLayerExit() && e.cancelable) {
      e.preventDefault();
      closeDrawer();
    }
  });
  drawer.addEventListener('close', () => {
    drawer.returnValue = '';
    drawer.removeAttribute('data-closing');
  });
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    const outside = e => {
      const r = drawer.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    let pressedOutside = false;
    drawer.addEventListener('pointerdown', e => { pressedOutside = drawer.open && outside(e); });
    drawer.addEventListener('pointerup', e => {
      if (pressedOutside && drawer.open && outside(e)) closeDrawer();
      pressedOutside = false;
    });
  }

  function componentHTML(id) {
    const c = comp[id], s = strat[c.stratum];
    const ups = A.interfaces.filter(i => i.to === id), downs = A.interfaces.filter(i => i.from === id);
    const fig = c.figure && document.getElementById('fig-' + c.figure);
    const cuts = A.cuts.filter(k => k.components.includes(id));
    const tl = A.timeline.filter(t => t.component === id);
    return `<div class="drawer-head"><button type="button" class="close" aria-label="關閉詳細資訊" autofocus>×</button>
      <div class="strat" style="color:${stratTextColor(s)}">${esc(s.title)} · 第 ${c.n} / ${A.components.length} 個元件</div>
      <h2 id="drawer-title">${esc(c.title)}</h2><div class="mono small muted">${esc(c.kicker)}</div>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">${tierBadge(c.tier)}${cuts.map(k => `<span class="tier" style="--tc:${T[k.tier].color}"><i>⊢</i>位於切口「${esc(k.title)}」內</span>`).join('')}</div></div>
      <div class="drawer-body">
      <p><b>${md(c.gist)}</b></p>
      <h3>定理敘述</h3><div class="stmt">$$${esc(c.statement)}$$</div>
      <h3>核心想法</h3>${c.explanation.map(p => `<p>${md(p)}</p>`).join('')}
      ${fig ? `<h3>圖解</h3><div class="fig">${fig.innerHTML}</div>` : ''}
      <h3>Lean 宣告 · 鎖定原始碼</h3><ul class="lean">${c.lean.map(l =>
        `<li><a href="${esc(l.url)}" target="_blank" rel="noopener"><code>${esc(l.name)}</code> ↗</a>${l.note ? `<span class="nt">${esc(l.note)}</span>` : ''}</li>`).join('')}</ul>
      <h3>驗證狀態</h3><p class="status">${md(c.status)}</p><p class="small muted">${tierBadge(c.tier)} ${esc(T[c.tier].meaning)}</p>
      <h3>尚待檢查項目</h3><div class="check">${md(c.check)}</div>
      ${ups.length ? `<h3>接收自</h3><div class="chips">${ups.map(i => compChip(i.from) + `<span class="small muted" style="align-self:center">→ ${esc(i.label)}</span>`).join('')}</div>` : ''}
      ${downs.length ? `<h3>供給至</h3><div class="chips">${downs.map(i => `<span class="small muted" style="align-self:center">${esc(i.label)} →</span>` + compChip(i.to)).join('')}</div>` : ''}
      <h3>藍圖宣告（${c.nodes.length}）</h3><div class="chips">${c.nodes.map(nodeChip).join('')}</div>
      ${tl.length ? `<h3>宣告文時間軸</h3><ul>${tl.map(t => `<li><b>${t.number}.</b> ${esc(t.topic)} <span class="relation">${esc(t.relation)}</span>${t.date ? ` <span class="small muted">${esc(t.date)}</span>` : ''}</li>`).join('')}</ul>` : ''}
      </div>`;
  }
  function nodeHTML(id) {
    const n = node[id], c = comp[n.component], s = strat[c.stratum];
    const uses = A.edges.filter(e => e.from === id), usedBy = A.edges.filter(e => e.to === id);
    const ev = (n.evidence || []).map(e => A.evidence[e] || e);
    const lines = n.lines ? `第 ${n.lines[0]}–${n.lines[1]} 行` : '';
    const kindLabel = KIND[n.kind] || n.kind;
    return `<div class="drawer-head"><button type="button" class="close" aria-label="關閉詳細資訊" autofocus>×</button>
      <div class="strat" style="color:${stratTextColor(s)}">藍圖宣告 · ${esc(kindLabel)} · ${esc(c.title)}</div>
      <h2 id="drawer-title">${esc(n.title)}</h2>
      ${n.declaration ? `<div class="mono small">${esc(n.module ? n.module + ' · ' : '')}<b>${esc(n.declaration)}</b></div>` : ''}
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">${tierBadge(n.tier)}
      ${n.url ? `<a class="btn light" style="padding:4px 10px;font-size:.8rem" href="${esc(n.url)}" target="_blank" rel="noopener">鎖定原始碼 ${esc(lines)} ↗</a>` : ''}
      <button type="button" class="btn light" style="padding:4px 10px;font-size:.8rem" data-graph-node="${id}">在圖表中顯示</button>
      <button type="button" class="btn light" style="padding:4px 10px;font-size:.8rem" data-trace="down" data-node="${id}" title="高亮度顯示此宣告所依賴的所有上游節點">依賴上游 ↓</button>
      <button type="button" class="btn light" style="padding:4px 10px;font-size:.8rem" data-trace="up" data-node="${id}" title="高亮度顯示使用此宣告的所有下游節點，直達終點定理">被使用於 ↑</button></div></div>
      <div class="drawer-body">
      <h3>標準數學表述</h3><p>${md(n.contract)}</p>
      <h3>證明內容</h3><p>${md(n.idea)}</p>
      ${n.assumptions && n.assumptions.length ? `<h3>明確假設</h3><ul>${n.assumptions.map(a => `<li>${md(typeof a === 'string' ? a : (a.text || a.name || JSON.stringify(a)))}</li>`).join('')}</ul>` : ''}
      ${n.lean_head ? `<h3>Lean 陳述</h3><pre class="lean" tabindex="0" lang="en">${hl(n.lean_head)}</pre>` : ''}
      ${n.excerpt && n.excerpt !== n.lean_head ? `<h3>原始碼節錄</h3><pre class="lean" tabindex="0" lang="en">${hl(n.excerpt)}</pre>` : ''}
      <h3>依賴項目（${uses.length}）</h3><div class="chips">${uses.map(e => nodeChip(e.to)).join('') || '<span class="small muted">無已選取的下層依賴</span>'}</div>
      <h3>被使用於（${usedBy.length}）</h3><div class="chips">${usedBy.map(e => nodeChip(e.from)).join('') || '<span class="small muted">終點定理或歷史動機</span>'}</div>
      <h3>所屬元件</h3><div class="chips">${compChip(c.id)}</div>
      <h3>驗證憑證</h3><ul class="small">${ev.map(e => `<li>${esc(e)}</li>`).join('')}</ul>
      <p class="small muted">${esc(T[n.tier].meaning)}</p>
      </div>`;
  }
  const openComponent = id => openDrawer(componentHTML(id));
  const openNode = id => openDrawer(nodeHTML(id));

  document.addEventListener('click', e => {
    const c = e.target.closest('[data-open-comp]');
    if (c) { e.preventDefault(); openComponent(c.dataset.openComp); return; }
    const n = e.target.closest('[data-open-node]');
    if (n) { e.preventDefault(); openNode(n.dataset.openNode); if (graph) graph.select(n.dataset.openNode, { center: true, open: false }); return; }
    const g = e.target.closest('[data-graph-node]');
    if (g) { e.preventDefault(); closeDrawer(); $('#blueprint').scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      setTimeout(() => graph.select(g.dataset.graphNode, { center: true, open: false }), 350); }
  });

  /* ---------------------------------------------------------------- 總覽架構圖 */
  const map = $('#map'), msvg = $('#map-svg');
  $$('.comp', map).forEach(el => {
    el.addEventListener('click', () => openComponent(el.dataset.id));
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); openComponent(el.dataset.id); }
      else if (e.key === ' ') { e.preventDefault(); }
    });
    el.addEventListener('keyup', e => {
      if (e.key === ' ') { e.preventDefault(); openComponent(el.dataset.id); }
    });
  });
  function mk(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  function drawMap() {
    if (getComputedStyle(msvg).display === 'none') return;
    // 第一階段：批次讀取所有幾何配置，避免讀寫交錯造成版面抖動
    const R = map.getBoundingClientRect();
    const compRects = {};
    $$('.comp', map).forEach(el => {
      const r = el.getBoundingClientRect();
      compRects[el.dataset.id] = {
        x: r.left - R.left, y: r.top - R.top, w: r.width, h: r.height,
        col: +el.dataset.col, row: +el.dataset.row
      };
    });
    const bandRects = A.strata.map((s, i) => {
      const cards = $$(`.comp[data-col="${i + 1}"]`, map).map(el => compRects[el.dataset.id]);
      const head = $(`.map-col-head[data-col="${i + 1}"]`, map).getBoundingClientRect();
      const hx0 = head.left - R.left, hx1 = head.right - R.left, hy0 = head.top - R.top;
      const x0 = Math.min(...cards.map(r => r.x), hx0) - 10;
      const x1 = Math.max(...cards.map(r => r.x + r.w), hx1) + 10;
      const y0 = hy0 - 8;
      const y1 = Math.max(...cards.map(r => r.y + r.h)) + 12;
      return { x: x0, y: y0, width: x1 - x0, height: y1 - y0, fill: s.color };
    });
    // 第二階段：批次建構並掛載 SVG 節點
    msvg.replaceChildren();
    const frag = document.createDocumentFragment();
    const defs = mk('defs', {}, frag);
    const mrk = mk('marker', { id: 'mh', viewBox: '0 0 10 10', refX: '8.5', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' }, defs);
    mk('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#475569' }, mrk);
    // 層級底色區塊
    bandRects.forEach(b => mk('rect', { x: b.x, y: b.y, width: b.width, height: b.height, rx: 18, fill: b.fill, opacity: 0.055 }, frag));
    const labels = [];
    A.interfaces.forEach(it => {
      const a = compRects[it.from], b = compRects[it.to];
      let d, mx, my, rot = 0;
      if (a.col === b.col && Math.abs(a.row - b.row) === 1) {
        const down = b.row > a.row, x1 = a.x + a.w / 2, x2 = b.x + b.w / 2;
        const y1 = down ? a.y + a.h : a.y, y2 = down ? b.y : b.y + b.h;
        d = `M${x1},${y1} L${x2},${y2 + (down ? -2 : 2)}`; mx = (x1 + x2) / 2; my = (y1 + y2) / 2;
      } else if (a.col === b.col) {
        // 沿欄位外側繞過中間卡片
        const side = a.col === 1 ? -1 : 1, xa = side < 0 ? a.x : a.x + a.w, xb = side < 0 ? b.x : b.x + b.w;
        const ya = a.y + a.h * 0.62, yb = b.y + b.h * 0.38, xo = xa + 30 * side;
        d = `M${xa},${ya} C${xo},${ya} ${xo},${ya} ${xo},${(ya + yb) / 2} S${xo},${yb} ${xb + 2 * side},${yb}`;
        mx = xo - 11; my = (ya + yb) / 2; rot = -90;
      } else if (a.row === b.row) {
        // 同一列：從兩張卡片下方空隙穿過的 U 形連線
        const x1 = a.x + a.w * 0.82, x2 = b.x + b.w * 0.18, y1 = a.y + a.h, y2 = b.y + b.h, yg = Math.max(y1, y2) + 16;
        d = `M${x1},${y1} C${x1},${yg} ${x1},${yg} ${(x1 + x2) / 2},${yg} S${x2},${yg} ${x2},${y2 + 2}`;
        mx = (x1 + x2) / 2; my = yg;
      } else {
        const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2, dx = Math.max(18, (x2 - x1) / 2);
        d = `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2 - 2},${y2}`; mx = (x1 + x2) / 2; my = (y1 + y2) / 2;
      }
      mk('path', { d, fill: 'none', stroke: '#475569', 'stroke-width': 1.6, 'marker-end': 'url(#mh)', opacity: 0.8,
        'data-from': it.from, 'data-to': it.to, class: 'iface' }, frag);
      labels.push({ x: mx, y: my, text: it.label, rot, lean: it.lean });
    });
    const labelEls = labels.map(l => {
      const g = mk('g', l.rot ? { transform: `rotate(${l.rot},${l.x},${l.y})` } : {}, frag);
      const bg = mk('rect', { class: 'lblbg', rx: 6, ry: 6 }, g);
      const t = mk('text', { class: 'lbl', x: l.x, y: l.y + 3.5, 'text-anchor': 'middle' }, g);
      t.textContent = l.text;
      const tt = mk('title', {}, g); tt.textContent = `${l.text} — Lean：${l.lean}`;
      return { l, bg, t };
    });
    msvg.appendChild(frag);
    // 第三階段：批次量測標籤寬度後再統一寫入背景框屬性
    const widths = labelEls.map(({ l, t }) => (t.getComputedTextLength ? t.getComputedTextLength() : l.text.length * 10));
    labelEls.forEach(({ l, bg }, idx) => {
      const w = widths[idx];
      bg.setAttribute('x', l.x - w / 2 - 6); bg.setAttribute('y', l.y - 9); bg.setAttribute('width', w + 12); bg.setAttribute('height', 18);
    });
  }
  window.addEventListener('resize', () => { clearTimeout(drawMap.t); drawMap.t = setTimeout(drawMap, 120); });
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(drawMap);
  window.addEventListener('mathjax-ready', () => { drawMap(); });
  drawMap();

  // 架構圖上的已驗證切口
  const callout = $('#cut-callout');
  $$('[data-cut]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.cut, on = !btn.classList.contains('on');
    $$('[data-cut]').forEach(b => { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); });
    $$('.comp', map).forEach(el => el.classList.remove('in', 'out'));
    map.classList.toggle('cutmode', on && id !== 'none');
    callout.classList.remove('show');
    if (!on || id === 'none') return;
    btn.classList.add('on');
    btn.setAttribute('aria-pressed', 'true');
    const k = A.cuts.find(x => x.id === id);
    $$('.comp', map).forEach(el => el.classList.add(k.components.includes(el.dataset.id) ? 'in' : 'out'));
    callout.innerHTML = `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">${tierBadge(k.tier)}<b>${esc(k.title)}</b> <code>${esc(k.lean)}</code></div>
      <div class="prem">$$\\Bigl[\\,${esc(k.premise)}\\,\\Bigr]\\ \\Longrightarrow\\ \\text{${esc(k.conclusion)}}$$</div>
      <div class="small">${esc(k.evidence)} 高亮度顯示：位於已驗證閉包內的元件。淡化顯示：須提供該前提的元件，以及證明存檔本身的五個匯出定理——其證明詞皆須經由該供給路徑。</div>`;
    callout.classList.add('show'); typeset(callout);
  }));

  /* ---------------------------------------------------------------- 架構圖導覽路線 */
  (() => {
    const start = $('#story-start'); if (!start || !A.story) return;
    let i = 0, on = false;
    function show() {
      const st = A.story[i], c = comp[st.comp], s = strat[c.stratum];
      $$('[data-cut]').forEach(b => { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); });
      map.classList.add('cutmode');
      $$('.comp', map).forEach(el => { el.classList.remove('in', 'out'); el.classList.add(el.dataset.id === st.comp ? 'in' : 'out'); });
      callout.style.background = '#eef2ff'; callout.style.borderColor = '#c7d2fe'; callout.style.color = '#1e1b4b';
      callout.innerHTML = `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="chip on">${i + 1} / ${A.story.length}</span>
        <span class="dot" style="background:${s.color}"></span><b>${c.n}. ${esc(c.title)}</b><span class="small muted">${esc(s.title)}</span>
        <span style="margin-left:auto;display:flex;gap:6px"><button type="button" class="btn light" data-st="prev" aria-label="上一步">←</button><button type="button" class="btn light" data-st="next" aria-label="下一步">→</button>
        <button type="button" class="btn light" data-open-comp="${c.id}">詳細說明</button><button type="button" class="btn light" data-st="stop">結束</button></span></div>
        <p style="margin:10px 0 0;font-size:1.02rem">${md(st.text)}</p>`;
      callout.classList.add('show'); typeset(callout);
      callout.querySelector('[data-st=prev]').onclick = () => { i = Math.max(0, i - 1); show(); };
      callout.querySelector('[data-st=next]').onclick = () => { i = Math.min(A.story.length - 1, i + 1); show(); };
      callout.querySelector('[data-st=stop]').onclick = stop;
      const el = $(`.comp[data-id="${st.comp}"]`, map);
      const r = el.getBoundingClientRect();
      if (r.top < 120 || r.bottom > innerHeight - 20) window.scrollTo({ top: scrollY + r.top - innerHeight / 2 + r.height / 2, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
    function stop() { on = false; map.classList.remove('cutmode'); $$('.comp', map).forEach(el => el.classList.remove('in', 'out'));
      callout.classList.remove('show'); callout.removeAttribute('style'); start.textContent = '▶ 導覽路線：從黎曼猜想往回追溯'; }
    start.addEventListener('click', () => { if (on) { stop(); return; } on = true; i = 0; start.textContent = '■ 停止導覽';
      $('#map-section').scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' }); setTimeout(show, 250); });
    document.addEventListener('keydown', e => { if (!on || drawer.open) return;
      if (e.key === 'ArrowRight') { i = Math.min(A.story.length - 1, i + 1); show(); }
      if (e.key === 'ArrowLeft') { i = Math.max(0, i - 1); show(); } });
    $$('[data-cut]').forEach(b => b.addEventListener('click', () => { if (on) { on = false; start.textContent = '▶ 導覽路線：從黎曼猜想往回追溯'; callout.removeAttribute('style'); } }, true));
    const m = location.hash.match(/^#tour-?(\d*)$/);
    if (m) { on = true; i = Math.max(0, Math.min(A.story.length - 1, (+m[1] || 1) - 1)); start.textContent = '■ 停止導覽'; setTimeout(show, 50); }
  })();

  /* ---------------------------------------------------------------- 藍圖依賴圖 */
  const graph = (() => {
    const svg = $('#bp-svg'), vp = $('#bp-vp'), shell = $('#bp-shell');
    if (!svg) return null;
    const L = A.layout, NW = L.nw, NH = L.nh;
    const defs = mk('defs', {}, svg);
    const mrk = mk('marker', { id: 'bh', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '6', markerHeight: '6', orient: 'auto' }, defs);
    mk('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#94a3b8' }, mrk);
    const eG = mk('g', {}, vp), nG = mk('g', {}, vp);
    const edgeEls = A.edges.map(e => {
      const a = node[e.to], b = node[e.from];                 // 供給者 a 流向使用者 b
      const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2, dx = Math.max(36, Math.abs(x2 - x1) / 2);
      const p = mk('path', { d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2 - 3},${y2}`, class: `bp-edge ${e.relation}`, 'marker-end': 'url(#bh)' }, eG);
      p.dataset.from = e.from; p.dataset.to = e.to; return p;
    });
    const nodeEls = {};
    A.nodes.forEach(n => {
      const c = comp[n.component], col = strat[c.stratum].color;
      const g = mk('g', {
        class: 'bp-node',
        transform: `translate(${n.x},${n.y})`,
        tabindex: '0',
        role: 'button',
        'aria-label': `${n.title}（${T[n.tier].label}）`
      }, nG);
      g.dataset.id = n.id;
      mk('rect', { class: 'box', width: NW, height: NH, rx: 9 }, g);
      mk('rect', { x: 0, y: 0, width: 6, height: NH, rx: 3, fill: col }, g);
      mk('circle', { cx: NW - 12, cy: 12, r: 6, fill: T[n.tier].color }, g);
      const t = mk('text', { class: 't', x: 14, y: 19 }, g); t.textContent = n.short;
      const d = mk('text', { class: 'd', x: 14, y: 35 }, g); d.textContent = n.decl_short || KIND[n.kind] || n.kind;
      const tt = mk('title', {}, g); tt.textContent = `${n.title}\n${n.declaration || ''}\n${T[n.tier].label}`;
      g.addEventListener('click', ev => { ev.stopPropagation(); select(n.id, { open: true }); });
      g.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') { ev.preventDefault(); select(n.id, { open: true }); }
        else if (ev.key === ' ') { ev.preventDefault(); }
      });
      g.addEventListener('keyup', ev => {
        if (ev.key === ' ') { ev.preventDefault(); select(n.id, { open: true }); }
      });
      nodeEls[n.id] = g;
    });
    // 平移與縮放
    let view = { k: 0.5, x: 20, y: 20 };
    let apply = () => vp.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`);
    function fit() { const r = svg.getBoundingClientRect(); const k = Math.min(r.width / (L.w + 60), r.height / (L.h + 60));
      view = { k, x: (r.width - L.w * k) / 2, y: (r.height - L.h * k) / 2 }; apply(); }
    function zoomAt(f, mx, my) { const nk = Math.min(2.6, Math.max(0.15, view.k * f)); view.x = mx - (mx - view.x) * nk / view.k; view.y = my - (my - view.y) * nk / view.k; view.k = nk; apply(); }
    svg.addEventListener('wheel', e => { e.preventDefault(); const r = svg.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    let drag = null;
    svg.addEventListener('pointerdown', e => { if (e.target.closest('.bp-node')) return; drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; svg.classList.add('dragging'); svg.setPointerCapture(e.pointerId); });
    svg.addEventListener('pointermove', e => { if (!drag) return; view.x = drag.vx + e.clientX - drag.x; view.y = drag.vy + e.clientY - drag.y; apply(); });
    svg.addEventListener('pointerup', e => { if (drag && Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 4) clear(); drag = null; svg.classList.remove('dragging'); });
    $('#bp-in').onclick = () => { const r = svg.getBoundingClientRect(); zoomAt(1.25, r.width / 2, r.height / 2); };
    $('#bp-out').onclick = () => { const r = svg.getBoundingClientRect(); zoomAt(0.8, r.width / 2, r.height / 2); };
    $('#bp-fit').onclick = fit;
    function centerOn(id, k) {
      const n = node[id], r = svg.getBoundingClientRect(), kk = k || Math.max(view.k, 0.85);
      const target = { k: kk, x: r.width / 2 - (n.x + NW / 2) * kk, y: r.height / 2 - (n.y + NH / 2) * kk };
      if (prefersReducedMotion()) { view = target; apply(); return; }
      const from = { ...view }, t0 = performance.now();
      const step = now => { const u = Math.min(1, (now - t0) / 420), e = u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        view = { k: from.k + (target.k - from.k) * e, x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e }; apply();
        if (u < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
    function clear() { shell.classList.remove('bp-dim'); Object.values(nodeEls).forEach(g => g.classList.remove('sel', 'hl', 'match')); edgeEls.forEach(p => p.classList.remove('hl')); }
    function mark(ids, edgesToo) {
      clear(); shell.classList.add('bp-dim');
      ids.forEach(i => nodeEls[i] && nodeEls[i].classList.add('hl'));
      if (edgesToo) edgeEls.forEach(p => { if (ids.has(p.dataset.from) && ids.has(p.dataset.to)) p.classList.add('hl'); });
    }
    function select(id, opts = {}) {
      clear(); shell.classList.add('bp-dim');
      nodeEls[id].classList.add('sel');
      edgeEls.forEach(p => { if (p.dataset.from === id || p.dataset.to === id) { p.classList.add('hl'); nodeEls[p.dataset.from].classList.add('hl'); nodeEls[p.dataset.to].classList.add('hl'); } });
      nodeEls[id].classList.remove('hl'); nodeEls[id].classList.add('sel');
      if (opts.center) centerOn(id);
      if (opts.open) openNode(id);
    }
    function cone(id, dir) { // dir 'down' = 此宣告依賴的所有上游；'up' = 使用此宣告的所有下游
      const seen = new Set([id]), q = [id];
      while (q.length) { const u = q.shift(); A.edges.forEach(e => { const [a, b] = dir === 'down' ? [e.from, e.to] : [e.to, e.from];
        if (a === u && !seen.has(b)) { seen.add(b); q.push(b); } }); }
      return seen;
    }
    // 搜尋功能（含 IME 組字安全防護與即時區域節流播報）
    const search = $('#bp-search'), countEl = $('#bp-count');
    let hits = [], hi = 0, countTimer = null;
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase(); clear(); hits = []; hi = 0;
      clearTimeout(countTimer);
      if (!q) { countEl.textContent = ''; return; }
      A.nodes.forEach(n => { if ((n.title + ' ' + (n.declaration || '') + ' ' + n.contract + ' ' + comp[n.component].title).toLowerCase().includes(q)) hits.push(n.id); });
      shell.classList.add('bp-dim'); hits.forEach(i => nodeEls[i].classList.add('match'));
      const msg = hits.length ? `找到 ${hits.length} 筆符合結果 · 按 Enter 依序跳轉` : '找不到符合項目';
      countTimer = setTimeout(() => { countEl.textContent = msg; }, 150);
    });
    search.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        if (e.isComposing || e.keyCode === 229) return;
        if (hits.length) {
          e.preventDefault();
          centerOn(hits[hi % hits.length]);
          hi++;
        }
      }
    });
    // 依元件、層級或驗證等級高亮顯示
    $('#bp-filter').addEventListener('change', e => {
      const v = e.target.value; if (!v) { clear(); return; }
      const [kind, key] = v.split(':');
      const ids = new Set(A.nodes.filter(n => kind === 'c' ? n.component === key : kind === 's' ? comp[n.component].stratum === key : n.tier === key).map(n => n.id));
      mark(ids, true);
    });
    // 閱讀導覽路線
    const bar = $('#tour'); let tour = null, ti = 0;
    function showStep() {
      const id = tour.nodes[ti], n = node[id];
      select(id, { center: true });
      bar.innerHTML = `<b>${esc(tour.title)}</b><span class="small">${esc(tour.question)}</span>
        <span class="chip on">${ti + 1} / ${tour.nodes.length}</span><span><b>${esc(n.title)}</b> — <span class="small">${md(n.contract)}</span></span>
        <span style="margin-left:auto;display:flex;gap:6px"><button type="button" class="btn light" data-t="prev" aria-label="上一步">←</button><button type="button" class="btn light" data-t="next" aria-label="下一步">→</button>
        <button type="button" class="btn light" data-open-node="${id}">詳細說明</button><button type="button" class="btn light" data-t="stop">結束</button></span>`;
      bar.classList.add('show'); typeset(bar);
      bar.querySelector('[data-t=prev]').onclick = () => { ti = Math.max(0, ti - 1); showStep(); };
      bar.querySelector('[data-t=next]').onclick = () => { ti = Math.min(tour.nodes.length - 1, ti + 1); showStep(); };
      bar.querySelector('[data-t=stop]').onclick = () => { bar.classList.remove('show'); tour = null; clear(); };
    }
    $$('[data-tour]').forEach(b => b.addEventListener('click', () => { tour = A.itineraries[+b.dataset.tour]; ti = 0; showStep(); }));
    $$('[data-cone]').forEach(b => b.addEventListener('click', () => { mark(cone(b.dataset.node, b.dataset.cone), true); }));
    // 小地圖：完整依賴圖縮覽與目前視窗框
    const mm = $('#bp-mini');
    let mmView = null;
    if (mm) {
      const MW = 300, MH = Math.max(46, Math.round(MW * L.h / L.w)), sc = MW / L.w;
      mm.setAttribute('viewBox', `0 0 ${MW} ${MH}`); mm.style.width = MW + 'px'; mm.style.height = MH + 'px';
      A.nodes.forEach(n => mk('rect', { x: n.x * sc, y: n.y * MH / L.h, width: Math.max(2, NW * sc), height: Math.max(2, NH * MH / L.h * 0.7),
        fill: strat[comp[n.component].stratum].color, opacity: 0.85, rx: 1 }, mm));
      mmView = mk('rect', { fill: 'rgba(79,70,229,.08)', stroke: '#4f46e5', 'stroke-width': 1.2, rx: 2 }, mm);
      const goto = e => { const r = mm.getBoundingClientRect(), gx = (e.clientX - r.left) / MW * L.w, gy = (e.clientY - r.top) / MH * L.h;
        const s = svg.getBoundingClientRect(); view.x = s.width / 2 - gx * view.k; view.y = s.height / 2 - gy * view.k; apply(); };
      let mdrag = false;
      mm.addEventListener('pointerdown', e => { mdrag = true; mm.setPointerCapture(e.pointerId); goto(e); e.stopPropagation(); });
      mm.addEventListener('pointermove', e => { if (mdrag) goto(e); });
      mm.addEventListener('pointerup', () => { mdrag = false; });
      const MWH = { MW, MH };
      const upd = () => { const r = svg.getBoundingClientRect();
        const x0 = -view.x / view.k, y0 = -view.y / view.k, w = r.width / view.k, h = r.height / view.k;
        mmView.setAttribute('x', x0 * MWH.MW / L.w); mmView.setAttribute('y', y0 * MWH.MH / L.h);
        mmView.setAttribute('width', w * MWH.MW / L.w); mmView.setAttribute('height', h * MWH.MH / L.h); };
      const apply0 = apply;
      apply = () => { apply0(); upd(); };
    }
    // 預設以可讀比例聚焦於終點定理；點擊 ⤢ 可檢視全圖
    function home() { const r = svg.getBoundingClientRect(), k = Math.min(0.92, r.width / 1100);
      const ends = A.nodes.filter(n => n.section === 'exports');
      const cx = Math.max(...ends.map(n => n.x)) + NW, cy = ends.reduce((a, n) => a + n.y, 0) / ends.length + NH / 2;
      view = { k, x: r.width - 40 - cx * k, y: r.height / 2 - cy * k }; apply(); }
    home();
    $('#bp-home').onclick = home;
    window.addEventListener('resize', () => { clearTimeout(home.t); home.t = setTimeout(home, 150); });
    return { select, centerOn, cone, mark, fit };
  })();

  /* ---------------------------------------------------------------- 頂部導覽列捲動監聽（Scrollspy） */
  (() => {
    const links = $$('.topnav-links a');
    if (!links.length) return;
    const setAriaCurrent = activeLink => {
      links.forEach(link => {
        if (link === activeLink) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    };
    if (window.CSS?.supports?.('scroll-target-group: auto')) {
      const syncAriaCurrent = () => {
        let currentLink = null;
        try { currentLink = $('.topnav-links a:target-current'); } catch {}
        setAriaCurrent(currentLink);
      };
      let raf1 = 0, raf2 = 0;
      const scheduleSync = () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
        raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(syncAriaCurrent); });
      };
      scheduleSync();
      window.addEventListener('load', scheduleSync, { once: true });
      if ('onscrollend' in window) {
        document.addEventListener('scrollend', scheduleSync, { passive: true });
      } else {
        let scrollTimer = null;
        window.addEventListener('scroll', () => { clearTimeout(scrollTimer); scrollTimer = setTimeout(scheduleSync, 120); }, { passive: true });
      }
      window.addEventListener('hashchange', scheduleSync);
    } else if ('IntersectionObserver' in window) {
      const sections = $$('main > section[id]');
      const linkById = Object.fromEntries(links.map(a => [a.getAttribute('href').slice(1), a]));
      const observer = new IntersectionObserver(entries => {
        const visible = entries.filter(e => e.isIntersecting);
        if (!visible.length) return;
        const active = linkById[visible[visible.length - 1].target.id] || null;
        links.forEach(link => {
          const isCurrent = link === active;
          link.classList.toggle('target-current', isCurrent);
          if (isCurrent) link.setAttribute('aria-current', 'true');
          else link.removeAttribute('aria-current');
        });
      }, { rootMargin: '-20% 0px -70% 0px', threshold: 0 });
      sections.forEach(s => observer.observe(s));
    }
  })();

  // 節點抽屜內的「依賴上游」／「被使用於」按鈕
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-trace]'); if (!b || !graph) return;
    closeDrawer(); $('#blueprint').scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    graph.mark(graph.cone(b.dataset.node, b.dataset.trace), true);
  });

  // 深層連結：#c-<component>、#n-<node> 或 #cut-<cut>
  function fromHash() { const h = decodeURIComponent(location.hash.slice(1));
    if (h.startsWith('c-') && comp[h.slice(2)]) openComponent(h.slice(2));
    if (h.startsWith('n-') && node[h.slice(2)]) { openNode(h.slice(2)); if (graph) graph.select(h.slice(2), { center: true, open: false }); }
    if (h.startsWith('cut-')) { const b = document.querySelector(`[data-cut="${h}"]`); if (b && !b.classList.contains('on')) b.click(); } }
  window.addEventListener('hashchange', fromHash); fromHash();
})();
