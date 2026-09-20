/* ============================================================
   ForgeAI — app shell: router, sidebar, topbar, bottom nav
   ============================================================ */
(function () {
  const I = (n, s, c) => ForgeIcons.svg(n, s, c);
  const U = ForgeUI;

  const NAV = [
    { group: "Overview" },
    { id: "dashboard",  title: "Dashboard",  icon: "grid" },
    { id: "progress",   title: "Progress",   icon: "trend" },
    { id: "workouts",   title: "Workouts",   icon: "dumbbell" },
    { id: "nutrition",  title: "Nutrition",  icon: "utensils" },
    { group: "Intelligence" },
    { id: "analysis",   title: "AI Analysis", icon: "scan", badge: "CV" },
    { id: "coach",      title: "AI Coach",   icon: "spark" },
    { id: "history",    title: "History",    icon: "clock" },
    { id: "evaluation", title: "Evaluation", icon: "shieldcheck" },
    { group: "System" },
    { id: "settings",   title: "Settings",   icon: "gear" }
  ];

  /* ---------- build sidebar nav ---------- */
  const sideNav = document.getElementById("sideNav");
  sideNav.innerHTML = NAV.map(n => n.group
    ? `<div class="nav-group-label">${n.group}</div>`
    : `<a class="nav-item" href="#/${n.id}" data-nav="${n.id}" title="${n.title}">
         ${I(n.icon, 17)}<span class="nav-text">${n.title}</span>${n.badge ? `<span class="n-badge">${n.badge}</span>` : ""}
       </a>`).join("");

  /* ---------- bottom nav (mobile) ---------- */
  const BOTTOM = [
    { id: "dashboard", icon: "grid", label: "Home" },
    { id: "progress", icon: "trend", label: "Progress" },
    { id: "workouts", icon: "dumbbell", label: "Train" },
    { id: "coach", icon: "spark", label: "Coach" },
    { id: "__menu", icon: "menu", label: "More" }
  ];
  const bottomnav = document.getElementById("bottomnav");
  bottomnav.innerHTML = BOTTOM.map(b =>
    `<a class="bn-item" data-bn="${b.id}" href="${b.id === "__menu" ? "#" : "#/" + b.id}">${I(b.icon, 19)}<span>${b.label}</span></a>`).join("");

  /* ---------- topbar ---------- */
  document.getElementById("btnMenu").innerHTML = I("menu", 19);
  document.getElementById("tbSettings").innerHTML = I("gear", 17);
  document.getElementById("tbDate").innerHTML = I("calendar", 13) + new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  /* ---------- drawer (mobile) ---------- */
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("drawerBackdrop");
  function closeDrawer() { sidebar.classList.remove("open"); backdrop.classList.remove("show"); }
  document.getElementById("btnMenu").addEventListener("click", () => {
    sidebar.classList.toggle("open");
    backdrop.classList.toggle("show", sidebar.classList.contains("open"));
  });
  backdrop.addEventListener("click", closeDrawer);
  bottomnav.addEventListener("click", (e) => {
    const a = e.target.closest(".bn-item");
    if (a && a.getAttribute("data-bn") === "__menu") {
      e.preventDefault();
      sidebar.classList.add("open");
      backdrop.classList.add("show");
    }
  });

  /* ---------- restore accent ---------- */
  try {
    const saved = JSON.parse(localStorage.getItem("forgeai-accent") || "null");
    if (saved && saved.c) {
      const rs = document.documentElement.style;
      rs.setProperty("--accent", saved.c);
      rs.setProperty("--accent-rgb", saved.rgb);
      rs.setProperty("--accent-dim", `rgba(${saved.rgb},0.12)`);
    }
  } catch (e) { /* first run */ }

  /* ---------- user profile updater ---------- */
  function updateAppUserProfile() {
    const user = Forge.api.getCurrentUser();
    const avatarEl = document.getElementById("sidebarAvatar");
    const topAvatarEl = document.getElementById("topbarAvatar");
    const nameEl = document.getElementById("sidebarUserName");
    const emailEl = document.getElementById("sidebarUserEmail");

    if (user) {
      const initial = (user.name || user.email || "U").charAt(0).toUpperCase();
      if (avatarEl) avatarEl.textContent = initial;
      if (topAvatarEl) topAvatarEl.textContent = initial;
      if (nameEl) nameEl.textContent = user.name || "User";
      if (emailEl) emailEl.textContent = user.email || "Personal workspace";
    }
  }
  window.updateAppUserProfile = updateAppUserProfile;

  const logoutBtn = document.getElementById("sidebarLogoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      Forge.api.logout();
    });
  }

  /* ---------- router ---------- */
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, "");
    const [p, q] = h.split("?");
    return { page: p || "dashboard", params: new URLSearchParams(q || "") };
  }

  let currentPage = null;
  let renderToken = 0;
  async function render() {
    let { page, params } = parseHash();

    // Probe backend & validate token before evaluating route
    try {
      await Forge.api.ensureConnected();
    } catch (e) { /* ignore connection errors, let fallback handle */ }

    // Authentication Guard
    const isLoggedIn = Forge.api.isLoggedIn();
    if (!isLoggedIn) {
      if (page !== "login") {
        page = "login";
        if (location.hash !== "#/login") {
          location.hash = "#/login";
        }
      }
    } else if (page === "login") {
      page = "dashboard";
      location.hash = "#/dashboard";
    }

    if (page === "login") {
      document.body.classList.add("hide-auth-shell");
    } else {
      document.body.classList.remove("hide-auth-shell");
      updateAppUserProfile();
    }

    const item = NAV.find(n => n.id === page) || (page === "login" ? { id: "login", title: "Sign In" } : NAV.find(n => n.id === "dashboard"));
    const token = ++renderToken;
    document.getElementById("tbTitle").textContent = item.title;

    document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("active", a.getAttribute("data-nav") === item.id));
    document.querySelectorAll("[data-bn]").forEach(a => a.classList.toggle("active", a.getAttribute("data-bn") === item.id));

    ForgeCharts.reset();
    const root = document.getElementById("page");
    root.classList.remove("fade-in");
    root.innerHTML = '<div class="card" style="padding:40px;text-align:center"><span class="spinner" style="display:inline-block"></span></div>';
    try {
      currentPage = item.id;
      if (Forge.pages[item.id]) {
        await Forge.pages[item.id](root, params);
      } else {
        root.innerHTML = `<div class="card"><div class="card-body" style="padding:40px;text-align:center"><h3>Page not found</h3></div></div>`;
      }
    } catch (err) {
      root.innerHTML = `<div class="card"><div class="card-body" style="padding:40px;text-align:center">
        <h3>Something went wrong</h3><p class="sub mt">${String(err && err.message || err)}</p></div></div>`;
      console.error(err);
    }
    if (token !== renderToken) return; /* a newer navigation superseded this render */
    
    // Update the version / connection status indicator dynamically
    const versionEl = document.querySelector(".side-version");
    if (versionEl) {
      if (Forge.api.mode.includes("remote")) {
        versionEl.innerHTML = `<span class="dot dot-ok pulse"></span> forge-core v0.4 · connected`;
      } else {
        versionEl.innerHTML = `<span class="dot dot-warn"></span> forge-core v0.4 · local`;
      }
    }

    U.animateIn(root);
    root.classList.add("fade-in");
    if (typeof window.scrollTo === "function") window.scrollTo({ top: 0 });
    closeDrawer();
  }

  window.addEventListener("hashchange", render);
  render();
})();
