/* ForgeAI — Calorie Calculator page */
(function () {
  window.Forge = window.Forge || {};
  Forge.pages = Forge.pages || {};

  Forge.pages["calorie-calc"] = async function (root) {
    const I = (n, s, c) => ForgeIcons.svg(n, s, c);
    const HISTORY_KEY = "forgeai-calorie-history";

    const OFFLINE_FOODS = {
      "chicken breast":  [165, 31, 0,   3.6, 0],
      "chicken":         [165, 31, 0,   3.6, 0],
      "oats":            [389, 17, 66,  7,   10],
      "rice":            [130, 2.7,28,  0.3, 0.4],
      "white rice":      [130, 2.7,28,  0.3, 0.4],
      "brown rice":      [123, 2.7,26,  1,   1.8],
      "egg":             [155, 13, 1.1, 11,  0],
      "eggs":            [155, 13, 1.1, 11,  0],
      "banana":          [89,  1.1,23,  0.3, 2.6],
      "apple":           [52,  0.3,14,  0.2, 2.4],
      "milk":            [61,  3.2, 4.8, 3.3, 0],
      "paneer":          [265, 18, 3.5, 21,  0],
      "dal":             [116, 7,  20,  2,   4],
      "lentils":         [116, 9,  20,  0.4, 8],
      "bread":           [265, 9,  49,  3.2, 2.7],
      "whey protein":    [400, 80, 10,  5,   0],
      "greek yogurt":    [59,  10, 3.6, 0.4, 0],
      "yogurt":          [59,  3.5, 4.7, 3.3, 0],
      "almonds":         [579, 21, 22,  50,  12.5],
      "peanut butter":   [588, 25, 20,  50,  6],
      "salmon":          [208, 20, 0,   13,  0],
      "tuna":            [144, 30, 0,   3.2, 0],
      "beef":            [250, 26, 0,   15,  0],
      "broccoli":        [34,  2.8, 7,  0.4, 2.6],
      "spinach":         [23,  2.9, 3.6, 0.4, 2.2],
      "sweet potato":    [86,  1.6, 20,  0.1, 3],
      "potato":          [77,  2,  17,  0.1, 2.2],
      "pasta":           [131, 5,  25,  1.1, 1.8],
      "olive oil":       [884, 0,   0,  100,  0],
      "soya":            [345, 52, 33,  0.5, 13],
      "soy":             [345, 52, 33,  0.5, 13],
      "roti":            [297, 8,  55,  4,   2.5],
      "chapati":         [297, 8,  55,  4,   2.5],
    };

    async function lookupNutrition(foodName) {
      try {
        const q = encodeURIComponent(foodName.trim());
        const res = await fetch(
          `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${q}&search_simple=1&action=process&json=1&page_size=3&fields=product_name,nutriments`,
          { signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined }
        );
        if (res.ok) {
          const data = await res.json();
          const p = (data.products || []).find(x => x.nutriments && x.nutriments["energy-kcal_100g"] > 0);
          if (p) {
            const n = p.nutriments;
            return {
              source: p.product_name || foodName,
              per100: {
                kcal:    Math.round(n["energy-kcal_100g"] || 0),
                protein: Math.round((n["proteins_100g"]      || 0) * 10) / 10,
                carbs:   Math.round((n["carbohydrates_100g"] || 0) * 10) / 10,
                fat:     Math.round((n["fat_100g"]           || 0) * 10) / 10,
                fiber:   Math.round((n["fiber_100g"]         || 0) * 10) / 10,
              }
            };
          }
        }
      } catch(e) { /* offline */ }
      const key = foodName.trim().toLowerCase();
      for (const [k, v] of Object.entries(OFFLINE_FOODS)) {
        if (key.includes(k) || k.includes(key)) {
          return { source: k, per100: { kcal: v[0], protein: v[1], carbs: v[2], fat: v[3], fiber: v[4] } };
        }
      }
      return null;
    }

    function calcForGrams(per100, grams) {
      const f = grams / 100;
      return {
        kcal:    Math.round(per100.kcal    * f),
        protein: Math.round(per100.protein * f * 10) / 10,
        carbs:   Math.round(per100.carbs   * f * 10) / 10,
        fat:     Math.round(per100.fat     * f * 10) / 10,
        fiber:   Math.round(per100.fiber   * f * 10) / 10,
      };
    }

    function loadHistory() {
      try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
    }
    function saveHistory(h) {
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 20))); } catch {}
    }

    const inpStyle = "width:100%;padding:11px 14px;border-radius:10px;border:1px solid var(--border);background:var(--bg-card);color:var(--text);font-family:inherit;font-size:15px;box-sizing:border-box;transition:border-color .15s;outline:none;";

    root.innerHTML = `
      <style>
        @keyframes slideUp { from{transform:translateY(12px);opacity:0} to{transform:translateY(0);opacity:1} }
        #ccFood:focus, #ccGrams:focus { border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-dim); }
        .cc-hist-item { display:grid; grid-template-columns:1fr auto; gap:8px; align-items:center; padding:10px 12px; border-radius:10px; margin-bottom:6px; background:var(--bg-card); border:1px solid var(--border); cursor:pointer; transition:border-color .15s; }
        .cc-hist-item:hover { border-color:var(--accent); }
        .cc-hist-name { font-weight:600; font-size:14px; }
        .cc-hist-detail { font-size:12px; color:var(--text-3); margin-top:2px; }
        .cc-hist-kcal { font-size:18px; font-weight:800; color:var(--accent); }
      </style>

      <div class="page-head">
        <div>
          <h1>Calorie Calculator</h1>
          <p class="sub">Look up calories and macros for any food instantly</p>
        </div>
      </div>

      <div class="grid g2" style="align-items:start">
        <div class="card" style="padding:28px">
          <div class="card-title" style="margin-bottom:6px">Calculate</div>
          <div class="card-sub" style="margin-bottom:22px">Enter a food and grams to get nutrition info</div>
          <div style="display:flex;flex-direction:column;gap:14px">
            <label>
              <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-2);margin-bottom:7px">Food name</div>
              <input id="ccFood" type="text" style="${inpStyle}" placeholder="e.g. Chicken breast, oats, dal, egg…" autocomplete="off" />
            </label>
            <label>
              <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-2);margin-bottom:7px">Amount (grams)</div>
              <input id="ccGrams" type="number" min="1" max="5000" value="100" style="${inpStyle}" />
            </label>
            <button id="ccCalc" class="btn btn-primary" style="padding:13px;font-size:15px;border-radius:10px;margin-top:4px">
              Calculate Calories
            </button>
            <div id="ccStatus" style="text-align:center;font-size:13px;color:var(--text-3);min-height:18px"></div>
          </div>

          <div id="ccResult" style="display:none;margin-top:24px;animation:slideUp .25s ease">
            <div style="background:var(--accent-dim);border:1px solid var(--accent);border-radius:14px;padding:20px">
              <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--accent);margin-bottom:14px" id="ccResultLabel">Result</div>
              <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;text-align:center">
                <div><div id="ccRkcal" style="font-size:26px;font-weight:800;color:var(--accent)">—</div><div style="font-size:11px;color:var(--text-3);margin-top:2px">kcal</div></div>
                <div><div id="ccRprotein" style="font-size:26px;font-weight:800;color:#60d394">—</div><div style="font-size:11px;color:var(--text-3);margin-top:2px">protein</div></div>
                <div><div id="ccRcarbs" style="font-size:26px;font-weight:800;color:#fbbf24">—</div><div style="font-size:11px;color:var(--text-3);margin-top:2px">carbs</div></div>
                <div><div id="ccRfat" style="font-size:26px;font-weight:800;color:#f472b6">—</div><div style="font-size:11px;color:var(--text-3);margin-top:2px">fat</div></div>
                <div><div id="ccRfiber" style="font-size:26px;font-weight:800;color:#a78bfa">—</div><div style="font-size:11px;color:var(--text-3);margin-top:2px">fiber</div></div>
              </div>
              <div id="ccResultSub" style="font-size:12px;color:var(--text-3);text-align:center;margin-top:14px"></div>
            </div>
          </div>
        </div>

        <div class="card" style="padding:24px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <div>
              <div class="card-title">Recent Lookups</div>
              <div class="card-sub">Last 20 calculations saved locally</div>
            </div>
            <button id="ccClearHistory" class="btn btn-ghost btn-sm" style="font-size:12px">Clear</button>
          </div>
          <div id="ccHistory"></div>
        </div>
      </div>
    `;

    function renderHistory() {
      const h = loadHistory();
      const el = root.querySelector("#ccHistory");
      if (h.length === 0) {
        el.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text-3)">No lookups yet. Calculate a food above.</div>`;
        return;
      }
      el.innerHTML = h.map((item, i) => `
        <div class="cc-hist-item" data-idx="${i}">
          <div>
            <div class="cc-hist-name">${item.name} <span style="font-weight:400;color:var(--text-3)">(${item.grams}g)</span></div>
            <div class="cc-hist-detail">${item.result.protein}g protein · ${item.result.carbs}g carbs · ${item.result.fat}g fat</div>
          </div>
          <div class="cc-hist-kcal">${item.result.kcal} kcal</div>
        </div>
      `).join("");
      el.querySelectorAll(".cc-hist-item").forEach(row => {
        row.addEventListener("click", () => {
          const item = h[parseInt(row.getAttribute("data-idx"))];
          root.querySelector("#ccFood").value = item.name;
          root.querySelector("#ccGrams").value = item.grams;
          showResult(item.name, item.grams, item.result, item.source);
        });
      });
    }

    function showResult(foodName, grams, result, source) {
      root.querySelector("#ccRkcal").textContent = result.kcal;
      root.querySelector("#ccRprotein").textContent = result.protein + "g";
      root.querySelector("#ccRcarbs").textContent = result.carbs + "g";
      root.querySelector("#ccRfat").textContent = result.fat + "g";
      root.querySelector("#ccRfiber").textContent = result.fiber + "g";
      root.querySelector("#ccResultLabel").textContent = source || foodName;
      root.querySelector("#ccResultSub").textContent = `Based on ${grams}g of ${foodName}`;
      root.querySelector("#ccResult").style.display = "block";
    }

    root.querySelector("#ccCalc").addEventListener("click", async () => {
      const foodName = root.querySelector("#ccFood").value.trim();
      const grams = parseFloat(root.querySelector("#ccGrams").value);
      const statusEl = root.querySelector("#ccStatus");
      const btn = root.querySelector("#ccCalc");
      if (!foodName) { ForgeUI.toast("Enter a food name", "warn"); return; }
      if (!grams || grams < 1) { ForgeUI.toast("Enter a valid amount in grams", "warn"); return; }

      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="display:inline-block;width:14px;height:14px;margin-right:8px"></span> Looking up…`;
      statusEl.textContent = "Searching nutrition database…";

      const nutrition = await lookupNutrition(foodName);
      btn.disabled = false;
      btn.innerHTML = "Calculate Calories";

      if (!nutrition) {
        statusEl.innerHTML = `<span style="color:var(--warn)">Not found. Try a simpler name (e.g. "chicken" not "grilled chicken tikka").</span>`;
        return;
      }
      statusEl.textContent = "";
      const result = calcForGrams(nutrition.per100, grams);
      showResult(nutrition.source, grams, result, nutrition.source);

      const h = loadHistory();
      h.unshift({ name: foodName, grams, source: nutrition.source, result });
      saveHistory(h);
      renderHistory();
    });

    root.querySelector("#ccFood").addEventListener("keydown", e => { if (e.key === "Enter") root.querySelector("#ccCalc").click(); });
    root.querySelector("#ccGrams").addEventListener("keydown", e => { if (e.key === "Enter") root.querySelector("#ccCalc").click(); });
    root.querySelector("#ccClearHistory").addEventListener("click", () => {
      localStorage.removeItem(HISTORY_KEY);
      renderHistory();
      ForgeUI.toast("History cleared");
    });

    renderHistory();
  };
})();
