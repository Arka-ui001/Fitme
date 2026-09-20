/* ForgeAI — AI Analysis page (upload → CV pipeline → result) */
(function () {
  window.Forge = window.Forge || {};
  Forge.pages = Forge.pages || {};

  Forge.pages.analysis = async function (root, params) {
    const U = ForgeUI, I = (n, s, c) => ForgeIcons.svg(n, s, c);
    const A = await Forge.api.getAnalysis();

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>AI Analysis</h1>
          <p class="sub">Computer-vision analysis of progress photos and workout video.</p>
        </div>
      </div>

      <div class="grid g32">
        <div class="stack">
          <!-- ===== UPLOAD ZONE ===== -->
          <div class="card">
            <div class="card-head"><div><div class="card-title">New analysis</div><div class="card-sub">ForgeAI will analyze posture, movement and visible progress</div></div></div>
            <div class="card-body">
              <div class="upload" id="upZone" role="button" tabindex="0" aria-label="Upload photo or video">
                <span class="up-icon">${I("upload", 24)}</span>
                <h3>Drop a progress photo or workout video</h3>
                <p>or click to browse — ForgeAI aligns, analyzes and compares against your history.</p>
                <div class="up-formats row" style="gap:6px">
                  <span class="chip">${I("camera", 12)} JPG · PNG</span>
                  <span class="chip">${I("video", 12)} MP4 · MOV · up to 60s</span>
                </div>
                <input type="file" id="upInput" accept="image/*,video/*">
              </div>
              <div class="row spread mt" style="flex-wrap:wrap">
                <span class="sub">Processing runs on-device in this demo.</span>
                <button class="btn btn-soft" id="btnDemo">${I("play", 13)} Run demo analysis</button>
              </div>
              <div id="upPreviewWrap" style="display:none;margin-top:14px"></div>
            </div>
          </div>

          <!-- ===== PIPELINE ===== -->
          <div class="card" id="pipeCard" style="display:none">
            <div class="card-head">
              <div><div class="card-title">Processing</div><div class="card-sub" id="pipeSub">Analyzing input…</div></div>
              <span class="chip chip-acc">${I("zap", 12)} forge-vision v0.3</span>
            </div>
            <div class="card-body">
              <div class="pl-bar"><i id="plFill"></i></div>
              <div class="steps" id="plSteps">
                ${A.pipeline.map(s => `
                  <div class="step" data-k="${s.key}">
                    <span class="st-ico">${I({ cv: "scan", pose: "user", history: "clock", assess: "spark" }[s.key] || "scan", 14)}</span>
                    <div><strong>${s.label}</strong><br><small class="muted">${s.detail}</small></div>
                    <span class="st-state" style="margin-left:auto"></span>
                  </div>`).join("")}
              </div>
            </div>
          </div>

          <!-- ===== RESULT ===== -->
          <div id="resultSlot"></div>
        </div>

        <!-- ===== SIDEBAR INFO ===== -->
        <div class="stack">
          <div class="card">
            <div class="card-head"><div><div class="card-title">What ForgeAI checks</div><div class="card-sub">Analysis pipeline</div></div></div>
            <div class="card-body" style="padding-top:6px">
              ${[
                ["scan", "Pose landmarks", "34 keypoints per frame, aligned across sessions"],
                ["compare", "Visible progress", "Region deltas vs your historical photo sets"],
                ["video", "Movement quality", "Depth, tempo, bar path and symmetry on video"],
                ["shieldcheck", "Honesty limits", "Low-confidence findings are flagged, never hidden"]
              ].map(x => `
                <div class="list-item">
                  <span class="obs-ico">${I(x[0], 14)}</span>
                  <div class="obs-body"><strong>${x[1]}</strong><p>${x[2]}</p></div>
                </div>`).join("")}
            </div>
          </div>

          <div class="card">
            <div class="card-head"><div><div class="card-title">Recent analyses</div><div class="card-sub">Last 4 runs</div></div></div>
            <div class="card-body" style="padding-top:6px">
              ${A.recent.map(r => `
                <div class="list-item">
                  <span class="tl-ico">${I(r.type === "Video" ? "video" : "camera", 15)}</span>
                  <div class="obs-body" style="flex:1"><strong>${r.type} · ${r.date}</strong><p>${r.note}</p></div>
                  ${U.chip(r.status, r.status.includes("high") ? "chip-good" : "chip-warn")}
                </div>`).join("")}
            </div>
          </div>

          <div class="card">
            <div class="card-body">
              <div class="eyebrow">${I("info", 13)} Note</div>
              <p class="sub mt" style="margin-top:8px">Analyses are observational, not medical. ForgeAI flags uncertainty instead of overclaiming — see <a href="#/evaluation" style="color:var(--accent)">Evaluation</a> for accuracy history.</p>
            </div>
          </div>
        </div>
      </div>
    `;

    /* ---------- behaviour ---------- */
    const zone = root.querySelector("#upZone");
    const input = root.querySelector("#upInput");
    const previewWrap = root.querySelector("#upPreviewWrap");
    const pipeCard = root.querySelector("#pipeCard");
    const plFill = root.querySelector("#plFill");
    const resultSlot = root.querySelector("#resultSlot");
    let running = false;

    function showPreview(file) {
      previewWrap.style.display = "";
      previewWrap.innerHTML = "";
      const box = document.createElement("div");
      box.className = "up-preview";
      if (file && file.type.startsWith("image/")) {
        const img = document.createElement("img");
        img.src = URL.createObjectURL(file);
        box.appendChild(img);
      } else {
        box.innerHTML = `<div style="display:grid;place-items:center;height:140px;background:var(--bg-soft)">
          ${I("video", 30)}<div style="margin-top:8px;font-size:12.5px;color:var(--text-2)">${file ? file.name : "demo-input.mp4"} · 0:45</div></div>`;
      }
      const scan = document.createElement("div");
      scan.className = "scan";
      box.appendChild(scan);
      previewWrap.appendChild(box);
    }

    function startPipeline(file) {
      if (running) return;
      running = true;
      resultSlot.innerHTML = "";
      showPreview(file);
      pipeCard.style.display = "";
      pipeCard.querySelector("#pipeSub").textContent = file ? file.name : "Demo input · September front photo";
      const steps = [...root.querySelectorAll("#plSteps .step")];
      const durs = [850, 1050, 1150, 950];
      steps.forEach(s => { s.classList.remove("active", "done"); s.querySelector(".st-state").innerHTML = ""; });
      plFill.style.width = "0%";

      let i = 0;
      function next() {
        if (i > 0) {
          steps[i - 1].classList.remove("active");
          steps[i - 1].classList.add("done");
          steps[i - 1].querySelector(".st-state").innerHTML = I("check", 14);
        }
        if (i >= steps.length) {
          plFill.style.width = "100%";
          setTimeout(() => { renderResult(file); running = false; }, 350);
          return;
        }
        steps[i].classList.add("active");
        steps[i].querySelector(".st-state").innerHTML = '<span class="spinner"></span>';
        plFill.style.width = Math.round(((i + 0.4) / steps.length) * 100) + "%";
        setTimeout(() => { i++; next(); }, durs[i]);
      }
      next();
      if (pipeCard.scrollIntoView) pipeCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function renderResult(file) {
      const r = A.result;
      const isVideo = file && file.type.startsWith("video/");
      resultSlot.innerHTML = `
        <div class="card" id="resultCard">
          <div class="card-head">
            <div><div class="card-title">${isVideo ? "Movement analysis · " + (file ? file.name : "squat set") : r.title}</div>
            <div class="card-sub">Completed ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · forge-vision v0.3</div></div>
            ${U.confRing(r.confidence, 58)}
          </div>
          <div class="card-body">
            <div class="result-sec">
              <div class="rs-head">${I("scan", 13)} Analysis</div>
              <div class="rs-body">${r.analysis}</div>
            </div>
            <div class="result-sec">
              <div class="rs-head">${I("layers", 13)} Evidence</div>
              <div class="evi-list">${r.evidence.map(e => `<div class="evi-item">${I("check", 13)} ${e}</div>`).join("")}</div>
            </div>
            <div class="result-sec">
              <div class="rs-head">${I("target", 13)} Confidence</div>
              <div class="row" style="flex-wrap:wrap">
                ${U.chip(r.confidence + "% overall", "chip-acc")} ${U.chip("pose match 96%", "chip-info")} ${U.chip("lighting variance: moderate", "chip-warn")}
              </div>
              <div class="progress mt" style="max-width:340px"><div class="progress-fill" data-w="${r.confidence}"></div></div>
            </div>
            <div class="result-sec">
              <div class="rs-head" style="color:var(--warn)">${I("alert", 13)} Limitations</div>
              <ul class="limit-list">${r.limitations.map(l => `<li>${l}</li>`).join("")}</ul>
            </div>
            <div class="result-sec">
              <div class="rs-head">${I("spark", 13)} Recommendations</div>
              <ol class="rec-list">${r.recommendations.map(rc => `<li>${rc}</li>`).join("")}</ol>
            </div>
            <div class="row mt" style="justify-content:flex-end;padding-top:14px;border-top:1px solid var(--border)">
              <button class="btn btn-ghost" id="resDiscard">Discard</button>
              <button class="btn" id="resEval">${I("shieldcheck", 14)} Send to evaluation</button>
              <button class="btn btn-primary" id="resSave">${I("check", 14)} Save to history</button>
            </div>
          </div>
        </div>`;
      U.animateIn(resultSlot);
      if (resultSlot.scrollIntoView) resultSlot.scrollIntoView({ behavior: "smooth", block: "nearest" });
      root.querySelector("#resSave").addEventListener("click", () => ForgeUI.toast("Analysis saved to history"));
      root.querySelector("#resDiscard").addEventListener("click", () => { resultSlot.innerHTML = ""; pipeCard.style.display = "none"; previewWrap.style.display = "none"; });
      root.querySelector("#resEval").addEventListener("click", () => { ForgeUI.toast("Queued for evaluation"); setTimeout(() => location.hash = "#/evaluation", 600); });
    }

    /* upload wiring */
    zone.addEventListener("click", () => input.click());
    zone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") input.click(); });
    input.addEventListener("change", () => { if (input.files[0]) startPipeline(input.files[0]); });
    ["dragover", "dragenter"].forEach(ev => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("drag"); }));
    ["dragleave", "drop"].forEach(ev => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove("drag"); }));
    zone.addEventListener("drop", (e) => {
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) startPipeline(f);
    });
    root.querySelector("#btnDemo").addEventListener("click", () => startPipeline(null));

    /* deep-link: #/analysis?demo=1 */
    if (params && params.get && params.get("demo") === "1") setTimeout(() => startPipeline(null), 500);
  };
})();
