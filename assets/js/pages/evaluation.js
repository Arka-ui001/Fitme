/* ForgeAI — Evaluation page (internal: grade past AI analyses) */
(function () {
  window.Forge = window.Forge || {};
  Forge.pages = Forge.pages || {};

  const FB = {
    correct: { cls: "ok", icon: "check", label: "Correct" },
    partial: { cls: "part", icon: "alert", label: "Partially correct" },
    wrong: { cls: "bad", icon: "x", label: "Incorrect" }
  };

  Forge.pages.evaluation = async function (root) {
    const U = ForgeUI, I = (n, s, c) => ForgeIcons.svg(n, s, c);
    const ev = await Forge.api.getEvaluation();
    const feedback = {}; // id -> key (replace with POST /api/evaluation in backend)
    ev.items.forEach(it => { if (it.feedback) feedback[it.id] = it.feedback; });

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>Evaluation</h1>
          <p class="sub">Internal · grade past AI analyses to improve ForgeAI's accuracy.</p>
        </div>
        <div class="page-actions">
          <span class="chip">${I("info", 12)} Feedback tunes the harness — no silent model updates</span>
        </div>
      </div>

      <div class="eval-stats">
        <div class="s-chip"><small>Analyses evaluated</small><strong data-count="${ev.stats.total}">0</strong></div>
        <div class="s-chip"><small>Marked correct</small><strong data-count="${ev.stats.correctPct}">0</strong> <span class="muted" style="font-size:11px">% accurate</span></div>
        <div class="s-chip"><small>Incorrect</small><strong data-count="${ev.stats.incorrectPct}">0</strong> <span class="muted" style="font-size:11px">% of runs</span></div>
        <div class="s-chip"><small>Avg confidence</small><strong data-count="${ev.stats.avgConfidence}">0</strong> <span class="muted" style="font-size:11px">% claimed</span></div>
      </div>

      <div class="section stack" id="evalList">
        ${ev.items.map(it => evalCard(it)).join("")}
      </div>
    `;

    function evalCard(it) {
      const typeIco = { photo: "camera", video: "video", chat: "message" }[it.input] || "file";
      const typeCls = { photo: "chip-info", video: "chip", chat: "chip-acc" }[it.input] || "chip";
      const fbk = feedback[it.id];
      return `
        <div class="card eval-card ${fbk ? "fb-" + fbk : ""}" data-id="${it.id}">
          <div class="card-body">
            <div class="eval-top">
              <span class="chip ${typeCls}">${I(typeIco, 12)} ${it.inputLabel}</span>
              <span class="muted" style="font-size:12px">${it.date}</span>
              <span style="margin-left:auto">${U.confRing(it.confidence, 44, fbk === "wrong" ? "var(--danger)" : "var(--accent)")}</span>
            </div>
            <p class="sub" style="margin-top:10px">${it.summary}</p>
            <div class="eval-conclusion"><span class="mm-label">AI conclusion</span>${it.conclusion}</div>
            <div class="fb-btns">
              ${Object.keys(FB).map(k => {
                const f = FB[k];
                return `<button class="fb-btn ${f.cls}${fbk === k ? " sel" : ""}" data-fb="${k}">
                  ${I(f.icon, 13)} ${f.label}</button>`;
              }).join("")}
              <span class="fb-status muted" style="margin-left:auto;align-self:center;font-size:12px">
                ${fbk ? "Marked as " + FB[fbk].label.toLowerCase() : "Awaiting your review"}
              </span>
            </div>
          </div>
        </div>`;
    }

    root.querySelector("#evalList").addEventListener("click", (e) => {
      const btn = e.target.closest(".fb-btn");
      if (!btn) return;
      const card = btn.closest(".eval-card");
      const id = card.getAttribute("data-id");
      const key = btn.getAttribute("data-fb");
      feedback[id] = key;
      card.classList.remove("fb-correct", "fb-partial", "fb-wrong");
      card.classList.add("fb-" + key);
      card.querySelectorAll(".fb-btn").forEach(b => b.classList.toggle("sel", b === btn));
      const ring = card.querySelector(".cr-anim");
      if (ring) ring.style.stroke = key === "wrong" ? "var(--danger)" : "var(--accent)";
      const status = card.querySelector(".fb-status");
      if (status) status.textContent = "Marked as " + FB[key].label.toLowerCase();
      // Backend hook: POST /api/evaluation { id, feedback: key }
      ForgeUI.toast("Feedback recorded · " + FB[key].label.toLowerCase(), key === "wrong" ? "warn" : undefined);
    });
  };
})();
