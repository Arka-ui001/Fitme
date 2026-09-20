/* ForgeAI — History page */
(function () {
  window.Forge = window.Forge || {};
  Forge.pages = Forge.pages || {};

  const TYPES = {
    workout:   { icon: "dumbbell", label: "Workouts" },
    nutrition: { icon: "utensils", label: "Nutrition" },
    photo:     { icon: "camera",   label: "Photos" },
    analysis:  { icon: "scan",     label: "Analyses" },
    measurement: { icon: "ruler",  label: "Measurements" }
  };
  const FILTERS = [
    { id: "all", label: "All" },
    { id: "workout", label: "Workouts" },
    { id: "nutrition", label: "Nutrition" },
    { id: "photo", label: "Photos" },
    { id: "analysis", label: "Analyses" },
    { id: "measurement", label: "Measurements" }
  ];

  Forge.pages.history = async function (root) {
    const U = ForgeUI, I = (n, s, c) => ForgeIcons.svg(n, s, c);
    const items = await Forge.api.getHistory();
    let filter = "all";

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>History</h1>
          <p class="sub">Everything ForgeAI has logged · ${items.length} entries</p>
        </div>
        <div class="segmented" id="histFilter">
          ${FILTERS.map(f => `<button class="seg-btn${f.id === "all" ? " active" : ""}" data-f="${f.id}">${f.label}</button>`).join("")}
        </div>
      </div>
      <div id="histList"></div>
    `;

    function renderList() {
      const filtered = filter === "all" ? items : items.filter(x => x.type === filter);
      const dates = [...new Set(filtered.map(x => x.date))];
      const list = root.querySelector("#histList");
      if (!filtered.length) {
        list.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:40px">
          <p class="sub">No ${TYPES[filter] ? TYPES[filter].label.toLowerCase() : ""} entries yet.</p></div></div>`;
        return;
      }
      list.innerHTML = dates.map(d => `
        <div class="tl-day">
          <div class="tl-date"><strong>${d.split(",")[0]}</strong>${d.split(",")[1] || ""}</div>
          <div class="tl-entries">
            ${filtered.filter(x => x.date === d).map(x => {
              const t = TYPES[x.type] || TYPES.workout;
              return `<div class="tl-entry${x.hl ? " hl" : ""}">
                <span class="tl-ico">${I(t.icon, 15)}</span>
                <div class="tl-body">
                  <strong>${x.title}</strong>
                  <small>${t.label}</small>
                  <div class="tl-meta">${x.meta.map(m => U.chip(m, x.hl && /PR|pr/.test(m) ? "chip-acc" : "")).join("")}</div>
                </div>
                <span class="muted" style="font-size:11px;white-space:nowrap">${x.hl ? I("zap", 13) : ""}</span>
              </div>`;
            }).join("")}
          </div>
        </div>`).join("");
    }

    root.querySelectorAll("#histFilter .seg-btn").forEach(b => {
      b.addEventListener("click", () => {
        root.querySelectorAll("#histFilter .seg-btn").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        filter = b.getAttribute("data-f");
        renderList();
      });
    });

    renderList();
  };
})();
