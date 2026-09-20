/* ============================================================
   ForgeAI — charts.js
   Dependency-free SVG charts: line, bars, horizontal bars,
   consistency dot-grid, sparklines. Animated, dark-native.
   ============================================================ */
(function () {
  const C = {};
  const uid = (() => { let n = 0; return () => ++n; })();

  const COLOR_VARS = {
    accent: "var(--accent)",
    cyan: "var(--cyan)",
    blue: "var(--blue)",
    purple: "var(--purple)",
    warn: "var(--warn)",
    muted: "#8a93a5"
  };
  const col = (c) => COLOR_VARS[c] || c || COLOR_VARS.accent;

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

  /* ---------- registry for resize re-render ---------- */
  let reg = [];
  C.reset = () => { reg = []; };
  C.register = (el, fn) => reg.push({ el, fn });
  let rzT = null;
  window.addEventListener("resize", () => {
    clearTimeout(rzT);
    rzT = setTimeout(() => {
      reg = reg.filter(r => r.el && r.el.isConnected);
      reg.forEach(r => r.fn());
    }, 180);
  });

  /* ---------- geometry helpers ---------- */
  function dims(el, height) {
    const w = Math.max(240, el.clientWidth || el.parentElement.clientWidth || 600);
    return { w, h: height };
  }
  function niceStep(range, count) {
    const raw = range / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const norm = raw / mag;
    const s = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
    return s * mag;
  }
  function smoothPath(pts) {
    if (pts.length < 3) return "M" + pts.map(p => p[0] + " " + p[1]).join(" L ");
    let d = "M" + pts[0][0] + " " + pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1x = +(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1), c1y = +(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1);
      const c2x = +(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1), c2y = +(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1);
      d += " C" + c1x + " " + c1y + " " + c2x + " " + c2y + " " + p2[0] + " " + p2[1];
    }
    return d;
  }

  function whenVisible(el, fn) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width && r.top < window.innerHeight && r.bottom > 0) { fn(); return; }
    if (!("IntersectionObserver" in window)) { fn(); return; }
    const io = new IntersectionObserver((es) => {
      es.forEach(e => { if (e.isIntersecting) { fn(); io.disconnect(); } });
    }, { threshold: 0.12 });
    io.observe(el);
  }
  C.whenVisible = whenVisible;

  /* ---------- generic hover tooltip ---------- */
  function makeTip(wrap) {
    let tip = wrap.querySelector(".ctooltip");
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "ctooltip";
      wrap.appendChild(tip);
    }
    return tip;
  }
  function moveTip(wrap, tip, clientX, clientY, html) {
    const wr = wrap.getBoundingClientRect();
    tip.innerHTML = html;
    let x = clientX - wr.left, y = clientY - wr.top;
    x = Math.max(70, Math.min(wr.width - 70, x));
    tip.style.left = x + "px";
    tip.style.top = Math.max(64, y) + "px";
    tip.style.opacity = 1;
  }

  /* ============================================================
     LINE CHART
     ============================================================ */
  C.line = function (el, opts) {
    const render = () => {
      const { w, h } = dims(el, opts.height || 220);
      const pad = Object.assign({ t: 14, r: 14, b: 26, l: 38 }, opts.pad);
      const labels = opts.labels || [];
      const series = opts.series;
      const n = Math.max(...series.map(s => s.values.length), labels.length);
      const yFmt = opts.yFmt || (v => v);

      let mn = Infinity, mx = -Infinity;
      series.forEach(s => s.values.forEach(v => { if (v < mn) mn = v; if (v > mx) mx = v; }));
      if (opts.yMin != null) mn = opts.yMin;
      if (opts.yMax != null) mx = opts.yMax;
      if (mn === mx) { mn -= 1; mx += 1; }
      const buffer = (mx - mn) * 0.08;
      mn -= buffer; mx += buffer;

      const step = niceStep(mx - mn, 4);
      const t0 = Math.floor(mn / step) * step;
      const ticks = [];
      for (let t = t0; t <= mx + step * 0.5; t += step) ticks.push(+t.toFixed(2));

      const X = (i) => +(pad.l + (i * (w - pad.l - pad.r)) / Math.max(1, n - 1)).toFixed(1);
      const Y = (v) => +(pad.t + (1 - (v - mn) / (mx - mn)) * (h - pad.t - pad.b)).toFixed(1);

      let g = "";
      // y grid + labels
      ticks.forEach(t => {
        const y = Y(t);
        if (y < pad.t - 2 || y > h - pad.b + 2) return;
        g += `<line x1="${pad.l}" y1="${y}" x2="${w - pad.r}" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>`;
        g += `<text x="${pad.l - 8}" y="${y + 3.5}" text-anchor="end" font-size="10" fill="#646d7d" style="fill:var(--text-3)">${yFmt(t)}</text>`;
      });
      // x labels (subset)
      const every = Math.ceil(n / 7);
      labels.forEach((l, i) => {
        if (i % every !== 0 && i !== n - 1) return;
        g += `<text x="${X(i)}" y="${h - 8}" text-anchor="middle" font-size="10" style="fill:var(--text-3)">${esc(l)}</text>`;
      });

      // series paths
      let defs = "", paths = "";
      series.forEach((s, si) => {
        const pts = s.values.map((v, i) => [X(i), Y(v)]);
        const c = col(s.color);
        const d = smoothPath(pts);
        if (si === 0 && opts.area !== false) {
          const gid = "lg" + uid();
          defs += `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${c};stop-opacity:0.16"/><stop offset="1" style="stop-color:${c};stop-opacity:0"/></linearGradient>`;
          paths += `<path d="${d} L${pts[pts.length - 1][0]} ${h - pad.b} L${pts[0][0]} ${h - pad.b} Z" fill="url(#${gid})" stroke="none"/>`;
        }
        paths += `<path class="line-path" d="${d}" fill="none" style="stroke:${c}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>`;
        // end dot
        const last = pts[pts.length - 1];
        paths += `<circle cx="${last[0]}" cy="${last[1]}" r="3.4" style="fill:${c}"/><circle cx="${last[0]}" cy="${last[1]}" r="3.4" fill="none" style="stroke:${c}" stroke-width="1.4" opacity="0.4"/>`;
      });

      // hover layer
      let hover = `<g class="hoverg" style="display:none"><line class="hx" y1="${pad.t}" y2="${h - pad.b}" stroke="rgba(255,255,255,0.18)" stroke-width="1" stroke-dasharray="3 3"/>`;
      series.forEach(s => { hover += `<circle class="hc" r="4" style="fill:${col(s.color)}" stroke="#0b0d10" stroke-width="1.6"/>`; });
      hover += "</g>";

      el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img"><defs>${defs}</defs>${g}${paths}${hover}</svg>`;
      el.classList.add("chart-wrap");

      // animate line draw
      el.querySelectorAll(".line-path").forEach(p => {
        const len = p.getTotalLength();
        p.style.strokeDasharray = len;
        p.style.strokeDashoffset = len;
        whenVisible(el, () => { requestAnimationFrame(() => { p.style.strokeDashoffset = 0; }); });
      });

      // tooltip
      const svg = el.querySelector("svg");
      const tip = makeTip(el);
      const hoverg = el.querySelector(".hoverg");
      const hx = el.querySelector(".hx");
      const hcs = el.querySelectorAll(".hc");
      svg.addEventListener("mousemove", (e) => {
        const rect = svg.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (w / rect.width);
        let idx = Math.round(((x - pad.l) / (w - pad.l - pad.r)) * (n - 1));
        idx = Math.max(0, Math.min(n - 1, idx));
        hoverg.style.display = "";
        hx.setAttribute("x1", X(idx)); hx.setAttribute("x2", X(idx));
        hcs.forEach((c, si) => {
          const s = series[si];
          const v = s.values[idx]; if (v == null) { c.style.display = "none"; return; }
          c.style.display = "";
          c.setAttribute("cx", X(idx)); c.setAttribute("cy", Y(v));
        });
        const rows = series.map(s => `<div class="tt-row"><span><span class="sw" style="background:${col(s.color)}"></span>${esc(s.name)}</span><strong>${yFmt(s.values[idx])}</strong></div>`).join("");
        moveTip(el, tip, e.clientX, e.clientY, `<div class="tt-label">${esc(labels[idx] || "")}</div>${rows}`);
      });
      svg.addEventListener("mouseleave", () => { tip.style.opacity = 0; hoverg.style.display = "none"; });
    };
    render();
    C.register(el, render);
  };

  /* ============================================================
     BAR CHART
     ============================================================ */
  C.bars = function (el, opts) {
    const render = () => {
      const { w, h } = dims(el, opts.height || 200);
      const pad = Object.assign({ t: 14, r: 8, b: 26, l: 34 }, opts.pad);
      const labels = opts.labels || [];
      const values = opts.values || [];
      const n = values.length;
      const yFmt = opts.yFmt || (v => v);
      const color = col(opts.color);

      let mx = Math.max(...values, opts.target != null ? opts.target : -Infinity);
      if (!isFinite(mx)) mx = 1;
      const step = niceStep(mx, 3);
      const top = Math.ceil(mx / step) * step;
      const Y = (v) => +(pad.t + (1 - v / top) * (h - pad.t - pad.b)).toFixed(1);

      let g = "";
      for (let t = 0; t <= top + 0.0001; t += step) {
        const y = Y(t);
        g += `<line x1="${pad.l}" y1="${y}" x2="${w - pad.r}" y2="${y}" stroke="rgba(255,255,255,0.05)"/>`;
        g += `<text x="${pad.l - 7}" y="${y + 3.5}" text-anchor="end" font-size="10" style="fill:var(--text-3)">${yFmt(+t.toFixed(2))}</text>`;
      }
      const slot = (w - pad.l - pad.r) / n;
      const bw = Math.min(30, slot * 0.52);
      let bars = "";
      values.forEach((v, i) => {
        const x = pad.l + slot * i + (slot - bw) / 2;
        const y = Y(v);
        bars += `<rect class="bar" data-i="${i}" x="${x.toFixed(1)}" y="${y}" width="${bw.toFixed(1)}" height="${(h - pad.b - y).toFixed(1)}" rx="5" style="fill:${color}" opacity="0.82"/>`;
        bars += `<text x="${(pad.l + slot * i + slot / 2).toFixed(1)}" y="${h - 8}" text-anchor="middle" font-size="10" style="fill:var(--text-3)">${esc(labels[i] || "")}</text>`;
      });
      let target = "";
      if (opts.target != null) {
        const ty = Y(opts.target);
        target = `<line x1="${pad.l}" y1="${ty}" x2="${w - pad.r}" y2="${ty}" stroke="#ffab5e" stroke-width="1.4" stroke-dasharray="5 4" opacity="0.8"/>
                  <text x="${w - pad.r}" y="${ty - 5}" text-anchor="end" font-size="10" style="fill:var(--warn)">${esc(opts.targetLabel || yFmt(opts.target))}</text>`;
      }
      el.innerHTML = `<svg viewBox="0 0 ${w} ${h}">${g}${bars}${target}</svg>`;
      el.classList.add("chart-wrap");

      const svg = el.querySelector("svg");
      whenVisible(el, () => {
        el.querySelectorAll(".bar").forEach((b, i) => {
          b.style.transitionDelay = (i * 45) + "ms";
          requestAnimationFrame(() => el.classList.add("in-view"));
        });
      });

      const tip = makeTip(el);
      svg.addEventListener("mousemove", (e) => {
        const rect = svg.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (w / rect.width);
        let idx = Math.floor((x - pad.l) / slot);
        idx = Math.max(0, Math.min(n - 1, idx));
        el.querySelectorAll(".bar").forEach((b, i) => { b.setAttribute("opacity", i === idx ? "1" : "0.82"); });
        moveTip(el, tip, e.clientX, e.clientY,
          `<div class="tt-label">${esc(labels[idx] || "")}</div>
           <div class="tt-row"><span><span class="sw" style="background:${color}"></span>${esc(opts.unitLabel || "Value")}</span><strong>${yFmt(values[idx])}${esc(opts.unit || "")}</strong></div>`);
      });
      svg.addEventListener("mouseleave", () => {
        tip.style.opacity = 0;
        el.querySelectorAll(".bar").forEach(b => b.setAttribute("opacity", "0.82"));
      });
    };
    render();
    C.register(el, render);
  };

  /* ============================================================
     HORIZONTAL BARS (HTML)
     ============================================================ */
  C.hbars = function (el, opts) {
    const rows = opts.rows || [];
    const max = opts.max || Math.max(...rows.map(r => r.sets)) * 1.1;
    el.innerHTML = rows.map(r => `
      <div class="hbar-row">
        <span class="hbar-label">${esc(r.label)}</span>
        <div class="hbar-track"><div class="hbar-fill" data-hb="${Math.round((r.sets / max) * 100)}" style="background:${r.color}"></div></div>
        <span class="hbar-val">${r.sets} <span style="color:var(--text-3);font-weight:500">sets</span></span>
      </div>`).join("");
    const fills = el.querySelectorAll(".hbar-fill");
    whenVisible(el, () => fills.forEach((f, i) => {
      f.style.transitionDelay = (i * 60) + "ms";
      requestAnimationFrame(() => { f.style.width = f.getAttribute("data-hb") + "%"; });
    }));
  };

  /* ============================================================
     CONSISTENCY DOT GRID
     ============================================================ */
  C.dots = function (el, opts) {
    const weeks = (opts && opts.weeks) || [];
    let grid = "";
    weeks.forEach(w => {
      w.days.forEach((d, di) => {
        const t = { 0: "rest", 1: "trained", 2: "missed" }[d];
        const cls = d === 1 ? (w.days.reduce((a, b) => a + (b === 1 ? 1 : 0), 0) >= 5 ? "hit" : "hit dim") : d === 2 ? "miss" : "";
        grid += `<i class="${cls}" title="${esc(w.label)} · ${esc(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][di])} · ${t}"></i>`;
      });
    });
    el.innerHTML = `
      <div class="dots-wrap">
        <div class="dots-days"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div>
        <div><div class="dots-grid">${grid}</div></div>
      </div>
      <div class="row mt" style="gap:14px;flex-wrap:wrap">
        <span class="lg-item"><span class="lg-swatch" style="background:var(--accent)"></span>Trained</span>
        <span class="lg-item"><span class="lg-swatch" style="background:#262c36"></span>Rest</span>
        <span class="lg-item"><span class="lg-swatch" style="background:transparent;border:1.5px solid var(--warn)"></span>Missed</span>
      </div>`;
  };

  window.ForgeCharts = C;
})();
