/* ForgeAI — AI Coach page */
(function () {
  window.Forge = window.Forge || {};
  Forge.pages = Forge.pages || {};

  /* Placeholder "brain" — replace with a real API call:
     POST /api/coach { message, thread_id } → { text, evidence, confidence, data } */
  const BRAIN = [
    {
      re: /chest|bench|press/i,
      text: "Based on your last 6 weeks of training, your chest volume is consistent, but your pressing progression has plateaued around 25 kg for 6–8 reps. The Sep 12 photo comparison shows only marginal chest change while shoulders and back improved — the limiter is progressive overload, not volume. I'd add 1–2.5 kg increments or a second pressing angle before adding sets.",
      evidence: ["6 weeks workout history", "4 progress photos", "nutrition history"],
      confidence: 84, data: ["Bench: 25 kg × 8 → 8 (4 wks)", "Chest volume: 14 sets/wk"]
    },
    {
      re: /protein|nutrition|eat|diet|calorie|food/i,
      text: "You're averaging 121 g protein this week against a 130 g target — close, but the gap shows up on training days. Easiest fix: a 25 g whey shake on rest days too. Calories are fine at 2,430–2,510; no change needed there.",
      evidence: ["nutrition history", "14-day food log"],
      confidence: 91, data: ["Weekly avg: 121 g / 130 g", "Calories: 2,436 avg"]
    },
    {
      re: /bulk|cut|weight|gain/i,
      text: "Hold the lean bulk. Since June you've gained 1.8 kg while your waist dropped 1.2 cm — that's the lean-gain pattern we want. A cut now would interrupt your best consistency stretch of the year. Re-assess at 66 kg or if waist trends up two weeks running.",
      evidence: ["measurement history", "4 photo sets", "bodyweight trend"],
      confidence: 88, data: ["Weight: 61.8 → 63.6 kg", "Waist: 74.2 → 73.0 cm"]
    },
    {
      re: /sleep|recovery|rest|sore|fatigue/i,
      text: "Recovery markers look normal for your volume: soreness resolves within 48h and your Tuesday–Thursday performance dip is small. Sleep is the one lever I can't see — if it's under 7h, that's where I'd look first before touching program volume.",
      evidence: ["12 weeks workout history", "session performance data"],
      confidence: 80, data: ["Avg sessions/wk: 4.2", "Deload due: not yet"]
    },
    {
      re: /plan|routine|split|program|schedule/i,
      text: "Your current Push/Pull/Legs rotation fits your schedule well — 5 planned sessions, 4.2 average completion. I'd keep the structure and only change exercise selection when progression stalls 3+ weeks (as with bench now). Next deload window: week 41.",
      evidence: ["12 weeks workout history", "consistency grid"],
      confidence: 86, data: ["Split: PPL · 5 days", "Next deload: W41"]
    }
  ];
  const FALLBACK = {
    text: "I can dig into your training, nutrition, recovery or progress photos — all of your logged data is local to this workspace. Ask me something specific, like “why is my bench stalled?” or “how's my protein this week?”",
    evidence: ["16 weeks workout history", "4 photo sets", "nutrition log"],
    confidence: 78, data: []
  };

  Forge.pages.coach = async function (root) {
    const U = ForgeUI, I = (n, s, c) => ForgeIcons.svg(n, s, c);
    const coach = await Forge.api.getCoach();
    const threads = coach.threads || [];
    const convos = coach.conversations || {};
    let threadId = threads.length > 0 ? threads[0].id : null;
    let messages = (threadId && convos[threadId]) ? convos[threadId].slice() : [{ role: "ai", text: "Welcome to ForgeAI Coach. Ask me anything about your training, nutrition, or progress." }];

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>ForgeAI Coach</h1>
          <p class="sub">Grounded in your own training, nutrition and photo data.</p>
        </div>
      </div>

      <div class="coach-layout">
        <div class="card threads-card">
          <div class="threads-head">
            <span class="eyebrow">Threads</span>
            <button class="icon-btn" id="btnNewChat" title="New chat">${I("plus", 15)}</button>
          </div>
          ${threads.map(t => `
            <button class="thread-item${t.id === threadId ? " active" : ""}" data-t="${t.id}">
              <strong>${t.title}</strong><small>${t.date}</small>
            </button>`).join("")}
        </div>

        <div class="card chat-card">
          <div class="chat-head">
            <span class="coach-ava">${I("spark", 18)}</span>
            <div class="ch-name"><strong>ForgeAI Coach</strong><small><span class="dot dot-ok"></span> Online · forge-core v0.4</small></div>
            <div style="margin-left:auto;display:flex;gap:6px">
              <button class="icon-btn" id="btnClear" title="New conversation">${I("refresh", 15)}</button>
            </div>
          </div>
          <div class="messages" id="msgs"></div>
          <div class="composer">
            <div class="composer-inner">
              <textarea id="chatInput" rows="1" placeholder="Ask about training, nutrition, or progress…"></textarea>
              <button class="send-btn" id="btnSend" aria-label="Send">${I("send", 16)}</button>
            </div>
            <div class="composer-hint">ForgeAI cites its evidence and confidence — verify important decisions.</div>
          </div>
        </div>
      </div>
    `;

    const msgs = root.querySelector("#msgs");
    const inputEl = root.querySelector("#chatInput");

    function bubble(m) {
      if (m.role === "user") {
        return `<div class="msg user"><span class="msg-ava">A</span><div class="bubble">${m.text}</div></div>`;
      }
      const meta = m.evidence ? `
        <div class="msg-meta">
          <div><div class="mm-label">Evidence</div>
            <div class="evi-list">${m.evidence.map(e => `<div class="evi-item">${I("file", 13)} ${e}</div>`).join("")}</div></div>
          <div class="row" style="gap:6px;flex-wrap:wrap">
            <span class="mm-label" style="width:100%">Confidence</span>
            ${U.chip(m.confidence + "%", "chip-acc")}
            ${(m.data || []).map(d => U.chip(d, "")).join("")}
          </div>
        </div>` : "";
      return `<div class="msg ai"><span class="msg-ava">${I("spark", 15)}</span>
        <div class="bubble">${m.text}${meta}</div></div>`;
    }

    function render() {
      msgs.innerHTML = messages.map(bubble).join("") + '<div id="typingSlot"></div>';
      msgs.scrollTop = msgs.scrollHeight;
    }

    async function respond(q) {
      if (Forge.api.mode.includes("remote")) {
        try {
          const res = await Forge.api.sendCoachMessage(q, threadId);
          if (res) {
            if (!threadId && res.conversation_id) threadId = res.conversation_id;
            messages.push({ role: "ai", text: res.reply ? res.reply.content : res.text, evidence: res.evidence, confidence: res.confidence, data: res.data });
          } else {
            messages.push({ role: "ai", text: "Sorry, I couldn't process that right now." });
          }
        } catch (e) {
          messages.push({ role: "ai", text: "Sorry, an error occurred while connecting to the AI." });
        }
      } else {
        const hit = BRAIN.find(b => b.re.test(q)) || FALLBACK;
        messages.push({ role: "ai", text: hit.text, evidence: hit.evidence, confidence: hit.confidence, data: hit.data });
      }
      render();
    }

    async function send() {
      const q = inputEl.value.trim();
      if (!q) return;
      inputEl.value = "";
      inputEl.style.height = "auto";
      messages.push({ role: "user", text: q });
      render();
      // typing indicator — replace with streaming API response
      const slot = root.querySelector("#typingSlot");
      slot.innerHTML = `<div class="msg ai"><span class="msg-ava">${I("spark", 15)}</span><div class="bubble typing"><span class="tdot"></span><span class="tdot"></span><span class="tdot"></span></div></div>`;
      msgs.scrollTop = msgs.scrollHeight;
      
      await respond(q);
    }

    root.querySelector("#btnSend").addEventListener("click", send);
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    });
    inputEl.addEventListener("input", () => {
      inputEl.style.height = "auto";
      inputEl.style.height = Math.min(120, inputEl.scrollHeight) + "px";
    });

    const loadThread = (id) => {
      threadId = id;
      messages = (convos[id] || []).slice();
      if (messages.length === 0) messages = [{ role: "ai", text: "This thread is empty. Ask me something!" }];
      root.querySelectorAll(".thread-item").forEach(t => t.classList.toggle("active", t.getAttribute("data-t") === id));
      render();
    };
    root.querySelectorAll(".thread-item").forEach(t => t.addEventListener("click", () => loadThread(t.getAttribute("data-t"))));
    const newChat = () => {
      threadId = null;
      messages = [{ role: "ai", text: "New thread. What are we working on — training, nutrition, or progress review?" }];
      root.querySelectorAll(".thread-item").forEach(t => t.classList.remove("active"));
      render();
      inputEl.focus();
    };
    root.querySelector("#btnNewChat").addEventListener("click", newChat);
    root.querySelector("#btnClear").addEventListener("click", newChat);

    render();
  };
})();
