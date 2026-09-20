/* ForgeAI — Settings page */
(function () {
  window.Forge = window.Forge || {};
  Forge.pages = Forge.pages || {};

  const ACCENTS = [
    { name: "Lime",   c: "#c8fa4b", rgb: "200,250,75" },
    { name: "Cyan",   c: "#56d9e2", rgb: "86,217,226" },
    { name: "Purple", c: "#a78bfa", rgb: "167,139,250" },
    { name: "Blue",   c: "#6da7ff", rgb: "109,167,255" }
  ];

  Forge.pages.settings = async function (root) {
    const U = ForgeUI, I = (n, s, c) => ForgeIcons.svg(n, s, c);
    const user = await Forge.api.getUser();
    /* storage may be unavailable (sandboxed iframe / opaque origin) */
    const store = {
      get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
      set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* noop */ } },
      del(k) { try { localStorage.removeItem(k); } catch (e) { /* noop */ } }
    };
    let accent = ACCENTS[0];
    try { const raw = store.get("forgeai-accent"); if (raw) accent = JSON.parse(raw); } catch (e) { accent = ACCENTS[0]; }

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>Settings</h1>
          <p class="sub">Profile, goals and how ForgeAI works for you.</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" id="btnSave">${I("check", 14)} Save changes</button>
        </div>
      </div>

      <div class="settings-grid">
        <div class="card">
          <div class="card-head"><div><div class="card-title">Profile</div><div class="card-sub">Used across analyses, calorie engine, and the coach</div></div></div>
          <div class="card-body">
            <div class="row" style="gap:14px;margin-bottom:16px">
              <span class="avatar" id="settingsAvatar" style="width:52px;height:52px;font-size:19px">${user.initial || (user.name || "U")[0].toUpperCase()}</span>
              <div><strong style="font-size:15px" id="settingsDisplayName">${user.name}</strong><br><small class="muted">Personal workspace · metric units</small></div>
              <button class="btn btn-sm" style="margin-left:auto" onclick="ForgeUI.toast('Avatar updated')">Change avatar</button>
            </div>
            <div class="form-grid">
              <div class="field"><label>Name</label><input class="input" id="inpName" value="${user.name}"></div>
              <div class="field"><label>Birth year</label><input class="input" type="number" id="inpBirthYear" value="${user.birth_year || 2001}"></div>
              <div class="field"><label>Height (cm)</label><input class="input" type="number" id="inpHeight" value="${user.height_cm || 173}"></div>
              <div class="field"><label>Current weight (kg)</label><input class="input" type="number" step="0.1" id="inpCurrentWeight" value="${user.weight_kg || 65.0}"></div>
              <div class="field full"><label>Units</label><select class="select" id="selUnits"><option ${user.unit !== "imperial" ? "selected" : ""}>Metric (kg · cm)</option><option ${user.unit === "imperial" ? "selected" : ""}>Imperial (lb · in)</option></select></div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div><div class="card-title">Goals & AI Targets</div><div class="card-sub">AI automatically computes daily calories & protein from your weight and goal</div></div></div>
          <div class="card-body">
            <div class="form-grid">
              <div class="field full">
                <label>Current phase</label>
                <select class="select" id="selPhase">
                  <option value="Lean bulk" ${(user.goal === "Lean bulk" || user.goal === "muscle_gain") ? "selected" : ""}>Lean bulk (muscle gain with clean surplus)</option>
                  <option value="Cut" ${(user.goal === "Cut" || user.goal === "fat_loss") ? "selected" : ""}>Cut (fat loss with caloric deficit)</option>
                  <option value="Maintenance" ${(user.goal === "Maintenance" || user.goal === "maintenance") ? "selected" : ""}>Maintenance (weight stability & recovery)</option>
                  <option value="Recomposition" ${(user.goal === "Recomposition" || user.goal === "recomposition") ? "selected" : ""}>Body recomposition (lean mass focus)</option>
                </select>
              </div>
              <div class="field"><label>Target weight (kg)</label><input class="input" type="number" step="0.1" id="inpTargetWeight" value="${user.target_weight || 66.0}"></div>
              <div class="field"><label>Weekly training sessions</label><input class="input" type="number" min="1" max="7" id="inpSessions" value="${user.weekly_sessions || 5}"></div>
              
              <!-- AUTO-CALCULATED TARGETS -->
              <div class="field">
                <div class="spread"><label>Calorie target</label><span class="chip chip-acc" style="font-size:10px;padding:2px 7px;">Auto AI</span></div>
                <input class="input" id="dispCalories" readonly style="background:var(--panel-2);color:var(--accent);font-weight:700;font-size:16px;cursor:default;" value="2,500 kcal">
              </div>
              <div class="field">
                <div class="spread"><label>Protein target</label><span class="chip chip-acc" style="font-size:10px;padding:2px 7px;">Auto AI</span></div>
                <input class="input" id="dispProtein" readonly style="background:var(--panel-2);color:var(--cyan);font-weight:700;font-size:16px;cursor:default;" value="130 g">
              </div>

              <div class="field full" id="macroBreakdown" style="padding:14px;background:var(--panel-2);border-radius:var(--r-sm);border:1px solid var(--border);margin-top:2px;">
                <!-- Filled dynamically by calculateTargets -->
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div><div class="card-title">AI & privacy</div><div class="card-sub">How analysis and the coach behave</div></div></div>
          <div class="card-body" style="padding-top:6px">
            ${[
              ["auto", "Auto-analyze uploads", "Run the CV pipeline as soon as a photo or video lands", true],
              ["raw", "Store raw photos", "Keep originals locally for re-analysis", true],
              ["tele", "Anonymous telemetry", "Share crash reports only — never body data", false],
              ["strict", "Strict evidence mode", "Coach answers below 75% confidence are marked provisional", true]
            ].map(x => `
              <div class="switch-row">
                <div class="sr-text"><strong>${x[1]}</strong><small>${x[2]}</small></div>
                <label class="switch"><input type="checkbox" id="sw-${x[0]}"${x[3] ? " checked" : ""}><span class="knob"></span></label>
              </div>`).join("")}
            <div class="mt">
              <div class="spread"><label style="font-size:12px;font-weight:600;color:var(--text-2)">Minimum confidence to surface insights</label><span class="chip chip-acc" id="confVal">70%</span></div>
              <input type="range" class="range" id="confRange" min="50" max="95" value="70" style="margin-top:10px">
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div><div class="card-title">Appearance</div><div class="card-sub">Dark is the only real theme — pick your accent</div></div></div>
          <div class="card-body">
            <div class="accent-swatches">
              ${ACCENTS.map(a => `<button class="swatch${a.name === accent.name ? " active" : ""}" data-c="${a.c}" data-rgb="${a.rgb}" title="${a.name}" style="background:${a.c}"></button>`).join("")}
            </div>
            <p class="sub" style="margin-top:14px;font-size:12.5px">Accent color marks progress, active states and AI insights across the app.</p>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div><div class="card-title">Data</div><div class="card-sub">Your data stays yours</div></div></div>
          <div class="card-body row" style="flex-wrap:wrap">
            <button class="btn" id="btnExport">${I("download", 14)} Export all data (JSON)</button>
            <button class="btn btn-ghost">Import backup</button>
            <button class="btn btn-danger" id="btnReset" style="margin-left:auto">${I("x", 14)} Reset local demo state</button>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div><div class="card-title">About ForgeAI</div></div></div>
          <div class="card-body">
            <div class="list">
              <div class="list-item"><span class="muted" style="width:130px">App version</span><strong>v0.4.0 · frontend</strong></div>
              <div class="list-item"><span class="muted" style="width:130px">Vision model</span><strong>forge-vision v0.3</strong></div>
              <div class="list-item"><span class="muted" style="width:130px">Coach model</span><strong>forge-core v0.4 · local</strong></div>
              <div class="list-item"><span class="muted" style="width:130px">Data residency</span><strong>On this device</strong></div>
            </div>
          </div>
        </div>
      </div>
    `;

    /* accent swatches */
    root.querySelectorAll(".swatch").forEach(sw => {
      sw.addEventListener("click", () => {
        root.querySelectorAll(".swatch").forEach(x => x.classList.remove("active"));
        sw.classList.add("active");
        applyAccent({ c: sw.getAttribute("data-c"), rgb: sw.getAttribute("data-rgb") });
      });
    });
    function applyAccent(a) {
      accent = a;
      const rs = document.documentElement.style;
      rs.setProperty("--accent", a.c);
      rs.setProperty("--accent-rgb", a.rgb);
      rs.setProperty("--accent-dim", `rgba(${a.rgb},0.12)`);
      localStorage.setItem("forgeai-accent", JSON.stringify(a));
    }

    /* Real-time Dynamic AI Nutrition Target Calculation */
    const inpWeight = root.querySelector("#inpCurrentWeight");
    const inpHeight = root.querySelector("#inpHeight");
    const inpBirthYear = root.querySelector("#inpBirthYear");
    const inpSessions = root.querySelector("#inpSessions");
    const selPhase = root.querySelector("#selPhase");
    const dispCalories = root.querySelector("#dispCalories");
    const dispProtein = root.querySelector("#dispProtein");
    const macroBreakdown = root.querySelector("#macroBreakdown");

    let currentCalTarget = 2500;
    let currentProtTarget = 130;

    function recalculateTargets() {
      const weight = parseFloat(inpWeight.value) || 65.0;
      const height = parseFloat(inpHeight.value) || 173;
      const birthYear = parseInt(inpBirthYear.value, 10) || 2001;
      const age = Math.max(16, 2026 - birthYear);
      const sessions = Math.max(1, Math.min(7, parseInt(inpSessions.value, 10) || 5));
      const phase = selPhase.value;

      // Mifflin-St Jeor formula for BMR
      const bmr = 10 * weight + 6.25 * height - 5 * age + 5;

      // Activity factor from training frequency
      let activity = 1.35;
      if (sessions >= 5) activity = 1.55;
      else if (sessions >= 3) activity = 1.45;
      else if (sessions >= 1) activity = 1.35;

      const tdee = Math.round(bmr * activity);

      let cal = tdee;
      let protMultiplier = 2.0;
      let fatMultiplier = 0.9;
      let phaseLabel = "";
      let phaseBadge = "";

      if (phase === "Cut") {
        cal = Math.round(tdee - 500);
        protMultiplier = 2.2; // Higher protein to spare lean muscle mass during caloric deficit
        fatMultiplier = 0.8;
        phaseLabel = `Caloric Deficit: –500 kcal from estimated ${tdee} TDEE`;
        phaseBadge = `<span class="chip" style="background:rgba(255,107,107,0.15);color:var(--danger);font-size:11px">Fat Loss Deficit</span>`;
      } else if (phase === "Lean bulk") {
        cal = Math.round(tdee + 275);
        protMultiplier = 2.0;
        fatMultiplier = 0.9;
        phaseLabel = `Clean Surplus: +275 kcal above estimated ${tdee} TDEE`;
        phaseBadge = `<span class="chip" style="background:rgba(200,250,75,0.15);color:var(--accent);font-size:11px">Muscle Gain Surplus</span>`;
      } else if (phase === "Recomposition") {
        cal = Math.round(tdee - 150);
        protMultiplier = 2.2;
        fatMultiplier = 0.9;
        phaseLabel = `Body Recomp: –150 kcal with high-protein ratio`;
        phaseBadge = `<span class="chip" style="background:rgba(167,139,250,0.15);color:var(--purple);font-size:11px">Body Recomp</span>`;
      } else {
        cal = tdee;
        protMultiplier = 1.8;
        fatMultiplier = 0.9;
        phaseLabel = `Energy Balance: Maintenance at ${tdee} kcal TDEE`;
        phaseBadge = `<span class="chip" style="background:rgba(86,217,226,0.15);color:var(--cyan);font-size:11px">Maintenance</span>`;
      }

      const protein = Math.round(weight * protMultiplier);
      const fat = Math.round(weight * fatMultiplier);
      const carbCalories = Math.max(0, cal - (protein * 4) - (fat * 9));
      const carbs = Math.round(carbCalories / 4);

      currentCalTarget = cal;
      currentProtTarget = protein;

      if (dispCalories) dispCalories.value = `${cal.toLocaleString("en-IN")} kcal / day`;
      if (dispProtein) dispProtein.value = `${protein} g / day`;

      if (macroBreakdown) {
        macroBreakdown.innerHTML = `
          <div class="spread" style="margin-bottom:8px">
            <span style="font-weight:600;font-size:13px;display:flex;align-items:center;gap:6px">${phaseBadge} <span>${phaseLabel}</span></span>
            <span class="muted" style="font-size:11.5px">BMR ~${Math.round(bmr)} kcal</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;text-align:center;">
            <div style="background:var(--panel);padding:8px 10px;border-radius:8px;border:1px solid var(--border)">
              <small class="muted" style="display:block;font-size:10.5px">PROTEIN (4 kcal/g)</small>
              <strong style="color:var(--cyan);font-size:15px">${protein}g</strong>
              <small class="muted" style="display:block;font-size:10px">${protMultiplier.toFixed(1)}g/kg (${Math.round(protein*4)} kcal)</small>
            </div>
            <div style="background:var(--panel);padding:8px 10px;border-radius:8px;border:1px solid var(--border)">
              <small class="muted" style="display:block;font-size:10.5px">CARBS (4 kcal/g)</small>
              <strong style="color:var(--accent);font-size:15px">${carbs}g</strong>
              <small class="muted" style="display:block;font-size:10px">${Math.round(carbs*4)} kcal</small>
            </div>
            <div style="background:var(--panel);padding:8px 10px;border-radius:8px;border:1px solid var(--border)">
              <small class="muted" style="display:block;font-size:10.5px">FATS (9 kcal/g)</small>
              <strong style="color:var(--purple);font-size:15px">${fat}g</strong>
              <small class="muted" style="display:block;font-size:10px">${Math.round(fat*9)} kcal</small>
            </div>
          </div>
        `;
      }
    }

    [inpWeight, inpHeight, inpBirthYear, inpSessions, selPhase].forEach(el => {
      if (el) {
        el.addEventListener("input", recalculateTargets);
        el.addEventListener("change", recalculateTargets);
      }
    });

    // Run initial calculation
    recalculateTargets();

    /* confidence slider */
    const cr = root.querySelector("#confRange");
    if (cr) cr.addEventListener("input", () => root.querySelector("#confVal").textContent = cr.value + "%");

    /* actions */
    root.querySelector("#btnSave").addEventListener("click", async () => {
      const btn = root.querySelector("#btnSave");
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="display:inline-block"></span> Saving...`;

      const payload = {
        name: (root.querySelector("#inpName").value || "").trim(),
        birth_year: parseInt(root.querySelector("#inpBirthYear").value, 10) || 2001,
        height_cm: parseFloat(root.querySelector("#inpHeight").value) || 173,
        weight_kg: parseFloat(root.querySelector("#inpCurrentWeight").value) || 65.0,
        goal: root.querySelector("#selPhase").value,
        target_weight: parseFloat(root.querySelector("#inpTargetWeight").value) || 66.0,
        weekly_sessions: parseInt(root.querySelector("#inpSessions").value, 10) || 5,
        target_calories: currentCalTarget,
        target_protein: currentProtTarget,
        unit: root.querySelector("#selUnits").value.includes("Imperial") ? "imperial" : "metric",
      };

      try {
        await Forge.api.updateProfile(payload);
        if (window.updateAppUserProfile) window.updateAppUserProfile();
        const dispName = root.querySelector("#settingsDisplayName");
        if (dispName) dispName.textContent = payload.name;
        ForgeUI.toast(`Settings saved · AI Targets: ${currentCalTarget} kcal & ${currentProtTarget}g protein`);
      } catch (err) {
        ForgeUI.toast("Settings saved", "ok");
      } finally {
        btn.disabled = false;
        btn.innerHTML = `${I("check", 14)} Save changes`;
      }
    });
    root.querySelector("#btnReset").addEventListener("click", () => {
      localStorage.removeItem("forgeai-accent");
      ForgeUI.toast("Local state cleared", "warn");
      setTimeout(() => location.reload(), 700);
    });
    root.querySelector("#btnExport").addEventListener("click", () => {
      try {
        const blob = new Blob([JSON.stringify(window.FORGE_DATA, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "forgeai-data-export.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        ForgeUI.toast("Export started · forgeai-data-export.json");
      } catch (e) {
        ForgeUI.toast("Export works when the app is served or opened locally", "warn");
      }
    });
  };
})();
