/* ForgeAI — Dashboard page */
(function () {
  window.Forge = window.Forge || {};
  Forge.pages = Forge.pages || {};

  Forge.pages.dashboard = async function (root) {
    const U = ForgeUI, I = (n, s, c) => ForgeIcons.svg(n, s, c);
    const [dash, bp, muscles, training, nutrition] = await Promise.all([
      Forge.api.getDashboard(), Forge.api.getBodyProgress(), Forge.api.getMuscles(),
      Forge.api.getTraining(), Forge.api.getNutrition()
    ]);

    const hr = new Date().getHours();
    const greet = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
    const name = (await Forge.api.getUser()).name;
    const m = dash.metrics;
    const todayStr = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long" });

    const rings = nutrition.today;
    const calTarget = rings.calories.target || 2500;
    const calPct = calTarget > 0 ? Math.min(100, Math.round(rings.calories.value / calTarget * 100)) : 0;

    // Safe macro display
    const macroData = rings.macros || [];
    const proteinMacro = macroData.find(m => m.key === "protein") || { value: 0, target: 130 };
    const carbsMacro = macroData.find(m => m.key === "carbs" || m.key === "carbohydrates") || { value: 0, target: 340 };
    const fatMacro = macroData.find(m => m.key === "fat") || { value: 0, target: 80 };

    const protPct = proteinMacro.target > 0 ? Math.min(100, Math.round(proteinMacro.value / proteinMacro.target * 100)) : 0;
    const carbPct = carbsMacro.target > 0 ? Math.min(100, Math.round(carbsMacro.value / carbsMacro.target * 100)) : 0;
    const fatPct = fatMacro.target > 0 ? Math.min(100, Math.round(fatMacro.value / fatMacro.target * 100)) : 0;

    const protRemaining = Math.max(0, (proteinMacro.target || 130) - (proteinMacro.value || 0));
    const kcalRemaining = Math.max(0, calTarget - rings.calories.value);

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>${greet}, ${esc(name)}.</h1>
          <p class="sub">Here's how your body and training are progressing.</p>
        </div>
        <div class="page-actions">
          <a class="btn" href="#/workouts">${I("plus", 15)} Log workout</a>
          <a class="btn btn-primary" href="#/coach">${I("spark", 15)} Ask Coach</a>
        </div>
      </div>

      <!-- ===== METRIC CARDS ===== -->
      <div class="metric-grid">
        ${U.metricCard({ label: "Bodyweight", icon: "trend", value: m.bodyweight.value, unit: m.bodyweight.unit, decimals: 1, delta: m.bodyweight.delta, spark: m.bodyweight.spark && m.bodyweight.spark.length > 1 ? m.bodyweight.spark : null })}
        ${U.metricCard({ label: "Protein", icon: "utensils", value: m.protein.value, unit: m.protein.unit, progress: m.protein.progress, targetLabel: m.protein.targetLabel })}
        ${U.metricCard({ label: "Calories", icon: "flame", value: m.calories.value, unit: m.calories.unit, progress: m.calories.progress, targetLabel: m.calories.targetLabel })}
        ${U.metricCard({ label: "Training", icon: "dumbbell", value: m.training.value, unit: m.training.unit, progress: m.training.progress, targetLabel: m.training.targetLabel })}
      </div>

      <!-- ===== AI INSIGHT ===== -->
      <div class="section">${U.aiInsightCard(dash.insight)}</div>

      <!-- ===== BODY PROGRESS ===== -->
      ${bp.sessions.length > 0 ? `<div class="section">${U.compareCard(bp)}</div>` : ""}

      <!-- ===== MUSCLE DEVELOPMENT ===== -->
      ${muscles && muscles.length > 0 ? `
      <div class="section">
        ${U.sectionHead("Muscle development",
          "Qualitative trends from photo comparisons — shown only where the data supports them",
          `<span class="chip">${I("camera", 12)} Last comparison</span>`)}
        <div class="muscle-grid">${muscles.map(mu => U.muscleCard(mu)).join("")}</div>
      </div>` : ""}

      <!-- ===== TRAINING ANALYTICS ===== -->
      <div class="section">
        ${U.sectionHead("Training analytics", "All values from your training log")}
        <div class="grid g2">
          <div class="card chart-card">
            <div class="card-head"><div><div class="card-title">Weekly training volume</div><div class="card-sub">Tonnes lifted per week</div></div></div>
            <div class="card-body"><div id="chVolume"></div></div>
          </div>
          <div class="card chart-card">
            <div class="card-head"><div><div class="card-title">Strength progression</div><div class="card-sub">${esc(training.strength.note)}</div></div>
              <div class="legend">
                ${(training.strength.series || []).map(s => `<span class="lg-item"><span class="lg-swatch" style="background:${({ accent: "var(--accent)", cyan: "var(--cyan)", blue: "var(--blue)" })[s.color] || s.color}"></span>${esc(s.name)}</span>`).join("")}
              </div></div>
            <div class="card-body"><div id="chStrength"></div></div>
          </div>
          <div class="card chart-card">
            <div class="card-head"><div><div class="card-title">Workout consistency</div><div class="card-sub">Planned vs completed</div></div></div>
            <div class="card-body"><div id="chConsist"></div></div>
          </div>
          <div class="card chart-card">
            <div class="card-head"><div><div class="card-title">Muscle-group volume</div><div class="card-sub">Working sets this week</div></div></div>
            <div class="card-body"><div id="chSplit"></div></div>
          </div>
        </div>
      </div>

      <!-- ===== NUTRITION ===== -->
      <div class="section">
        ${U.sectionHead("Nutrition", `Today · ${todayStr}`,
          `<a class="btn btn-ghost btn-sm" href="#/nutrition">Full nutrition ${I("chevr", 13)}</a>`)}
        <div class="grid g32">
          <div class="card">
            <div class="card-body">
              <div class="rings-row">
                <div class="ring-wrap">${U.confRing(calPct, 88)}
                  <span class="ring-label">Calories</span><span class="ring-sub">${rings.calories.value.toLocaleString("en-IN")} / ${calTarget.toLocaleString("en-IN")} kcal</span></div>
                <div class="ring-wrap">${U.confRing(protPct, 62, "var(--cyan)")}
                  <span class="ring-label">Protein</span><span class="ring-sub">${proteinMacro.value} / ${proteinMacro.target} g</span></div>
                <div class="ring-wrap">${U.confRing(carbPct, 62, "var(--blue)")}
                  <span class="ring-label">Carbs</span><span class="ring-sub">${carbsMacro.value} / ${carbsMacro.target} g</span></div>
                <div class="ring-wrap">${U.confRing(fatPct, 62, "var(--purple)")}
                  <span class="ring-label">Fat</span><span class="ring-sub">${fatMacro.value} / ${fatMacro.target} g</span></div>
              </div>
              <div class="remaining-callout">${I("target", 16)} <span>Protein remaining: <strong class="acc">${protRemaining} g</strong></span><small>· ${kcalRemaining} kcal left today</small></div>
            </div>
          </div>
          <div class="card chart-card">
            <div class="card-head"><div><div class="card-title">Calories · this week</div><div class="card-sub">vs ${calTarget.toLocaleString("en-IN")} kcal target</div></div></div>
            <div class="card-body"><div id="chKcal"></div></div>
          </div>
        </div>
      </div>
    `;

    /* ---- mount charts (with empty-data guards) ---- */
    const C = ForgeCharts;
    const tv = training.weeklyVolume || {};
    if (tv.labels && tv.labels.length > 0) {
      C.bars(root.querySelector("#chVolume"), {
        labels: tv.labels, values: tv.values,
        height: 195, unit: " t", unitLabel: "Volume"
      });
    } else {
      root.querySelector("#chVolume").innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-3)">No volume data yet. Log workouts to see trends.</div>';
    }

    const ss = training.strength || {};
    if (ss.series && ss.series.length > 0 && ss.labels && ss.labels.length > 0) {
      C.line(root.querySelector("#chStrength"), {
        labels: ss.labels, height: 195, area: false, yFmt: v => v,
        series: ss.series.map(s => ({ name: s.name, color: s.color, values: s.values }))
      });
    } else {
      root.querySelector("#chStrength").innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-3)">No strength data yet.</div>';
    }

    const cw = training.consistency || {};
    if (cw.weeks && cw.weeks.length > 0) {
      C.dots(root.querySelector("#chConsist"), { weeks: cw.weeks });
    } else {
      root.querySelector("#chConsist").innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-3)">No consistency data yet.</div>';
    }

    const mv = training.muscleVolume || [];
    if (mv.length > 0) {
      C.hbars(root.querySelector("#chSplit"), { rows: mv });
    } else {
      root.querySelector("#chSplit").innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-3)">No muscle volume data yet.</div>';
    }

    const nw = nutrition.weekly || {};
    if (nw.labels && nw.labels.length > 0) {
      C.bars(root.querySelector("#chKcal"), {
        labels: nw.labels, values: nw.values,
        height: 195, target: nw.target, targetLabel: "target", color: "cyan", unit: " kcal", unitLabel: "Calories"
      });
    } else {
      root.querySelector("#chKcal").innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-3)">No calorie data yet.</div>';
    }

    if (bp.sessions.length > 0) {
      U.initCompare(root, bp);
    }
  };

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
})();
