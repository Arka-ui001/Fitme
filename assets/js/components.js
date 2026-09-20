/* ============================================================
   ForgeAI — components.js
   Reusable UI components (MetricCard, AIInsightCard, ProgressPhoto
   Comparison, MuscleDevelopmentCard, ConfidenceBadge, figures…)
   ============================================================ */
(function () {
  const U = {};
  const I = (n, s, c) => window.ForgeIcons.svg(n, s, c);
  let uid = 0;
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

  /* ============================================================
     FIGURES — abstract CV-style body placeholders
     ============================================================ */
  const FIG = {
    front: {
      shapes: [
        '<ellipse cx="100" cy="44" rx="22" ry="24"/>',
        '<rect x="91" y="60" width="18" height="18" rx="8"/>',
        '<rect x="64" y="76" width="72" height="118" rx="30"/>',
        '<rect x="71" y="186" width="58" height="44" rx="20"/>'
      ],
      limbs: [
        ['M63 100 L51 186', 21], ['M51 186 L46 254', 17],
        ['M137 100 L149 186', 21], ['M149 186 L154 254', 17],
        ['M87 224 L84 306', 27], ['M84 306 L82 356', 19],
        ['M113 224 L116 306', 27], ['M116 306 L118 356', 19]
      ],
      bones: [[100, 66, 68, 94], [100, 66, 132, 94], [68, 94, 51, 186], [132, 94, 149, 186],
        [51, 186, 46, 254], [149, 186, 154, 254], [100, 66, 100, 200], [100, 200, 86, 204], [100, 200, 114, 204],
        [86, 204, 84, 306], [114, 204, 116, 306], [84, 306, 82, 354], [116, 306, 118, 354]],
      joints: [[100, 24], [100, 66], [68, 94], [132, 94], [51, 186], [149, 186], [46, 254], [154, 254],
        [86, 204], [114, 204], [84, 306], [116, 306], [82, 354], [118, 354]]
    },
    back: null, /* same as front */
    side: {
      shapes: [
        '<ellipse cx="107" cy="44" rx="19" ry="23"/>',
        '<rect x="96" y="60" width="14" height="18" rx="7"/>',
        '<rect x="82" y="76" width="40" height="120" rx="20"/>',
        '<rect x="82" y="188" width="40" height="42" rx="19"/>'
      ],
      limbs: [
        ['M99 100 L96 188', 18], ['M96 188 L93 252', 15],
        ['M94 224 L92 306', 25], ['M92 306 L90 354', 18],
        ['M102 224 L101 306', 25, 0.75], ['M101 306 L100 354', 18, 0.75]
      ],
      bones: [], joints: []
    }
  };

  /**
   * figure(view, opts) → svg string
   * opts: { height, mode: 'fill'|'wire', pose, color }
   */
  U.figure = function (view, opts) {
    opts = opts || {};
    const def = FIG[view.toLowerCase()] || FIG.front;
    const h = opts.height || 292;
    const wire = opts.mode === "wire";
    const color = opts.color || (wire ? "#5a6373" : "#242b36");

    let inner = "";
    def.shapes.forEach(s => {
      inner += wire
        ? s.replace("/>", ' style="fill:none;stroke:' + color + '" stroke-width="1.6"/>')
        : '<g style="fill:' + color + '">' + s + "</g>";
    });
    def.limbs.forEach(L => {
      const [d, w, op] = L;
      inner += `<path d="${d}" fill="none" style="stroke:${color}" stroke-width="${wire ? 2 : w}" stroke-linecap="round"${op ? ' opacity="' + op + '"' : ""}/>`;
    });

    if (opts.pose && def.bones.length) {
      let bones = "", joints = "";
      def.bones.forEach(b => { bones += `<line x1="${b[0]}" y1="${b[1]}" x2="${b[2]}" y2="${b[3]}"/>`; });
      def.joints.forEach(j => {
        joints += `<circle cx="${j[0]}" cy="${j[1]}" r="5" style="fill:var(--accent)" opacity="0.22"/>`;
        joints += `<circle cx="${j[0]}" cy="${j[1]}" r="2.4" style="fill:var(--accent)"/>`;
      });
      inner += `<g style="stroke:var(--accent)" stroke-width="1.4" opacity="0.85">${bones}</g><g>${joints}</g>`;
    }

    return `<svg class="figure" style="height:${h}px" viewBox="0 0 200 380" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${inner}</svg>`;
  };

  const corners = '<span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>';

  /** single photo pane (CV frame around a silhouette) */
  U.photoPane = function (session, view, opts) {
    opts = opts || {};
    return `<div class="cpane">
      <div class="frame${opts.scanning ? " scanning" : ""}">
        ${corners}
        <span class="chip f-tag">${I("scan", 12)} AI aligned</span>
        <span class="chip chip-info f-tag2">pose ${opts.poseMatch || 96}%</span>
        ${U.figure(view, { pose: opts.pose })}
        <span class="f-date">${esc(session.date)} · ${esc(view)}</span>
      </div>
    </div>`;
  };

  /** overlay mode: two wireframes superimposed */
  U.overlayStage = function (beforeS, afterS, view) {
    return `<div class="cpane">
      <div class="frame">
        ${corners}
        <span class="chip f-tag">Overlay · ${esc(view)}</span>
        <span class="chip chip-acc f-tag2">delta detected</span>
        <div style="position:relative;display:grid;place-items:center">
          <div style="position:absolute;display:grid;place-items:center">${U.figure(view, { mode: "wire", color: "#5a6373", height: 292 })}</div>
          <div style="position:absolute;display:grid;place-items:center">${U.figure(view, { mode: "wire", color: "var(--accent)", height: 292 })}</div>
          ${U.figure(view, { mode: "wire", color: "transparent", height: 292 })}
        </div>
        <span class="f-date">${esc(beforeS.label)} <span class="muted">→</span> ${esc(afterS.label)}</span>
      </div>
    </div>`;
  };

  /* ============================================================
     SPARKLINES / mini bars (static inline svg)
     ============================================================ */
  U.sparkSVG = function (points, o) {
    o = o || {};
    const w = o.w || 110, h = o.h || 34, pad = 3;
    const min = Math.min(...points), max = Math.max(...points), span = (max - min) || 1;
    const step = (w - pad * 2) / Math.max(1, points.length - 1);
    const pts = points.map((v, i) => [+(pad + i * step).toFixed(1), +(h - pad - ((v - min) / span) * (h - pad * 2)).toFixed(1)]);
    const line = pts.map(p => p.join(",")).join(" ");
    const c = o.color || "var(--accent)";
    const gid = "sg" + (++uid);
    const area = o.fill === false ? "" :
      `<path d="M ${pts[0][0]} ${h} L ${pts.map(p => p[0] + " " + p[1]).join(" L ")} L ${pts[pts.length - 1][0]} ${h} Z" style="fill:${c}" opacity="0.13"/>`;
    const last = pts[pts.length - 1];
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${area}
      <polyline points="${line}" fill="none" style="stroke:${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${last[0]}" cy="${last[1]}" r="2.5" style="fill:${c}"/></svg>`;
  };

  U.barsSpark = function (values, o) {
    o = o || {};
    const w = o.w || 92, h = o.h || 30, gap = 4;
    const max = Math.max(...values), min = Math.min(...values), span = (max - min) || 1;
    const bw = (w - gap * (values.length - 1)) / values.length;
    const c = o.color || "var(--accent)";
    let bars = "";
    values.forEach((v, i) => {
      const bh = 6 + ((v - min) / span) * (h - 8);
      const op = i === values.length - 1 ? 1 : 0.38;
      bars += `<rect x="${(i * (bw + gap)).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="2" style="fill:${c}" opacity="${op}"/>`;
    });
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${bars}</svg>`;
  };

  /* ============================================================
     CONFIDENCE RING
     ============================================================ */
  U.confRing = function (pct, size, color) {
    size = size || 46;
    const sw = Math.max(3.5, size * 0.085);
    const r = (size - sw) / 2;
    const c = 2 * Math.PI * r;
    const off = +(c * (1 - pct / 100)).toFixed(1);
    const fs = Math.max(9, Math.round(size * 0.27));
    return `<span class="conf-ring" style="width:${size}px;height:${size}px">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" style="stroke:rgba(255,255,255,0.08)" stroke-width="${sw}"/>
        <circle data-cr="${off}" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" style="stroke:${color || "var(--accent)"}" stroke-width="${sw}" stroke-linecap="round"
          stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"
          class="cr-anim"/>
      </svg>
      <span class="cr-val" style="font-size:${fs}px">${pct}%</span>
    </span>`;
  };

  /* ============================================================
     METRIC CARD
     ============================================================ */
  U.metricCard = function (o) {
    const delta = o.delta ? `<div class="m-delta ${o.delta.dir}">${o.delta.dir === "up" ? I("upright", 13) : o.delta.dir === "down" ? '<svg class="icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M7 7l10 10"/><polyline points="9 17 17 17 17 9"/></svg>' : I("arrowr", 13)} ${esc(o.delta.text)}</div>` : "";
    const progress = o.progress != null ? `
      <div class="progress${o.progress >= 100 ? "" : ""}" style="margin-top:12px"><div class="progress-fill" data-w="${o.progress}"></div></div>
      <div class="spread" style="margin-top:7px"><span class="m-target">${esc(o.targetLabel || "")}</span><span class="m-target" style="font-weight:650;color:var(--text-2)">${o.progress}%</span></div>` :
      (o.foot ? `<div class="m-foot"><span class="m-target">${esc(o.foot)}</span></div>` : "");
    const spark = o.spark ? `<div class="m-spark">${U.sparkSVG(o.spark, { w: 104, h: 36 })}</div>` : "";
    return `<div class="card hover metric-card">
      <div class="m-label"><span class="eyebrow">${esc(o.label)}</span>${o.icon ? `<span class="muted">${I(o.icon, 15)}</span>` : ""}</div>
      <div class="m-value-row">
        <span class="m-value" data-count="${o.value}" data-dec="${o.decimals || 0}">0</span>
        ${o.unit ? `<span class="m-unit">${esc(o.unit)}</span>` : ""}
      </div>
      ${delta}${progress}${spark}
    </div>`;
  };

  /* ============================================================
     AI INSIGHT CARD
     ============================================================ */
  U.aiInsightCard = function (o) {
    return `<div class="insight">
      <div class="insight-head">
        <span class="insight-title">${I("spark", 16)} AI Fitness Insight</span>
        <span class="chip">${I("refresh", 12)} ${esc(o.updated)}</span>
      </div>
      <div class="insight-body"><p>“${esc(o.text)}”</p></div>
      <div class="insight-meta">
        <div class="im-block">
          <span class="im-label">Confidence</span>
          <span class="im-value">${U.confRing(o.confidence, 46)} ${o.confidence}%</span>
        </div>
        <div class="im-block">
          <span class="im-label">Evidence</span>
          <span class="im-value">${o.evidenceCount} <span class="muted">data sources</span></span>
        </div>
        <div class="im-block">
          <span class="im-label">Sources</span>
          <div class="chip-row">${o.sources.map(s => `<span class="chip">${esc(s)}</span>`).join("")}</div>
        </div>
        <a class="btn btn-soft insight-cta" href="#/analysis?demo=1">View full analysis ${I("arrowr", 15)}</a>
      </div>
    </div>`;
  };

  /* ============================================================
     MUSCLE DEVELOPMENT CARD
     ============================================================ */
  U.muscleCard = function (m) {
    const trendIco = m.trend === "up" ? I("upright", 13) : m.trend === "down"
      ? '<svg class="icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M7 7l10 10"/><polyline points="9 17 17 17 17 9"/></svg>'
      : I("arrowr", 13);
    const trendCls = m.trend === "up" ? "up" : m.trend === "down" ? "down" : "flat";
    const trendTxt = m.trend === "up" ? "Improving" : m.trend === "down" ? "Decreasing" : "Stable";
    const sparkColor = m.trend === "up" ? "var(--accent)" : m.trend === "down" ? "var(--warn)" : "#5a6373";
    return `<div class="card hover muscle-card">
      <div class="mc-head"><span class="mc-name">${esc(m.name)}</span><span class="mc-trend ${trendCls}">${trendIco} ${esc(m.label)}</span></div>
      <div class="mc-spark">${U.barsSpark(m.spark, { color: sparkColor })}</div>
      <div class="mc-conf">
        <div class="progress"><div class="progress-fill" data-w="${m.confidence}"></div></div>
        <small>${m.confidence}%</small>
      </div>
      <div class="mc-foot"><span>${esc(m.note)}</span><span style="white-space:nowrap">${esc(m.last)}</span></div>
    </div>`;
  };

  /* ============================================================
     COMPARE CARD (body progress photo comparison)
     ============================================================ */
  U.compareCard = function (bp) {
    const stops = bp.sessions;
    return `<div class="card">
      <div class="card-head">
        <div>
          <div class="card-title">Body progress</div>
          <div class="card-sub">AI-aligned photo comparison · computer vision</div>
        </div>
        <div class="segmented" id="cmpViews">
          ${bp.views.map((v, i) => `<button class="seg-btn${i === 0 ? " active" : ""}" data-view="${v}">${v}</button>`).join("")}
        </div>
      </div>
      <div class="card-body">
        <div class="compare-stage" id="cmpStage"></div>

        <div class="timeline" id="cmpTimeline">
          <div class="tl-track">
            <div class="tl-fill" id="tlFill"></div>
            ${stops.map((s, i) => `<div class="tl-stop" data-i="${i}" style="left:${(i / (stops.length - 1)) * 100}%"><i></i><span>${esc(s.label.replace(" 2026", ""))}</span></div>`).join("")}
          </div>
          <input type="range" class="tl-input" id="tlInput" min="0" max="${stops.length - 2}" step="1" value="${stops.length - 2}" aria-label="Comparison timeline">
        </div>

        <div class="compare-meta">
          <span class="chip chip-good">${I("check", 12)} ${esc(bp.reliability.label)}</span>
          <span class="chip">${I("target", 12)} Pose match ${bp.reliability.poseMatch}%</span>
          <span class="chip">${I("camera", 12)} ${bp.reliability.photoSessions} photo sessions</span>
          <label class="switch" style="margin-left:auto" title="Overlay outlines">
            <input type="checkbox" id="cmpOverlay"><span class="knob"></span>
          </label>
          <span class="muted" style="font-size:12px">Overlay</span>
        </div>
      </div>
    </div>`;
  };

  U.initCompare = function (root, bp) {
    const stage = root.querySelector("#cmpStage");
    const fill = root.querySelector("#tlFill");
    const input = root.querySelector("#tlInput");
    const stops = [...root.querySelectorAll(".tl-stop")];
    let view = bp.views[0];

    function renderStage() {
      const idx = +input.value;
      const before = bp.sessions[idx], after = bp.sessions[idx + 1];
      const overlay = root.querySelector("#cmpOverlay").checked;
      const stageEl = root.querySelector("#cmpStage");
      stageEl.classList.toggle("overlay-mode", overlay);
      if (overlay) {
        stageEl.innerHTML = U.overlayStage(before, after, view) +
          `<div class="row" style="justify-content:center;gap:14px;margin-top:8px">
            <span class="lg-item"><span class="lg-swatch" style="background:#5a6373"></span>${esc(before.label)}</span>
            <span class="lg-item"><span class="lg-swatch" style="background:var(--accent)"></span>${esc(after.label)}</span>
          </div>`;
      } else {
        stageEl.innerHTML =
          U.photoPane(before, view, { pose: false }) +
          `<div class="compare-div"><div class="cd-inner">${I("compare", 16)}</div><small>aligned</small></div>` +
          U.photoPane(after, view, { pose: true });
      }
      fill.style.width = ((idx + 1) / (bp.sessions.length - 1)) * 100 + "%";
      stops.forEach((s, i) => s.classList.toggle("reached", i <= idx + 1));
    }

    root.querySelectorAll("#cmpViews .seg-btn").forEach(b => {
      b.addEventListener("click", () => {
        root.querySelectorAll("#cmpViews .seg-btn").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        view = b.getAttribute("data-view");
        renderStage();
      });
    });
    input.addEventListener("input", renderStage);
    root.querySelector("#cmpOverlay").addEventListener("change", renderStage);
    renderStage();
  };

  /* ============================================================
     SECTION HEAD / small helpers
     ============================================================ */
  U.sectionHead = (title, sub, right) => `<div class="section-head">
    <div class="section-title">${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ""}</div>
    ${right || ""}
  </div>`;

  U.chip = (text, cls, icon) => `<span class="chip ${cls || ""}">${icon ? I(icon, 12) : ""}${esc(text)}</span>`;

  /* ============================================================
     COUNT-UP + ENTRANCE ANIMATIONS
     ============================================================ */
  U.countUp = function (el, target, decimals) {
    const start = performance.now(), dur = 800;
    function frame(t) {
      const p = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      const v = target * e;
      el.textContent = decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString("en-IN");
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };

  U.animateIn = function (root) {
    const chartLib = window.ForgeCharts;
    root.querySelectorAll("[data-count]").forEach(el => {
      const t = parseFloat(el.getAttribute("data-count")), d = parseInt(el.getAttribute("data-dec") || "0", 10);
      chartLib.whenVisible(el, () => U.countUp(el, t, d));
    });
    root.querySelectorAll(".progress-fill[data-w]").forEach(el => {
      const w = el.getAttribute("data-w");
      chartLib.whenVisible(el, () => requestAnimationFrame(() => { el.style.width = w + "%"; }));
    });
    root.querySelectorAll(".cr-anim").forEach(el => {
      const off = el.getAttribute("data-cr");
      chartLib.whenVisible(el, () => requestAnimationFrame(() => { el.style.strokeDashoffset = off; }));
    });
    root.querySelectorAll(".hbar-fill[data-hb]").forEach(el => {
      const w = el.getAttribute("data-hb");
      chartLib.whenVisible(el, () => requestAnimationFrame(() => { el.style.width = w + "%"; }));
    });
  };

  /* ============================================================
     TOAST
     ============================================================ */
  U.toast = function (msg, type) {
    const wrap = document.getElementById("toasts");
    const el = document.createElement("div");
    el.className = "toast" + (type === "warn" ? " t-warn" : "");
    el.innerHTML = I(type === "warn" ? "alert" : "check", 15) + `<span>${esc(msg)}</span>`;
    wrap.appendChild(el);
    setTimeout(() => {
      el.classList.add("out");
      setTimeout(() => el.remove(), 260);
    }, 2600);
  };

  window.ForgeUI = U;
})();
