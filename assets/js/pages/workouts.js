/* ForgeAI — Workouts page */
(function () {
  window.Forge = window.Forge || {};
  Forge.pages = Forge.pages || {};

  Forge.pages.workouts = async function (root) {
    const U = ForgeUI, I = (n, s, c) => ForgeIcons.svg(n, s, c);
    const [wk, training] = await Promise.all([Forge.api.getWorkouts(), Forge.api.getTraining()]);
    const today = wk.today;

    const rows = today.exercises.map(ex => {
      const topSet = ex.sets && ex.sets.length > 0 ? ex.sets[0].split("×")[0].trim() : "—";
      return `
      <tr>
        <td><strong>${ex.name}</strong><br><small class="muted">${ex.sets.length} sets${topSet !== "—" ? " · top set " + topSet : ""}</small></td>
        <td><div class="row" style="gap:6px;flex-wrap:wrap">${ex.sets.map((s, i) => `<span class="set-chip${i === 0 ? " done" : ""}">${s.replace(" kg ", " <b>kg</b> × ")}</span>`).join("")}</div></td>
        <td class="num">RIR ${ex.rir}</td>
        <td>${ex.trend && ex.trend.length > 0 ? U.barsSpark(ex.trend.filter(v => v > 0).length > 0 ? ex.trend : [1], { w: 64, h: 22, color: "#6d7686" }) : ""}</td>
        <td style="text-align:right"><button class="btn btn-sm analyze-btn" data-ex="${ex.name}">${I("video", 13)} Analyze video</button></td>
      </tr>`;
    }).join("");

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>Workouts</h1>
          <p class="sub">Week 38 · Sep 15 – Sep 21 · Push / Pull / Legs split</p>
        </div>
        <div class="page-actions">
          <span class="chip chip-acc">${I("check", 12)} ${wk.week.plan.filter(d => d.state === "done").length} / ${wk.week.plan.length || 0} this week</span>
          <button class="btn btn-primary" id="btnStart">${I("play", 14)} Start session</button>
        </div>
      </div>

      <div class="wk-grid">
        <div class="card">
          <div class="card-head">
            <div><div class="card-title">Today · ${today.title}</div><div class="card-sub">${today.date} · est. 55 min · 10 working sets</div></div>
            <span class="chip chip-warn">Up next</span>
          </div>
          <div class="card-body tbl-wrap">
            ${rows ? `<table class="tbl">
               <thead><tr><th>Exercise</th><th>Sets</th><th>RIR</th><th>Trend</th><th></th></tr></thead>
               <tbody>${rows}</tbody>
             </table>` : `<div style="padding:32px;text-align:center;color:var(--text-3)">No exercises yet. Click <strong>+ Add exercise</strong> to log your first set.</div>`}
            <div class="row spread mt" style="padding-top:14px;border-top:1px solid var(--border)">
              <button class="btn btn-ghost" id="btnAddEx">${I("plus", 14)} Add exercise</button>
              <div class="row">
                <button class="btn" id="btnRest">Rest timer</button>
                <button class="btn btn-primary" id="btnFinish">Finish session</button>
              </div>
            </div>
          </div>
        </div>

        <div class="stack">
          <div class="card">
            <div class="card-head"><div><div class="card-title">This week</div><div class="card-sub">5 sessions planned</div></div></div>
            <div class="card-body">
              <div class="week-dots">
                ${wk.week.plan.length > 0 ? wk.week.plan.map(d => `<div class="wd ${d.state}" title="${d.label}"><i>${d.state === "done" ? I("check", 13) : d.state === "today" ? I("play", 12) : d.tag}</i>${d.day}</div>`).join("") : "<div class=\"muted\">No sessions this week yet.</div>"}
              </div>
              ${wk.prs && wk.prs.length > 0 ? `<div class="remaining-callout" style="margin-top:16px">${I("zap", 15)} <span>PRs this month: <strong>${wk.prs.length}</strong></span></div>` : ""}
            </div>
          </div>

          <div class="card">
            <div class="card-head"><div><div class="card-title">Recent PRs</div><div class="card-sub">Personal records · last 30 days</div></div></div>
            <div class="card-body" style="padding-top:6px">
              ${wk.prs && wk.prs.length > 0 ? wk.prs.map(p => `
                <div class="pr-item">
                  <span class="pr-ico">${I("zap", 14)}</span>
                  <div class="pr-body"><strong>${p.name}</strong><small>${p.detail}</small></div>
                  <span class="pr-val">${p.value}</span>
                </div>`).join("") : `<div style="padding:16px;text-align:center;color:var(--text-3)">No PRs yet.</div>`}
            </div>
          </div>

          <div class="card">
            <div class="card-head"><div><div class="card-title">Muscle split</div><div class="card-sub">Working sets · this week</div></div></div>
            <div class="card-body" id="wkSplit"></div>
          </div>
        </div>
      </div>
    `;

    if (training.muscleVolume && training.muscleVolume.length > 0) {
      ForgeCharts.hbars(root.querySelector("#wkSplit"), { rows: training.muscleVolume });
    } else {
      const splitEl = root.querySelector("#wkSplit");
      if (splitEl) splitEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-3)">Log workouts to see muscle volume.</div>';
    }

    root.querySelectorAll(".analyze-btn").forEach(b => {
      b.addEventListener("click", () => {
        ForgeUI.toast("Video analysis queued for " + b.getAttribute("data-ex"));
        setTimeout(() => { location.hash = "#/analysis?demo=1"; }, 650);
      });
    });

    root.querySelector("#btnStart").addEventListener("click", async () => {
      if (!Forge.api.mode.includes("remote")) {
        ForgeUI.toast("Connect backend to start a live session", "warn");
        return;
      }
      const btn = root.querySelector("#btnStart");
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner" style="display:inline-block;width:14px;height:14px"></span>';
      try {
        const d = new Date();
        const dayName = d.toLocaleDateString("en-IN", { weekday: "long" });
        // Create a new session for today
        const opts = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        };
        // Use addExercise with null sessionId to create a new session skeleton
        await Forge.api.addExercise(null, "Session Start", 0, 0, 0);
        ForgeUI.toast(`${dayName} session started ✓`);
        Forge.pages.workouts(root);
      } catch (err) {
        ForgeUI.toast("Could not start session", "warn");
        btn.disabled = false;
        btn.innerHTML = ForgeIcons.svg("play", 14) + " Start session";
      }
    });

    root.querySelector("#btnAddEx").addEventListener("click", () => {
      
      const modalHtml = `
        <div id="exModalOverlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)">
          <div class="card" style="width:100%;max-width:400px;padding:24px;background:var(--bg)">
            <div class="card-head" style="margin-bottom:16px;">
              <div class="card-title">Add Exercise</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:12px">
              <label>
                <div class="muted" style="margin-bottom:4px;font-size:13px">Exercise Name</div>
                <input type="text" id="exName" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--text);font-family:inherit" placeholder="e.g. Bench Press" autofocus>
              </label>
              <div style="display:flex;gap:12px">
                <label style="flex:1">
                  <div class="muted" style="margin-bottom:4px;font-size:13px">Sets</div>
                  <input type="number" id="exSets" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--text);font-family:inherit" value="3">
                </label>
                <label style="flex:1">
                  <div class="muted" style="margin-bottom:4px;font-size:13px">Reps</div>
                  <input type="number" id="exReps" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--text);font-family:inherit" value="10">
                </label>
                <label style="flex:1">
                  <div class="muted" style="margin-bottom:4px;font-size:13px">Weight (kg)</div>
                  <input type="number" id="exWeight" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--text);font-family:inherit" value="20">
                </label>
              </div>
            </div>
            <div class="row spread mt" style="margin-top:24px">
              <button class="btn btn-ghost" id="exCancel">Cancel</button>
              <button class="btn btn-primary" id="exSubmit">Add</button>
            </div>
          </div>
        </div>
      `;
      
      const overlay = document.createElement("div");
      overlay.innerHTML = modalHtml;
      document.body.appendChild(overlay.firstElementChild);
      
      const modal = document.getElementById("exModalOverlay");
      const cleanup = () => modal.remove();
      
      document.getElementById("exCancel").addEventListener("click", cleanup);
      modal.addEventListener("click", (e) => { if(e.target === modal) cleanup(); });
      
      const submitBtn = document.getElementById("exSubmit");
      submitBtn.addEventListener("click", async () => {
        const name = document.getElementById("exName").value.trim();
        const sets = document.getElementById("exSets").value;
        const reps = document.getElementById("exReps").value;
        const weight = document.getElementById("exWeight").value;
        
        if (!name) {
          ForgeUI.toast("Please enter an exercise name", "warn");
          return;
        }
        
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner" style="display:inline-block;width:14px;height:14px"></span>';
        
        try {
          await Forge.api.addExercise(today.id, name, sets, reps, weight);
          ForgeUI.toast("Exercise added!");
          cleanup();
          Forge.pages.workouts(root);
        } catch(err) {
          ForgeUI.toast("Failed to add exercise", "warn");
          console.error(err);
          cleanup();
        }
      });
    });
    root.querySelector("#btnRest").addEventListener("click", () => ForgeUI.toast("Rest timer · 2:30"));
    root.querySelector("#btnFinish").addEventListener("click", async () => {
      if (!Forge.api.mode.includes("remote")) {
        ForgeUI.toast("Session saved · synced to Forge core");
        return;
      }
      ForgeUI.toast("Session completed ✓");
      // Invalidate dashboard cache so stats refresh
      if (window.Forge) { Forge.__dashCache = null; Forge.__remoteNutrition = null; }
      setTimeout(() => { location.hash = "#/dashboard"; }, 700);
    });
  };
})();
