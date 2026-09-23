/* ForgeAI — Nutrition page */
(function () {
  window.Forge = window.Forge || {};
  Forge.pages = Forge.pages || {};

  Forge.pages.nutrition = async function (root) {
    const U = ForgeUI, I = (n, s, c) => ForgeIcons.svg(n, s, c);
    const nutrition = await Forge.api.getNutrition();
    const t = nutrition.today;
    const calTarget = t.calories.target || 2500;
    const kcalPct = calTarget > 0 ? Math.min(100, Math.round(t.calories.value / calTarget * 100)) : 0;
    const todayStr = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

    const macroRows = t.macros.map(m => {
      const pct = m.target > 0 ? Math.min(100, Math.round(m.value / m.target * 100)) : 0;
      return `
      <div class="macro-row">
        <span class="mr-name">${m.label}</span>
        <div class="progress"><div class="progress-fill" data-w="${pct}" style="background:${m.color}"></div></div>
        <span class="mr-val"><strong>${m.value}</strong> / ${m.target} ${m.unit}</span>
      </div>`;
    }).join("");

    const totalProtein = t.macros.reduce((s, m) => m.key === "protein" ? s + m.value : s, 0);
    const mealCount = nutrition.meals.length;
    const protRemaining = t.proteinRemaining != null ? t.proteinRemaining : "—";
    const kcalRemaining = Math.max(0, calTarget - t.calories.value);

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>Nutrition</h1>
          <p class="sub">${todayStr} · lean bulk · ${calTarget.toLocaleString("en-IN")} kcal target</p>
        </div>
        <div class="page-actions">
          <button class="btn" id="btnWater">${I("droplet", 14)} Log water</button>
          <button class="btn btn-primary" id="btnFood">${I("plus", 14)} Log food</button>
          <button class="btn btn-primary" id="btnPlanDiet">${I("calendar", 14)} Plan My Diet</button>
          </div>
      </div>

      <div class="grid g2">
        <div class="card">
          <div class="card-head">
            <div><div class="card-title">Today's intake</div><div class="card-sub">Targets from your current plan</div></div>
            <span class="chip ${kcalPct >= 80 ? "chip-acc" : ""}">${kcalPct >= 80 ? "On track" : kcalPct > 0 ? "In progress" : "No data yet"}</span>
          </div>
          <div class="card-body">
            <div class="row" style="gap:22px;flex-wrap:wrap;margin-bottom:18px">
              ${U.confRing(kcalPct, 108)}
              <div>
                <div class="eyebrow">Calories</div>
                <div class="m-value-row" style="margin-top:6px">
                  <span class="m-value" data-count="${t.calories.value}">0</span>
                  <span class="m-unit">/ ${calTarget.toLocaleString("en-IN")} kcal</span>
                </div>
                <div class="m-delta up" style="margin-top:6px">${I("check", 13)} ${kcalRemaining} kcal remaining</div>
              </div>
            </div>
            ${macroRows}
            ${protRemaining !== "—" ? `<div class="remaining-callout">${I("target", 16)} <span>Protein remaining: <strong class="acc">${protRemaining} g</strong></span><small>· one shake closes the gap</small></div>` : ""}
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div><div class="card-title">Meals</div><div class="card-sub">${mealCount} entries · ${totalProtein} g protein total</div></div>
            <button class="btn btn-ghost btn-sm" id="btnAddMeal">${I("plus", 13)} Add</button>
          </div>
          <div class="card-body" style="padding-top:6px">
            ${mealCount > 0 ? nutrition.meals.map(me => `
              <div class="meal-item">
                <span class="meal-ico">${I(me.icon, 16)}</span>
                <div class="meal-body"><strong>${me.name}</strong><small>${me.detail}</small></div>
                <div class="meal-kcal"><strong>${me.kcal.toLocaleString("en-IN")}</strong><small>${me.protein} g protein</small></div>
              </div>`).join("") : `<div style="padding:24px;text-align:center;color:var(--text-3)">No meals logged today. Click <strong>Log food</strong> to start.</div>`}
            <div class="row spread mt" style="padding-top:12px;border-top:1px solid var(--border)">
              <span class="sub">${I("droplet", 14)} Water</span>
              <div class="row" style="flex:1;max-width:220px">
                ${t.water.value != null
                  ? `<div class="progress" style="flex:1"><div class="progress-fill" data-w="${Math.round(t.water.value / t.water.target * 100)}" style="background:var(--cyan)"></div></div>
                     <span class="m-target">${t.water.value} / ${t.water.target} L</span>`
                  : `<span class="m-target muted" style="flex:1">Not tracked yet</span>`}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="card chart-card">
          <div class="card-head">
            <div><div class="card-title">Calories · last 7 days</div><div class="card-sub">Dashed line = ${calTarget.toLocaleString("en-IN")} kcal target</div></div>
          </div>
          <div class="card-body"><div id="chKcalWeek"></div></div>
        </div>
      </div>
    `;

    if (nutrition.weekly.labels.length > 0) {
      ForgeCharts.bars(root.querySelector("#chKcalWeek"), {
        labels: nutrition.weekly.labels, values: nutrition.weekly.values,
        height: 210, target: nutrition.weekly.target, targetLabel: calTarget.toLocaleString("en-IN") + " target",
        color: "accent", unit: " kcal", unitLabel: "Calories",
        yFmt: v => v >= 1000 ? (v / 1000).toFixed(1) + "k" : v
      });
    } else {
      root.querySelector("#chKcalWeek").innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-3)">No calorie data yet. Start logging meals to see your weekly chart.</div>';
    }

    /* ---------- Nutrition lookup helpers ---------- */

    // Curated offline fallback table (per 100g): [kcal, protein, carbs, fat, fiber]
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
      "coconut water":   [19,  0.7, 3.7, 0.2, 1.1],
    };

    async function lookupNutrition(foodName) {
      // 1. Try Open Food Facts (free, CORS-enabled)
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
      } catch(e) { /* fall through to offline */ }

      // 2. Offline fallback
      const key = foodName.trim().toLowerCase();
      for (const [k, v] of Object.entries(OFFLINE_FOODS)) {
        if (key.includes(k) || k.includes(key)) {
          return { source: k, per100: { kcal: v[0], protein: v[1], carbs: v[2], fat: v[3], fiber: v[4] } };
        }
      }
      return null; // not found
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

    /* ---------- Food log modal ---------- */
    function openFoodModal() {
      if (!Forge.api.mode.includes("remote")) {
        ForgeUI.toast("Connect backend to log food");
        return;
      }

      const inpStyle = `width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);color:var(--text);font-family:inherit;font-size:14px`;
      const modal = document.createElement("div");
      modal.id = "foodModalOverlay";
      modal.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px)";

      modal.innerHTML = `
        <div class="card" style="width:100%;max-width:420px;padding:28px;background:var(--bg);border-radius:16px">
          <div style="margin-bottom:20px">
            <div class="card-title" style="font-size:18px">Log Food</div>
            <div class="muted" style="font-size:13px;margin-top:4px">Enter what you ate — we'll find the nutrition data.</div>
          </div>

          <div id="fdStep1" style="display:flex;flex-direction:column;gap:14px">
            <label>
              <div style="font-size:12px;font-weight:600;color:var(--text-2);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">What did you eat?</div>
              <input type="text" id="fdName" style="${inpStyle}" placeholder="e.g. Chicken Breast, Oats, Banana…" autofocus>
            </label>
            <div style="display:flex;gap:12px">
              <label style="flex:1">
                <div style="font-size:12px;font-weight:600;color:var(--text-2);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Amount (g)</div>
                <input type="number" id="fdGrams" style="${inpStyle}" value="100" min="1" max="5000">
              </label>
              <label style="flex:1;position:relative" id="fdMealWrap">
                <div style="font-size:12px;font-weight:600;color:var(--text-2);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Meal</div>
                <div id="fdMealToggle" style="${inpStyle};cursor:pointer;display:flex;justify-content:space-between;align-items:center;user-select:none">
                  <span id="fdMealLabel">Dinner</span>
                  <span style="font-size:10px;opacity:0.5">▼</span>
                </div>
                <div id="fdMealDrop" style="display:none;position:absolute;top:100%;left:0;right:0;margin-top:4px;background:var(--panel-2);border:1px solid var(--border);border-radius:8px;padding:4px;z-index:10;box-shadow:var(--shadow-2)">
                  <div class="mdrop-item" data-v="breakfast" style="padding:8px 12px;cursor:pointer;border-radius:4px;font-size:14px">Breakfast</div>
                  <div class="mdrop-item" data-v="lunch" style="padding:8px 12px;cursor:pointer;border-radius:4px;font-size:14px">Lunch</div>
                  <div class="mdrop-item" data-v="snack" style="padding:8px 12px;cursor:pointer;border-radius:4px;font-size:14px">Snack</div>
                  <div class="mdrop-item" data-v="pre_workout" style="padding:8px 12px;cursor:pointer;border-radius:4px;font-size:14px">Pre-workout</div>
                  <div class="mdrop-item" data-v="dinner" style="padding:8px 12px;cursor:pointer;border-radius:4px;font-size:14px;background:var(--accent-dim);color:var(--accent)">Dinner</div>
                  <div class="mdrop-item" data-v="post_workout" style="padding:8px 12px;cursor:pointer;border-radius:4px;font-size:14px">Post-workout</div>
                </div>
                <input type="hidden" id="fdMeal" value="dinner">
              </label>
            </div>
            <button class="btn btn-primary" id="fdLookup" style="width:100%;padding:12px;font-size:15px">
              Look up nutrition →
            </button>
            <div id="fdSearchStatus" style="text-align:center;font-size:13px;color:var(--text-3);min-height:20px"></div>
          </div>

          <div id="fdStep2" style="display:none;flex-direction:column;gap:14px">
            <div style="background:var(--bg-card);border-radius:10px;padding:16px;border:1px solid var(--border)">
              <div style="font-size:12px;font-weight:600;color:var(--text-2);margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">Found: <span id="fdFoundName" style="color:var(--accent)"></span></div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;text-align:center">
                <div><div id="rv_kcal" style="font-size:22px;font-weight:700;color:var(--accent)">—</div><div style="font-size:11px;color:var(--text-3);margin-top:2px">kcal</div></div>
                <div><div id="rv_protein" style="font-size:22px;font-weight:700">—</div><div style="font-size:11px;color:var(--text-3);margin-top:2px">protein</div></div>
                <div><div id="rv_carbs" style="font-size:22px;font-weight:700">—</div><div style="font-size:11px;color:var(--text-3);margin-top:2px">carbs</div></div>
                <div><div id="rv_fat" style="font-size:22px;font-weight:700">—</div><div style="font-size:11px;color:var(--text-3);margin-top:2px">fat</div></div>
              </div>
            </div>
            <div style="font-size:12px;color:var(--text-3);text-align:center" id="fdGramsLabel"></div>
            <div style="display:flex;gap:10px">
              <button class="btn btn-ghost" id="fdBack" style="flex:1">← Change food</button>
              <button class="btn btn-primary" id="fdConfirm" style="flex:2;padding:12px">Add food</button>
            <div id="fdFoodList" style="margin-top:8px;max-height:120px;overflow:auto;"></div>
            <button class="btn btn-ghost" id="fdAddSideDishToggle" style="margin-top:8px;">Add side dish</button>
            <div id="fdSideDishContainer" style="display:none;margin-top:8px;">
              <input type="text" id="fdSideDishName" placeholder="Side dish name" style="width:100%;margin-bottom:4px;" />
              <input type="number" id="fdSideDishGrams" placeholder="Grams" style="width:100%;margin-bottom:4px;" />
              <button class="btn btn-primary" id="fdAddSideDish" style="flex:2;padding:12px;">Add side dish</button>
            </div>
            <button class="btn btn-ghost" id="fdAddAnother" style="margin-top:8px;">Finish logging</button>
            </div>
          </div>

          <button id="fdClose" style="position:absolute;top:16px;right:16px;background:none;border:none;color:var(--text-3);cursor:pointer;font-size:20px;line-height:1;padding:4px">✕</button>
        </div>
      `;
      modal.style.position = "fixed"; // ensure positioned
      document.body.appendChild(modal);

      let foundNutrition = null; // { per100, source }
    let selectedFoods = [];
    const renderSelected = () => {
      const listEl = modal.querySelector('#fdFoodList');
      if (!listEl) return;
      listEl.innerHTML = selectedFoods.map((f,i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <span>${f.name} (${f.grams}g)</span>
          <span>${f.calc.kcal} kcal</span>
        </div>`).join('');
    };

      const cleanup = () => modal.remove();
      modal.addEventListener("click", (e) => { if (e.target === modal) cleanup(); });
      modal.querySelector("#fdClose").addEventListener("click", cleanup);

      const step1 = modal.querySelector("#fdStep1");
      const step2 = modal.querySelector("#fdStep2");
      const statusEl = modal.querySelector("#fdSearchStatus");

      // Custom dropdown logic
      const mealToggle = modal.querySelector("#fdMealToggle");
      const mealDrop = modal.querySelector("#fdMealDrop");
      const mealInput = modal.querySelector("#fdMeal");
      const mealLabel = modal.querySelector("#fdMealLabel");
      const mdropItems = modal.querySelectorAll(".mdrop-item");

      mealToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        mealDrop.style.display = mealDrop.style.display === "none" ? "block" : "none";
      });
      document.addEventListener("click", (e) => {
        if (!mealDrop.contains(e.target) && e.target !== mealToggle) {
          mealDrop.style.display = "none";
        }
      });
      mdropItems.forEach(item => {
        item.addEventListener("click", () => {
          mdropItems.forEach(i => { i.style.background = ""; i.style.color = ""; });
          item.style.background = "var(--accent-dim)";
          item.style.color = "var(--accent)";
          mealInput.value = item.getAttribute("data-v");
          mealLabel.textContent = item.textContent;
          mealDrop.style.display = "none";
        });
        item.addEventListener("mouseenter", () => { if (mealInput.value !== item.getAttribute("data-v")) item.style.background = "var(--bg-card)"; });
        item.addEventListener("mouseleave", () => { if (mealInput.value !== item.getAttribute("data-v")) item.style.background = ""; });
      });

      // Lookup handler
      modal.querySelector("#fdLookup").addEventListener("click", async () => {
        const name = modal.querySelector("#fdName").value.trim();
        const grams = parseFloat(modal.querySelector("#fdGrams").value);
        if (!name) { ForgeUI.toast("Enter a food name", "warn"); return; }
        if (!grams || grams < 1) { ForgeUI.toast("Enter a valid amount in grams", "warn"); return; }

        const btn = modal.querySelector("#fdLookup");
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner" style="display:inline-block;width:14px;height:14px;margin-right:8px"></span>Searching…';
        statusEl.textContent = "Looking up nutrition data…";

        const result = await lookupNutrition(name);

        btn.disabled = false;
        btn.innerHTML = "Look up nutrition →";

        if (!result) {
          statusEl.innerHTML = `<span style="color:var(--warn)">Not found. Try a simpler name (e.g. "chicken" instead of "grilled chicken tikka").</span>`;
          return;
        }

        foundNutrition = result;
        const calc = calcForGrams(result.per100, grams);

        // populate step 2
        modal.querySelector("#fdFoundName").textContent = result.source;
        modal.querySelector("#rv_kcal").textContent = calc.kcal;
        modal.querySelector("#rv_protein").textContent = calc.protein + "g";
        modal.querySelector("#rv_carbs").textContent = calc.carbs + "g";
        modal.querySelector("#rv_fat").textContent = calc.fat + "g";
        modal.querySelector("#fdGramsLabel").textContent = `Based on ${grams}g of ${name}`;

        step1.style.display = "none";
        step2.style.display = "flex";
      });

      // Back button
      modal.querySelector("#fdBack").addEventListener("click", () => {
        step1.style.display = "flex";
        step2.style.display = "none";
        foundNutrition = null;
      });

      // Confirm → add food to list (supports multiple entries)
      modal.querySelector("#fdConfirm").addEventListener("click", async () => {
        if (!foundNutrition) return;

        const name = modal.querySelector("#fdName").value.trim();
        const grams = parseFloat(modal.querySelector("#fdGrams").value);
        const mealType = modal.querySelector("#fdMeal").value;
        const calc = calcForGrams(foundNutrition.per100, grams);

        const confirmBtn = modal.querySelector("#fdConfirm");
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<span class="spinner" style="display:inline-block;width:14px;height:14px"></span>';

        try {
          // Create food item with per-100g values (serving_size = 100g, quantity = grams/100 servings)
          const foodResult = await Forge.api.createFood(
            name,
            100,
            foundNutrition.per100.kcal,
            foundNutrition.per100.protein,
            foundNutrition.per100.carbs,
            foundNutrition.per100.fat,
            foundNutrition.per100.fiber
          );
          if (!foodResult || !foodResult.id) throw new Error("Failed to create food item");

          // Log the food amount in grams directly
          await Forge.api.logFood(mealType, foodResult.id, grams);

          // Add to UI list
          selectedFoods.push({ name, grams, calc, foodId: foodResult.id, mealType });
          renderSelected();

          // Reset fields for next entry
          modal.querySelector("#fdName").value = "";
          modal.querySelector("#fdGrams").value = "";
          step1.style.display = "flex";
          step2.style.display = "none";
          foundNutrition = null;
        } catch (err) {
          ForgeUI.toast("Failed to add food", "warn");
          console.error(err);
        } finally {
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = "Add food";
        }
      });

      // Allow Enter key in the name field to trigger lookup
      modal.querySelector("#fdName").addEventListener("keydown", (e) => {
        if (e.key === "Enter") modal.querySelector("#fdLookup").click();
      });

      // Toggle side dish UI
      modal.querySelector("#fdAddSideDishToggle").addEventListener("click", () => {
        const container = modal.querySelector("#fdSideDishContainer");
        container.style.display = container.style.display === "none" ? "block" : "none";
      });

      // Add side dish entry
      modal.querySelector("#fdAddSideDish").addEventListener("click", async () => {
        const name = modal.querySelector("#fdSideDishName").value.trim();
        const grams = parseFloat(modal.querySelector("#fdSideDishGrams").value);
        if (!name || isNaN(grams) || grams <= 0) {
          ForgeUI.toast("Enter side dish name and grams", "warn");
          return;
        }
        const nutrition = await lookupNutrition(name);
        if (!nutrition) {
          ForgeUI.toast("Side dish not found", "warn");
          return;
        }
        const calc = calcForGrams(nutrition.per100, grams);
        try {
          const foodResult = await Forge.api.createFood(
            name,
            100,
            nutrition.per100.kcal,
            nutrition.per100.protein,
            nutrition.per100.carbs,
            nutrition.per100.fat,
            nutrition.per100.fiber
          );
          await Forge.api.logFood("side", foodResult.id, grams);
          selectedFoods.push({ name, grams, calc, foodId: foodResult.id, mealType: "side" });
          renderSelected();
          modal.querySelector("#fdSideDishName").value = "";
          modal.querySelector("#fdSideDishGrams").value = "";
        } catch (e) {
          ForgeUI.toast("Failed to add side dish", "warn");
          console.error(e);
        }
      });

      // Finish logging – close modal
      modal.querySelector("#fdAddAnother").addEventListener("click", () => {
        cleanup();
      });
    }

    root.querySelector("#btnFood").addEventListener("click", openFoodModal);
    const addMealBtn = root.querySelector("#btnAddMeal");
    if (addMealBtn) addMealBtn.addEventListener("click", openFoodModal);
    root.querySelector("#btnWater").addEventListener("click", () => ForgeUI.toast("Water logged · +250 ml"));

    /* ---------- Diet Planner Modal ---------- */
    root.querySelector("#btnPlanDiet").addEventListener("click", openDietPlannerModal);

    function openDietPlannerModal() {
      const inpStyle = `width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);color:var(--text);font-family:inherit;font-size:14px;box-sizing:border-box;`;

      const DESI_FOODS = [
        { key: "eggs",          label: "Eggs",           unit: "pcs",  gPerUnit: 55,  per100: { kcal: 155, protein: 13,  carbs: 1.1, fat: 11, fiber: 0 } },
        { key: "dal",           label: "Dal (Lentils)",  unit: "g",    gPerUnit: 1,   per100: { kcal: 116, protein: 7,   carbs: 20,  fat: 2,  fiber: 4 } },
        { key: "soy",           label: "Soya Chunks",    unit: "g",    gPerUnit: 1,   per100: { kcal: 345, protein: 52,  carbs: 33,  fat: 0.5,fiber: 13} },
        { key: "rice",          label: "Rice (cooked)",  unit: "g",    gPerUnit: 1,   per100: { kcal: 130, protein: 2.7, carbs: 28,  fat: 0.3,fiber: 0.4}},
        { key: "roti",          label: "Roti / Chapati", unit: "pcs",  gPerUnit: 40,  per100: { kcal: 297, protein: 8,   carbs: 55,  fat: 4,  fiber: 2.5}},
        { key: "chicken",       label: "Chicken Breast", unit: "g",    gPerUnit: 1,   per100: { kcal: 165, protein: 31,  carbs: 0,   fat: 3.6,fiber: 0 } },
        { key: "paneer",        label: "Paneer",         unit: "g",    gPerUnit: 1,   per100: { kcal: 265, protein: 18,  carbs: 3.5, fat: 21, fiber: 0 } },
        { key: "oats",          label: "Oats",           unit: "g",    gPerUnit: 1,   per100: { kcal: 389, protein: 17,  carbs: 66,  fat: 7,  fiber: 10} },
        { key: "milk",          label: "Milk",           unit: "ml",   gPerUnit: 1,   per100: { kcal: 61,  protein: 3.2, carbs: 4.8, fat: 3.3,fiber: 0 } },
        { key: "whey",          label: "Whey Protein",   unit: "g",    gPerUnit: 1,   per100: { kcal: 400, protein: 80,  carbs: 10,  fat: 5,  fiber: 0 } },
        { key: "peanut_butter", label: "Peanut Butter",  unit: "g",    gPerUnit: 1,   per100: { kcal: 588, protein: 25,  carbs: 20,  fat: 50, fiber: 6 } },
        { key: "banana",        label: "Banana",         unit: "pcs",  gPerUnit: 120, per100: { kcal: 89,  protein: 1.1, carbs: 23,  fat: 0.3,fiber: 2.6}},
      ];

      const overlay = document.createElement("div");
      overlay.id = "dietPlannerOverlay";
      overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.78);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);animation:fadeIn .2s ease";

      overlay.innerHTML = `
        <style>
          @keyframes fadeIn { from{opacity:0} to{opacity:1} }
          @keyframes slideUp { from{transform:translateY(30px);opacity:0} to{transform:translateY(0);opacity:1} }
          #dietPlannerBox { animation: slideUp .25s ease; }
          .dp-food-row { display:grid; grid-template-columns:1fr auto auto; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--border); }
          .dp-food-row:last-child { border-bottom:none; }
          .dp-unit { font-size:12px; color:var(--text-3); width:30px; text-align:right; }
          .dp-meal { background:var(--bg-card); border-radius:12px; padding:14px 16px; margin-bottom:10px; border:1px solid var(--border); }
          .dp-meal-title { font-size:13px; font-weight:700; color:var(--accent); text-transform:uppercase; letter-spacing:.5px; margin-bottom:8px; }
          .dp-meal-item { display:flex; justify-content:space-between; font-size:14px; padding:3px 0; }
          .dp-meal-item small { color:var(--text-3); font-size:12px; }
          .dp-total-row { display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-top:1px solid var(--border); margin-top:8px; font-weight:700; }
          .dp-macros { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:10px; }
          .dp-macro-card { background:var(--bg-card); border-radius:10px; padding:10px; text-align:center; border:1px solid var(--border); }
          .dp-macro-val { font-size:20px; font-weight:800; }
          .dp-macro-lbl { font-size:11px; color:var(--text-3); margin-top:2px; }
          .dp-log-btn { background:var(--accent-dim); color:var(--accent); border:1px solid var(--accent); border-radius:6px; padding:4px 10px; font-size:12px; cursor:pointer; font-weight:600; transition:background .15s; }
          .dp-log-btn:hover { background:var(--accent); color:#fff; }
        </style>
        <div id="dietPlannerBox" class="card" style="width:100%;max-width:560px;max-height:90vh;overflow-y:auto;padding:28px;background:var(--bg);border-radius:20px;position:relative;scrollbar-width:thin;">
          <div style="margin-bottom:22px">
            <div class="card-title" style="font-size:20px">🥗 Plan My Diet</div>
            <div class="muted" style="font-size:13px;margin-top:4px">Tell me how much of each food you have available. I'll build a daily meal plan for you.</div>
          </div>

          <div id="dpStep1">
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-2);margin-bottom:12px">What do you have available?</div>
            ${DESI_FOODS.map(f => `
              <div class="dp-food-row">
                <span style="font-size:14px;font-weight:500">${f.label}</span>
                <input type="number" id="dp_${f.key}" min="0" placeholder="0" style="${inpStyle}width:90px;text-align:center" />
                <span class="dp-unit">${f.unit}</span>
              </div>`).join("")}

            <div style="margin-top:20px;display:flex;gap:12px;align-items:center">
              <label style="font-size:13px;font-weight:600;color:var(--text-2);white-space:nowrap">Daily calorie target:</label>
              <input type="number" id="dpCalTarget" value="${calTarget}" min="1000" max="5000" style="${inpStyle}width:120px;text-align:center" />
              <span style="font-size:13px;color:var(--text-3)">kcal</span>
            </div>

            <button id="dpGenerate" class="btn btn-primary" style="width:100%;padding:13px;font-size:15px;margin-top:20px;border-radius:10px">
              ✨ Generate My Diet Plan
            </button>
          </div>

          <div id="dpStep2" style="display:none">
            <div id="dpPlanOutput"></div>
            <div style="display:flex;gap:10px;margin-top:18px">
              <button id="dpBack" class="btn btn-ghost" style="flex:1">← Adjust</button>
              <button id="dpLogAll" class="btn btn-primary" style="flex:2;padding:12px">📋 Log All Meals</button>
            </div>
          </div>

          <button id="dpClose" style="position:absolute;top:16px;right:16px;background:none;border:none;color:var(--text-3);cursor:pointer;font-size:20px;padding:4px">✕</button>
        </div>
      `;

      document.body.appendChild(overlay);
      const cleanup = () => overlay.remove();
      overlay.addEventListener("click", e => { if (e.target === overlay) cleanup(); });
      overlay.querySelector("#dpClose").addEventListener("click", cleanup);
      overlay.querySelector("#dpBack").addEventListener("click", () => {
        overlay.querySelector("#dpStep1").style.display = "block";
        overlay.querySelector("#dpStep2").style.display = "none";
      });

      overlay.querySelector("#dpGenerate").addEventListener("click", () => {
        const target = parseFloat(overlay.querySelector("#dpCalTarget").value) || calTarget;

        // Build availability pool
        const pool = DESI_FOODS.map(f => {
          const inp = parseFloat(overlay.querySelector(`#dp_${f.key}`)?.value) || 0;
          const grams = f.unit === "pcs" || f.unit === "ml" ? inp * f.gPerUnit : inp;
          return { ...f, availableGrams: grams };
        }).filter(f => f.availableGrams > 0);

        if (pool.length === 0) {
          ForgeUI.toast("Add at least one food item to plan", "warn");
          return;
        }

        // Smart local diet planner: distribute across 4 meals
        const MEALS = [
          { name: "Breakfast 🌅", ratio: 0.25 },
          { name: "Lunch 🍛",      ratio: 0.35 },
          { name: "Snack 🥜",      ratio: 0.15 },
          { name: "Dinner 🌙",     ratio: 0.25 },
        ];

        // Sort pool: highest protein density first
        const sortedPool = [...pool].sort((a, b) => b.per100.protein - a.per100.protein);
        const remaining = sortedPool.map(f => ({ ...f, usedGrams: 0 }));

        const mealPlans = MEALS.map(meal => {
          const mealKcalTarget = target * meal.ratio;
          let mealKcal = 0;
          const items = [];

          for (const food of remaining) {
            if (mealKcal >= mealKcalTarget) break;
            const need = mealKcalTarget - mealKcal;
            const gramsForNeed = Math.round((need / food.per100.kcal) * 100);
            const available = food.availableGrams - food.usedGrams;
            if (available <= 0) continue;
            const grams = Math.min(gramsForNeed, available, food.unit === "pcs" ? food.gPerUnit * 4 : 300);
            if (grams < 10) continue;
            const f = grams / 100;
            const contrib = {
              name: food.label,
              grams,
              kcal: Math.round(food.per100.kcal * f),
              protein: Math.round(food.per100.protein * f * 10) / 10,
              per100: food.per100,
              foodKey: food.key,
            };
            items.push(contrib);
            food.usedGrams += grams;
            mealKcal += contrib.kcal;
          }

          return { ...meal, items, totalKcal: Math.round(mealKcal) };
        });

        const grandTotal = mealPlans.reduce((s, m) => ({
          kcal: s.kcal + m.totalKcal,
          protein: s.protein + m.items.reduce((p, i) => p + i.protein, 0),
          carbs: s.carbs + m.items.reduce((c, i) => c + Math.round(i.per100.carbs * i.grams / 100 * 10) / 10, 0),
          fat: s.fat + m.items.reduce((ft, i) => ft + Math.round(i.per100.fat * i.grams / 100 * 10) / 10, 0),
        }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });

        // Store plan for bulk log
        overlay._plan = mealPlans;
        overlay._pool = remaining;

        const pctHit = Math.round(grandTotal.kcal / target * 100);
        const outputEl = overlay.querySelector("#dpPlanOutput");
        outputEl.innerHTML = `
          <div style="font-size:13px;color:var(--text-2);margin-bottom:14px">
            Plan covers <strong style="color:var(--accent)">${grandTotal.kcal.toLocaleString("en-IN")} kcal</strong> (${pctHit}% of ${target.toLocaleString("en-IN")} kcal target)
          </div>
          <div class="dp-macros" style="margin-bottom:18px">
            <div class="dp-macro-card"><div class="dp-macro-val" style="color:var(--accent)">${Math.round(grandTotal.kcal)}</div><div class="dp-macro-lbl">kcal</div></div>
            <div class="dp-macro-card"><div class="dp-macro-val" style="color:#60d394">${Math.round(grandTotal.protein)}g</div><div class="dp-macro-lbl">protein</div></div>
            <div class="dp-macro-card"><div class="dp-macro-val" style="color:#fbbf24">${Math.round(grandTotal.carbs)}g</div><div class="dp-macro-lbl">carbs</div></div>
            <div class="dp-macro-card"><div class="dp-macro-val" style="color:#f472b6">${Math.round(grandTotal.fat)}g</div><div class="dp-macro-lbl">fat</div></div>
          </div>
          ${mealPlans.map((meal, mi) => `
            <div class="dp-meal">
              <div class="dp-meal-title">${meal.name}</div>
              ${meal.items.length === 0 ? `<div style="color:var(--text-3);font-size:13px">No foods allocated for this meal</div>` :
                meal.items.map((item, ii) => `
                  <div class="dp-meal-item">
                    <span>${item.name} <small>(${item.grams}g)</small></span>
                    <span>${item.kcal} kcal · <small>${item.protein}g protein</small></span>
                  </div>`).join("")}
              <div class="dp-total-row">
                <span style="font-size:13px;color:var(--text-2)">Meal total</span>
                <span>${meal.totalKcal} kcal</span>
              </div>
            </div>`).join("")}
        `;

        overlay.querySelector("#dpStep1").style.display = "none";
        overlay.querySelector("#dpStep2").style.display = "block";
      });

      // Log all meals to backend
      overlay.querySelector("#dpLogAll").addEventListener("click", async () => {
        if (!overlay._plan) return;
        if (!Forge.api.mode.includes("remote")) {
          ForgeUI.toast("Connect backend to log meals", "warn");
          return;
        }
        const btn = overlay.querySelector("#dpLogAll");
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner" style="display:inline-block;width:14px;height:14px;margin-right:8px"></span> Logging…';
        const mealTypeMap = ["breakfast", "lunch", "snack", "dinner"];
        let logged = 0;
        try {
          for (let mi = 0; mi < overlay._plan.length; mi++) {
            const meal = overlay._plan[mi];
            const mealType = mealTypeMap[mi];
            for (const item of meal.items) {
              const foodResult = await Forge.api.createFood(
                item.name, 100,
                item.per100.kcal, item.per100.protein,
                item.per100.carbs, item.per100.fat,
                item.per100.fiber || 0
              );
              if (foodResult && foodResult.id) {
                await Forge.api.logFood(mealType, foodResult.id, item.grams);
                logged++;
              }
            }
          }
          ForgeUI.toast(`✅ Logged ${logged} foods from your diet plan!`);
          cleanup();
          Forge.pages.nutrition(root);
        } catch (err) {
          ForgeUI.toast("Failed to log some foods", "warn");
          console.error(err);
        } finally {
          btn.disabled = false;
          btn.innerHTML = "📋 Log All Meals";
        }
      });
    }
  };
})();
