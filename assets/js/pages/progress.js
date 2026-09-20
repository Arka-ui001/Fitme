/* ForgeAI — Progress page (timeline-based transformation) */
(function () {
  window.Forge = window.Forge || {};
  Forge.pages = Forge.pages || {};

  const RANGES = [
    { id: "1m", label: "1 month", days: 31 },
    { id: "3m", label: "3 months", days: 92 },
    { id: "6m", label: "6 months", days: 183 },
    { id: "all", label: "All time", days: 9999 }
  ];

  Forge.pages.progress = async function (root) {
    const U = ForgeUI, I = (n, s, c) => ForgeIcons.svg(n, s, c);
    const [prog, bp] = await Promise.all([Forge.api.getProgress(), Forge.api.getBodyProgress()]);
    let range = "all";

    const pts = prog.weight.points || [];
    const hasWeight = pts.length >= 2;
    const start = hasWeight ? pts[0].v : 0;
    const cur = hasWeight ? pts[pts.length - 1].v : 0;
    const change = hasWeight ? (cur - start).toFixed(1) : "0.0";
    const weeks = hasWeight ? Math.max(1, ((pts.length - 1) / 2).toFixed(0)) : 1;
    const perWeek = hasWeight ? ((cur - start) / weeks).toFixed(2) : "0.00";

    const measRows = (prog.measurements.rows || []).map(r => {
      const d = +(r.curr - r.prev).toFixed(1);
      const cls = d === 0 ? "chip" : d > 0 ? "chip chip-acc" : "chip chip-info";
      const sign = d > 0 ? "+" : "";
      return `<tr>
        <td><strong>${r.site}</strong></td>
        <td class="num muted">${r.prev.toFixed(1)} cm</td>
        <td class="num">${r.curr.toFixed(1)} cm</td>
        <td><span class="${cls}">${sign}${d.toFixed(1)} cm</span></td>
      </tr>`;
    }).join("");

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>Progress</h1>
          <p class="sub">Body transformation timeline</p>
        </div>
        <div class="page-actions">
          <button class="btn" id="btnLogWeight">${I("scale", 14)} Log weight</button>
          <button class="btn btn-primary" id="btnLogMeas">${I("ruler", 14)} Log measurements</button>
        </div>
      </div>

      ${hasWeight ? `
      <div class="stat-chips">
        <div class="s-chip"><small>Current weight</small><strong>${cur} kg</strong></div>
        <div class="s-chip"><small>Change</small><strong>${change > 0 ? "+" : ""}${change} kg <span class="acc">${I("upright", 12)}</span></strong></div>
        <div class="s-chip"><small>Avg rate</small><strong>${perWeek} kg / wk</strong></div>
      </div>

      <div class="section">
        <div class="card chart-card">
          <div class="card-head"><div><div class="card-title">Weight trend</div><div class="card-sub">Measurements · kg</div></div>
            <div class="segmented" id="rangeSeg">
              ${RANGES.map(r => `<button class="seg-btn${r.id === range ? " active" : ""}" data-r="${r.id}">${r.label}</button>`).join("")}
            </div></div>
          <div class="card-body"><div id="chWeight"></div></div>
        </div>
      </div>` : `
      <div class="card" style="text-align:center;padding:48px 24px">
        <div class="card-body">
          <div style="font-size:40px;margin-bottom:12px">${I("scale", 40)}</div>
          <h3>No weight data yet</h3>
          <p class="sub mt">Click <strong>Log weight</strong> to record your first weigh-in.</p>
        </div>
      </div>`}

      <div class="section grid g2">
        <div class="card">
          <div class="card-head"><div><div class="card-title">Body measurements</div>
            <div class="card-sub">${prog.measurements.previous || "—"} → ${prog.measurements.current || "—"}</div></div>
            <span class="chip">${I("ruler", 12)} cm</span></div>
          <div class="card-body tbl-wrap">
            ${measRows ? `<table class="tbl">
              <thead><tr><th>Site</th><th>Previous</th><th>Now</th><th>Δ</th></tr></thead>
              <tbody>${measRows}</tbody>
            </table>` : `<div style="padding:24px;text-align:center;color:var(--text-3)">No measurements yet. Click <strong>Log measurements</strong> to start.</div>`}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div><div class="card-title">AI observations</div>
            <div class="card-sub">Generated from your logged data</div></div>
            <span class="muted">${I("spark", 15)}</span></div>
          <div class="card-body">
            <div class="obs-list">
              ${(prog.observations || []).length > 0 ? prog.observations.map(o => `
                <div class="obs-item">
                  <span class="obs-ico">${I("spark", 15)}</span>
                  <div class="obs-body">
                    <strong>${o.title}</strong>
                    <p>${o.text}</p>
                    <div class="row" style="gap:6px">
                      ${o.conf != null ? U.chip(o.conf + "% confidence", "chip-acc") : ""}
                      ${o.date ? U.chip(o.date, "") : ""}
                    </div>
                  </div>
                </div>`).join("") : `<div style="padding:24px;text-align:center;color:var(--text-3)">No AI observations yet. Log more data to unlock insights.</div>`}
            </div>
          </div>
        </div>
      </div>

      ${bp.sessions.length > 0 ? `
      <div class="section">
        ${U.sectionHead("Progress photos", "Monthly sets · front / side / back available in the dashboard comparison",
          `<a class="btn btn-ghost btn-sm" href="#/dashboard">Open comparison ${I("chevr", 13)}</a>`)}
        <div class="photo-strip">
          ${bp.sessions.map(s => `
            <div class="photo-thumb">
              <span class="pt-date">${(s.label || "").replace(" 2026", " '26")}</span>
              <div class="pt-frame">${U.figure("Front", { height: 150 })}</div>
              <div class="pt-note"><span>${s.weight} kg</span><span class="acc">${I("scan", 12)}</span></div>
            </div>`).join("")}
        </div>
      </div>` : ""}
    `;

    /* ---- mount weight chart ---- */
    if (hasWeight) {
      const C = ForgeCharts;
      const mount = (sel) => {
        const r = RANGES.find(x => x.id === range);
        const now = new Date();
        const filtered = pts.filter(p => {
          // Parse "MM-DD" or "Mon DD" type labels
          try {
            const parts = p.d.split("-");
            if (parts.length === 2 && !isNaN(parts[0])) {
              const d = new Date(now.getFullYear(), parseInt(parts[0]) - 1, parseInt(parts[1]));
              return (now - d) / 86400000 <= r.days;
            }
          } catch(e) {}
          return true;
        });
        const data = filtered.length > 1 ? filtered : pts;
        const old = root.querySelector(sel);
        if (!old) return;
        const fresh = document.createElement("div");
        fresh.id = old.id;
        old.replaceWith(fresh);
        C.line(fresh, {
          labels: data.map(p => p.d), height: 235,
          yMin: Math.min(...data.map(p => p.v)) - 0.8, yMax: Math.max(...data.map(p => p.v)) + 0.6,
          yFmt: v => v.toFixed(1),
          series: [{ name: "Weight", color: "accent", values: data.map(p => p.v) }]
        });
      };

      mount("#chWeight");
      root.querySelectorAll("#rangeSeg .seg-btn").forEach(b => {
        b.addEventListener("click", () => {
          root.querySelectorAll("#rangeSeg .seg-btn").forEach(x => x.classList.remove("active"));
          b.classList.add("active");
          range = b.getAttribute("data-r");
          mount("#chWeight");
        });
      });
    }

    /* ---- Log Weight modal ---- */
    root.querySelector("#btnLogWeight").addEventListener("click", () => {
      if (!Forge.api.mode.includes("remote")) {
        ForgeUI.toast("Connect backend to log weight");
        return;
      }
      const html = `
        <div id="weightModalOverlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)">
          <div class="card" style="width:100%;max-width:360px;padding:24px;background:var(--bg)">
            <div class="card-head" style="margin-bottom:16px"><div class="card-title">Log Weight</div></div>
            <div style="display:flex;flex-direction:column;gap:12px">
              <label>
                <div class="muted" style="margin-bottom:4px;font-size:13px">Weight (kg)</div>
                <input type="number" id="wVal" style="width:100%;padding:10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--text);font-family:inherit;font-size:18px" value="${cur || 63}" step="0.1" autofocus>
              </label>
              <label>
                <div class="muted" style="margin-bottom:4px;font-size:13px">Notes (optional)</div>
                <input type="text" id="wNotes" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--text);font-family:inherit" placeholder="e.g. morning, fasted">
              </label>
            </div>
            <div class="row spread mt" style="margin-top:24px">
              <button class="btn btn-ghost" id="wCancel">Cancel</button>
              <button class="btn btn-primary" id="wSubmit">Log</button>
            </div>
          </div>
        </div>
      `;
      const overlay = document.createElement("div");
      overlay.innerHTML = html;
      document.body.appendChild(overlay.firstElementChild);
      const modal = document.getElementById("weightModalOverlay");
      const cleanup = () => modal.remove();
      document.getElementById("wCancel").addEventListener("click", cleanup);
      modal.addEventListener("click", (e) => { if (e.target === modal) cleanup(); });
      document.getElementById("wSubmit").addEventListener("click", async () => {
        const w = document.getElementById("wVal").value;
        const notes = document.getElementById("wNotes").value.trim();
        if (!w || parseFloat(w) < 20) { ForgeUI.toast("Enter a valid weight", "warn"); return; }
        document.getElementById("wSubmit").disabled = true;
        document.getElementById("wSubmit").innerHTML = '<span class="spinner" style="display:inline-block;width:14px;height:14px"></span>';
        try {
          await Forge.api.logWeight(w, notes);
          ForgeUI.toast("Weight logged!");
          cleanup();
          Forge.pages.progress(root);
        } catch (err) {
          ForgeUI.toast("Failed to log weight", "warn");
          console.error(err);
          cleanup();
        }
      });
    });

    /* ---- Log Measurements modal ---- */
    root.querySelector("#btnLogMeas").addEventListener("click", () => {
      if (!Forge.api.mode.includes("remote")) {
        ForgeUI.toast("Connect backend to log measurements");
        return;
      }
      const fields = [
        ["shoulders", "Shoulders (cm)"], ["chest", "Chest (cm)"], ["waist", "Waist (cm)"],
        ["left_arm", "Left Arm (cm)"], ["right_arm", "Right Arm (cm)"],
        ["left_thigh", "Left Thigh (cm)"], ["right_thigh", "Right Thigh (cm)"], ["neck", "Neck (cm)"]
      ];
      const html = `
        <div id="measModalOverlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);overflow-y:auto">
          <div class="card" style="width:100%;max-width:420px;padding:24px;background:var(--bg);margin:20px">
            <div class="card-head" style="margin-bottom:16px"><div class="card-title">Log Measurements</div></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              ${fields.map(([k, label]) => `
                <label>
                  <div class="muted" style="margin-bottom:4px;font-size:13px">${label}</div>
                  <input type="number" data-meas="${k}" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--text);font-family:inherit" placeholder="—" step="0.1">
                </label>
              `).join("")}
            </div>
            <div class="row spread mt" style="margin-top:24px">
              <button class="btn btn-ghost" id="mCancel">Cancel</button>
              <button class="btn btn-primary" id="mSubmit">Log</button>
            </div>
          </div>
        </div>
      `;
      const overlay = document.createElement("div");
      overlay.innerHTML = html;
      document.body.appendChild(overlay.firstElementChild);
      const modal = document.getElementById("measModalOverlay");
      const cleanup = () => modal.remove();
      document.getElementById("mCancel").addEventListener("click", cleanup);
      modal.addEventListener("click", (e) => { if (e.target === modal) cleanup(); });
      document.getElementById("mSubmit").addEventListener("click", async () => {
        const data = {};
        let hasAny = false;
        modal.querySelectorAll("[data-meas]").forEach(inp => {
          if (inp.value) { data[inp.dataset.meas] = inp.value; hasAny = true; }
        });
        if (!hasAny) { ForgeUI.toast("Fill in at least one measurement", "warn"); return; }
        document.getElementById("mSubmit").disabled = true;
        document.getElementById("mSubmit").innerHTML = '<span class="spinner" style="display:inline-block;width:14px;height:14px"></span>';
        try {
          await Forge.api.logMeasurements(data);
          ForgeUI.toast("Measurements logged!");
          cleanup();
          Forge.pages.progress(root);
        } catch (err) {
          ForgeUI.toast("Failed to log measurements", "warn");
          console.error(err);
          cleanup();
        }
      });
    });
  };
})();
