/* ============================================================
   ForgeAI — API layer (data seam)
   ------------------------------------------------------------
   Two modes, zero page-code changes:

   1) LIVE (auto): on load, probes for the ForgeAI backend —
      the explicitly connected base, window.FORGE_API_BASE, this
      origin's 9901 twin (https://8080-x.e2b.app →
      https://9901-x.e2b.app), or localhost:9901 — then signs in
      with the stored token or the public demo account and maps
      responses into the exact shapes this frontend expects.
   2) DEMO (fallback): backend unreachable / mapping failed →
      resolves from window.FORGE_DATA (data.js). disconnect()
      pins demo mode until the next connect().

   Manual control from the browser console:
       Forge.api.connect("http://localhost:8000", "<jwt>");
       Forge.api.disconnect();
   ============================================================ */
(function () {
  window.Forge = window.Forge || {};
  const Forge = window.Forge;

  /* ---------------- remote plumbing ---------------- */
  let BASE = "";
  try {
    BASE = window.FORGE_API_BASE || localStorage.getItem("forgeai-api-base") || "";
  } catch (e) { /* sandboxed iframe */ }

  function token() {
    try { return localStorage.getItem("forgeai-token") || ""; } catch (e) { return ""; }
  }

  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* noop */ } };
  const lsDel = (k) => { try { localStorage.removeItem(k); } catch (e) { /* noop */ } };

  function candidateBases() {
    if (lsGet("forgeai-api-mode") === "demo") return [];
    const manual = lsGet("forgeai-api-manual") === "1" || !!window.FORGE_API_BASE;
    const list = [];
    if (BASE) list.push(BASE);
    if (manual) return list;
    try {
      const o = new URL(window.location.href);
      if (o.origin !== "null" && o.protocol !== "file:") {
        list.push(o.origin);
      }
      if (o.hostname === "localhost" || o.hostname === "127.0.0.1" || o.protocol === "file:") {
        list.push("http://localhost:8000");
      }
    } catch (e) { /* no location */ }
    return list.filter((v, i) => list.indexOf(v) === i);
  }

  function fetchTimeout(url, opts, ms) {
    const ctrl = ("AbortController" in window) ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => ctrl.abort(), ms) : null;
    const p = fetch(url, Object.assign({}, opts, { signal: ctrl ? ctrl.signal : undefined }));
    return p.finally ? p.finally(() => { if (t) clearTimeout(t); }) : p;
  }

  async function probe(base) {
    try {
      const res = await fetchTimeout(base + "/health", {}, 2500);
      if (!res.ok) return false;
      const j = await res.json();
      return !!(j && j.success === true && j.data && j.data.status === "ok");
    } catch (e) {
      return false;
    }
  }

  /* ---------------- auto-connect ---------------- */
  async function validateToken(base) {
    const stored = token();
    if (!stored) return null;
    try {
      const res = await fetchTimeout(base + "/api/auth/me",
        { headers: { Authorization: "Bearer " + stored } }, 3000);
      if (res.ok) {
        const j = await res.json();
        if (j && j.success === true && j.data) {
          lsSet("forgeai-user", JSON.stringify(j.data));
        }
        return stored;
      }
    } catch (e) { /* server error or network issue */ }
    // Token is invalid or expired
    lsDel("forgeai-token");
    lsDel("forgeai-user");
    return null;
  }

  let autoPromise = null, autoOk = false, autoAt = 0;
  function ensureConnected() {
    const RETRY_MS = 30000;
    if (autoOk) return Promise.resolve(true);
    if (autoPromise && Date.now() - autoAt < RETRY_MS) return autoPromise;
    autoAt = Date.now();
    autoPromise = (async () => {
      for (const base of candidateBases()) {
        try {
          if (!(await probe(base))) continue;
          BASE = String(base).replace(/\/$/, "");
          const valid = await validateToken(BASE);
          autoOk = true;
          console.info("[ForgeAI] backend connected → " + BASE + (valid ? " (authenticated)" : " (guest)"));
          return true;
        } catch (e) { /* try next candidate */ }
      }
      console.info("[ForgeAI] backend not reachable.");
      return false;
    })();
    return autoPromise;
  }

  const D = () => window.FORGE_DATA;

  async function remote(path, fallback, mapFn, opts = {}) {
    const live = await ensureConnected();
    if (!live || !BASE) return typeof fallback === "function" ? fallback() : fallback;
    try {
      const ctrl = ("AbortController" in window) ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), 30000) : null;
      
      const headers = { ...(opts.headers || {}) };
      if (token()) headers.Authorization = "Bearer " + token();

      const res = await fetch(BASE + path, {
        method: opts.method || "GET",
        headers,
        body: opts.body,
        signal: ctrl ? ctrl.signal : undefined,
      });
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      if (!json || json.success !== true || json.data == null) throw new Error("bad envelope");
      const mapped = mapFn ? mapFn(json.data) : json.data;
      if (mapped == null) throw new Error("mapping failed");
      return mapped;
    } catch (err) {
      console.warn("[ForgeAI] backend unreachable for " + path + " — using demo data.", err && err.message);
      return typeof fallback === "function" ? fallback() : fallback;
    }
  }

  /* ---------------- mappers: backend → frontend shapes ---------------- */
  const cap = (s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);
  const titleCase = (s) => String(s || "").split(/\s+/).map(cap).join(" ");

  function mapDashboard(d) {
    const w = d.weight || {}, n = d.nutrition || {}, t = d.training || {};
    const targets = n.targets || {};
    const change = w.change_30d_kg != null ? w.change_30d_kg : 0;
    const dir = change > 0.15 ? "up" : change < -0.15 ? "down" : "flat";
    const sign = change > 0 ? "+" : "";
    const todayProtein = (n.today && n.today.protein) || 0;
    const todayKcal = (n.today && n.today.calories) || 0;
    const pTarget = targets.protein || 130, cTarget = targets.calories || 2500;
    const ins = d.latest_insight || {};
    const conf = ins.confidence != null ? Math.round(ins.confidence * 100) : 80;

    const wvGet = (v) => (v.tonnes != null ? v.tonnes : v.tonnage);
    const weeklyVolume = (t.weekly_volume || []).filter(v => wvGet(v) > 0);
    const musclePalette = ["var(--accent)", "var(--cyan)", "var(--blue)", "var(--purple)", "#8a93a5"];
    const consistencyWeeks = (t.consistency_weeks || []).map(x => ({
      label: x.label, days: (x.trained || []).map(v => (v ? 1 : 0)),
    }));

    const strengthSeries = [];
    const sLabels = (((t.strength_trends || [])[0] || {}).points || []).map(p => p.label);
    const sColors = ["accent", "cyan", "blue"];
    (t.strength_trends || []).slice(0, 3).forEach((s, i) => {
      const vals = (s.points || []).map(p => (p.est_1rm == null ? null : p.est_1rm));
      if (vals.some(v => v != null)) strengthSeries.push({ name: titleCase(s.exercise), color: sColors[i], values: vals });
    });

    return {
      metrics: {
        bodyweight: {
          value: w.current_kg || 0, unit: "kg", decimals: 1,
          delta: { text: sign + change.toFixed(1) + " kg this month", dir },
          spark: w.spark || [],
        },
        protein: {
          value: Math.round(todayProtein), unit: "g", target: pTarget,
          targetLabel: "Target: " + pTarget + " g",
          progress: Math.min(100, Math.round(todayProtein / pTarget * 100)),
        },
        calories: {
          value: Math.round(todayKcal), unit: "kcal", target: cTarget,
          targetLabel: "Target: " + Number(cTarget).toLocaleString("en-IN") + " kcal",
          progress: Math.min(100, Math.round(todayKcal / cTarget * 100)),
        },
        training: {
          value: t.sessions_this_week || 0, unit: "/ " + (t.target_per_week || 5) + " sessions",
          targetLabel: "This week",
          progress: Math.min(100, Math.round((t.sessions_this_week || 0) / (t.target_per_week || 5) * 100)),
        },
      },
      insight: {
        text: ins.text || "Log more data to unlock insights.",
        confidence: conf,
        evidenceCount: (ins.evidence || []).length || 3,
        updated: ins.updated || "just now",
        sources: ins.sources || ["Workouts", "Nutrition", "Bodyweight"],
      },
      muscles: (d.muscle_trends || []).map(m => ({
        name: cap(m.muscle_group),
        trend: m.trend === "improving" ? "up" : m.trend === "declining" ? "down" : "flat",
        label: m.trend === "improving" ? "Improving" : m.trend === "declining" ? "Decreasing" : "Stable",
        confidence: Math.round((m.confidence || 0.5) * 100),
        last: "live",
        note: m.basis || "from logged sets",
        spark: (m.weekly_tonnage || []).map(v => Math.max(0.1, v)),
      })),
      training: {
        weeklyVolume: { unit: "t", labels: weeklyVolume.map(v => v.label), values: weeklyVolume.map(wvGet) },
        strength: { labels: sLabels, series: strengthSeries, note: "Estimated 1RM (kg)" },
        consistency: { weeks: consistencyWeeks },
        muscleVolume: (t.muscle_volume || []).map((m, i) => ({
          label: cap(m.muscle_group), sets: m.sets, color: musclePalette[i % musclePalette.length],
        })),
      },
      __nutrition: n,   // reused by getNutrition mapping (single fetch)
    };
  }

  function mapNutrition(n, dash) {
    const today = (n && n.today) || {};
    const targets = today.targets || {};
    const macroColors = { protein: "var(--accent)", carbohydrates: "var(--cyan)", fat: "var(--blue)", fiber: "var(--purple)" };
    const macros = ["protein", "carbohydrates", "fat", "fiber"].map(k => ({
      key: k, label: k === "carbohydrates" ? "Carbs" : cap(k),
      value: Math.round(today[k] || 0), target: Math.round(targets[k] || 0),
      unit: "g", color: macroColors[k],
    }));
    const meals = (n.meals || []).map(m => ({
      name: cap(m.meal_type),
      detail: (m.logs || []).map(l => l.food_item.name).join(" · ") || "—",
      kcal: Math.round((m.totals || {}).calories || 0),
      protein: Math.round((m.totals || {}).protein || 0),
      icon: m.meal_type === "snack" || m.meal_type.includes("workout") ? "zap" : "utensils",
    }));
    const wv = (n.weekly && n.weekly.values) || [];
    return {
      today: {
        calories: { value: Math.round(today.calories || 0), target: Math.round(targets.calories || 2500) },
        macros,
        proteinRemaining: today.protein_remaining_g != null ? today.protein_remaining_g : null,
        water: { value: null, target: 3.5, unit: "L" },  // TODO: water logging endpoint not yet in backend
      },
      meals,
      weekly: {
        labels: wv.map(v => { const dd = new Date(v.date + "T12:00:00"); return dd.toLocaleDateString("en-IN", { weekday: "short" }); }),
        values: wv.map(v => Math.round(v.calories || 0)),
        target: Math.round(targets.calories || 2500),
      },
    };
  }

  function mapWorkouts(d) {
    const sessions = d.sessions || [];
    const todayIso = new Date().toISOString().slice(0, 10);
    const todaySession = sessions.find(s => s.date === todayIso);
    const byExercise = {};
    (todaySession ? todaySession.sets : []).forEach(st => {
      (byExercise[st.exercise] = byExercise[st.exercise] || []).push(st);
    });
    const exercises = Object.keys(byExercise).map(name => {
      const sts = byExercise[name];
      return {
        name,
        sets: sts.map(s => (s.weight > 0 ? s.weight + " kg × " + s.reps : "× " + s.reps)),
        rir: sts[0].rir != null ? sts[0].rir : 2,
        trend: sts.map(s => s.weight),
      };
    });
    const dayTag = (s) => s.day.charAt(0);
    const weekPlan = (d.week || []).map(x => ({
      day: x.day, tag: dayTag(x),
      label: x.name || (x.trained ? "Session" : "Rest"),
      state: x.trained ? (x.date === todayIso ? "today" : "done") : (x.date === todayIso ? "today" : "upcoming"),
    }));
    return {
      today: {
        title: todaySession ? (todaySession.name || "Session") : "Rest day",
        date: new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }),
        status: todaySession ? "in_progress" : "up_next",
        id: todaySession ? todaySession.id : null,
        exercises,
      },
      week: { plan: weekPlan },
      prs: (d.prs || []).map(p => ({
        name: titleCase(p.exercise),
        detail: p.reps + " reps · " + p.date,
        value: p.weight + " kg",
      })),
    };
  }

  function mapProgress(d) {
    const meas = d.measurements || [];
    const sorted = meas.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    const first = sorted[0] || {}, latest = sorted[sorted.length - 1] || {};
    const siteMap = [
      ["shoulders", "Shoulders"], ["chest", "Chest"], ["waist", "Waist"],
      ["left_arm", "Arm (L)"], ["right_arm", "Arm (R)"],
      ["left_thigh", "Thigh (L)"], ["right_thigh", "Thigh (R)"], ["neck", "Neck"],
    ];
    const rows = siteMap
      .filter(([k]) => first[k] != null && latest[k] != null)
      .map(([k, label]) => ({ site: label, prev: +first[k], curr: +latest[k] }));
    return {
      weight: {
        points: (d.weight_points || []).map(p => ({ d: p.date.slice(5), v: p.weight_kg })),
      },
      measurements: {
        current: latest.date ? new Date(latest.date + "T12:00:00").toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" }) : "—",
        previous: first.date ? new Date(first.date + "T12:00:00").toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" }) : "—",
        rows,
      },
      observations: (d.observations || []).map(o => ({
        title: o.title, text: o.text,
        conf: o.confidence != null ? Math.round(o.confidence * 100) : null,
        date: o.date ? new Date(o.date).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "",
      })),
    };
  }

  function mapBodyProgress(d) {
    const sessions = (d.photos && d.photos.sessions) || [];
    return {
      views: ["Front", "Side", "Back"],
      reliability: {
        label: sessions.length >= 2 ? "Comparison reliability: Medium" : "Comparison reliability: Building",
        level: sessions.length >= 3 ? "high" : "medium",
        poseMatch: 95, photoSessions: sessions.length,
      },
      sessions: sessions.map(s => ({
        id: s.month, label: s.label, date: s.date,
        weight: s.weight != null ? s.weight : null,
      })),
    };
  }

  /* ---------------- public API (same method names as before) ---------------- */
  Forge.api = {
    isLoggedIn() {
      const t = token();
      const u = lsGet("forgeai-user");
      if (!t || !u || u === "null" || u === "undefined") return false;
      try {
        const parsed = JSON.parse(u);
        return !!(parsed && (parsed.id || parsed.email));
      } catch (e) {
        return false;
      }
    },
    ensureConnected,
    getCurrentUser() {
      try { return JSON.parse(lsGet("forgeai-user") || "null"); } catch(e) { return null; }
    },
    async login(email, password) {
      if (!BASE) {
        for (const b of candidateBases()) {
          if (await probe(b)) { BASE = String(b).replace(/\/$/, ""); break; }
        }
      }
      if (!BASE) throw new Error("Backend server is not reachable.");
      const res = await fetch(BASE + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const j = await res.json();
      if (!res.ok || !j || j.success !== true) {
        const msg = (j && (j.message || (j.error && j.error.message))) || "Invalid email or password.";
        throw new Error(msg);
      }
      const data = j.data;
      lsSet("forgeai-token", data.access_token);
      if (data.user) {
        lsSet("forgeai-user", JSON.stringify(data.user));
      }
      autoOk = true;
      return data.user;
    },
    async register(email, password, name) {
      if (!BASE) {
        for (const b of candidateBases()) {
          if (await probe(b)) { BASE = String(b).replace(/\/$/, ""); break; }
        }
      }
      if (!BASE) throw new Error("Backend server is not reachable.");
      const res = await fetch(BASE + "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name })
      });
      const j = await res.json();
      if (!res.ok || !j || j.success !== true) {
        const msg = (j && (j.message || (j.error && j.error.message))) || "Registration failed.";
        throw new Error(msg);
      }
      // Auto login after successful registration
      return await this.login(email, password);
    },
    logout() {
      lsDel("forgeai-token");
      lsDel("forgeai-user");
      lsDel("forgeai-token-src");
      autoOk = false;
      autoPromise = null;
      location.hash = "#/login";
    },
    /** Attach a backend at runtime (persists in localStorage).
        Takes effect immediately — no reload required. */
    connect(base, jwt) {
      const clean = String(base).replace(/\/$/, "");
      try {
        localStorage.setItem("forgeai-api-base", clean);
        localStorage.setItem("forgeai-token", jwt || "");
        localStorage.setItem("forgeai-token-src", "manual");
        localStorage.setItem("forgeai-api-manual", "1");
        localStorage.removeItem("forgeai-api-mode");     // un-pin demo mode
      } catch (e) { console.warn("storage unavailable", e); }
      BASE = clean;                                      // live now, not next load
      autoOk = false; autoPromise = null; autoAt = 0;    // force a fresh ensureConnected()
      Forge.__dashCache = null; Forge.__remoteNutrition = null;
      return true;
    },
    /** Detach any backend and pin demo mode until the next connect(). */
    disconnect() {
      ["forgeai-api-base", "forgeai-token", "forgeai-token-src", "forgeai-api-manual"]
        .forEach(lsDel);
      lsSet("forgeai-api-mode", "demo");
      BASE = ""; autoOk = false; autoPromise = null; autoAt = 0;
      Forge.__dashCache = null; Forge.__remoteNutrition = null;
    },
    get mode() { return BASE ? "remote → " + BASE : "demo data"; },

    async getDashboard() {
      if (!(await ensureConnected()) || !BASE) return D().dashboard;
      // small in-flight cache: dashboard/muscles/training share one fetch
      const now = Date.now();
      if (!Forge.__dashCache || now - Forge.__dashCache.t > 5000) {
        Forge.__dashCache = {
          t: now,
          promise: remote("/api/dashboard", () => D().dashboard, (d) => {
            const mapped = mapDashboard(d);
            Forge.__remoteNutrition = mapped.__nutrition;
            const { __nutrition, ...rest } = mapped;
            return rest;
          }),
        };
      }
      return Forge.__dashCache.promise;
    },

    getNutrition() {
      if (Forge.__remoteNutrition) {   // reuse the dashboard fetch when possible
        const n = Forge.__remoteNutrition;
        return remote("/api/nutrition", () => mapNutrition(n), (fresh) => mapNutrition(fresh));
      }
      return remote("/api/nutrition", () => D().nutrition, (d) => mapNutrition(d));
    },

    getWorkouts() {
      return remote("/api/workouts", () => D().workouts, mapWorkouts);
    },

    getProgress() {
      return remote("/api/progress", () => D().progress, mapProgress);
    },

    getBodyProgress() {
      return remote("/api/progress", () => D().bodyProgress, mapBodyProgress);
    },

    /* Surfaces backed by the AI layer stay on demo data until a real
       provider is connected — swap the mapFn here when ready. */
    async getMuscles() {
      if (await ensureConnected()) return Forge.api.getDashboard().then(d => d.muscles || D().muscles);
      return D().muscles;
    },
    async getTraining() {
      if (await ensureConnected()) return Forge.api.getDashboard().then(d => d.training || D().training);
      return D().training;
    },
    getHistory()    { return remote("/api/history", () => D().history, (d) => (d.items || [])); },
    getEvaluation() { return remote("/api/evaluations", () => D().evaluation); },
    getCoach()      { return remote("/api/coach/conversations", () => D().coach); },
    getAnalysis()   { return remote("/api/analysis", () => D().analysis); },
    async sendCoachMessage(message, threadId) {
      if (!(await ensureConnected())) return null;
      const opts = { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, thread_id: threadId }) };
      return remote("/api/coach/chat", null, null, opts);
    },
    async getUser() {
      const saved = JSON.parse(lsGet("forgeai-profile-settings") || "{}");
      if (!(await ensureConnected())) {
        const u = D().user;
        return {
          ...u,
          height_cm: saved.height_cm || 173,
          birth_year: saved.birth_year || 2001,
          weight_kg: saved.weight_kg || 65.0,
          goal: saved.goal || "Lean bulk",
          target_weight: saved.target_weight || 66.0,
          weekly_sessions: saved.weekly_sessions || 5,
          target_calories: saved.target_calories || 2480,
          target_protein: saved.target_protein || 130,
          unit: saved.unit || "metric",
        };
      }
      return remote("/api/auth/me", () => D().user, (u) => ({
        name: u.name, initial: (u.name || "A").charAt(0).toUpperCase(),
        height_cm: (u.profile && u.profile.height_cm) || saved.height_cm || 173,
        birth_year: (u.profile && u.profile.age ? new Date().getFullYear() - u.profile.age : saved.birth_year) || 2001,
        weight_kg: saved.weight_kg || 65.0,
        goal: (u.profile && u.profile.goal) || saved.goal || "Lean bulk",
        target_weight: saved.target_weight || 66.0,
        weekly_sessions: (u.profile && u.profile.training_frequency) || saved.weekly_sessions || 5,
        target_calories: saved.target_calories || 2480,
        target_protein: saved.target_protein || 130,
        unit: saved.unit || "metric",
      }));
    },
    async updateProfile(data) {
      lsSet("forgeai-profile-settings", JSON.stringify(data));
      if (await ensureConnected()) {
        try {
          await remote("/api/auth/profile", null, null, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
        } catch (e) { /* ignore if route not yet reloaded on backend */ }
        if (data.weight_kg) {
          try {
            await this.logWeight(data.weight_kg, "Profile weight update");
          } catch (e) {}
        }
      }
      return true;
    },
    async addExercise(sessionId, exerciseName, setsCount, reps, weight) {
      if (!(await ensureConnected())) return null;
      const sets = [];
      for (let i = 0; i < setsCount; i++) {
        sets.push({
          exercise: exerciseName,
          muscle_group: "other", // default
          set_number: i + 1,
          weight: parseFloat(weight) || 0,
          reps: parseInt(reps) || 0,
          rir: 2,
          rpe: 8,
          rest_seconds: 90
        });
      }
      
      const opts = { method: "POST", headers: { "Content-Type": "application/json" } };
      if (sessionId) {
        opts.body = JSON.stringify({ sets });
        return remote(`/api/workouts/${sessionId}/sets`, null, null, opts);
      } else {
        const d = new Date();
        // create new session
        opts.body = JSON.stringify({
          date: d.toISOString().slice(0, 10),
          name: "Session",
          duration: 45,
          sets
        });
        return remote("/api/workouts", null, null, opts);
      }
    },
    async createFood(name, servingSize, calories, protein, carbs, fat, fiber) {
      if (!(await ensureConnected())) return null;
      const opts = { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, serving_size: parseFloat(servingSize) || 100,
          calories: parseFloat(calories) || 0, protein: parseFloat(protein) || 0,
          carbohydrates: parseFloat(carbs) || 0, fat: parseFloat(fat) || 0,
          fiber: parseFloat(fiber) || 0 }) };
      return remote("/api/nutrition/food", null, null, opts);
    },
    async logFood(mealType, foodItemId, quantity) {
      if (!(await ensureConnected())) return null;
      const d = new Date().toISOString().slice(0, 10);
      const opts = { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: d, meal_type: mealType,
          logs: [{ food_item_id: foodItemId, quantity: parseFloat(quantity) || 1 }] }) };
      return remote("/api/nutrition/meals", null, null, opts);
    },
    async logWeight(weight, notes) {
      if (!(await ensureConnected())) return null;
      const d = new Date().toISOString().slice(0, 10);
      const opts = { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weight: parseFloat(weight), date: d, notes: notes || null }) };
      return remote("/api/progress/weight", null, null, opts);
    },
    async logMeasurements(data) {
      if (!(await ensureConnected())) return null;
      const d = new Date().toISOString().slice(0, 10);
      const body = { date: d };
      ["waist","chest","left_arm","right_arm","left_thigh","right_thigh","shoulders","neck"].forEach(k => {
        if (data[k]) body[k] = parseFloat(data[k]);
      });
      if (data.notes) body.notes = data.notes;
      const opts = { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body) };
      return remote("/api/progress/measurements", null, null, opts);
    },
  };

})();
