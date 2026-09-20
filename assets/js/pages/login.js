/* ForgeAI — Auth / Login & Register page */
(function () {
  window.Forge = window.Forge || {};
  const Forge = window.Forge;
  Forge.pages = Forge.pages || {};

  Forge.pages.login = async function (root) {
    const U = ForgeUI, I = (n, s, c) => ForgeIcons.svg(n, s, c);
    let mode = "login"; // "login" | "register"

    root.innerHTML = `
      <div class="auth-wrapper">
        <div class="auth-card">
          <div class="auth-brand">
            <span class="logo-mark" style="width:48px;height:48px;">
              <svg viewBox="0 0 64 64" width="48" height="48"><rect width="64" height="64" rx="15" fill="var(--accent)"/><path d="M20 48V16h25v7H28v6h15v7H28v12z" fill="#0a0b0d"/></svg>
            </span>
            <h2>ForgeAI</h2>
            <p class="sub">Personal Fitness Intelligence</p>
          </div>

          <div class="auth-tabs">
            <button class="auth-tab active" id="tabLogin">Sign In</button>
            <button class="auth-tab" id="tabRegister">Create Account</button>
          </div>

          <div id="authAlert" class="auth-alert hidden"></div>

          <!-- LOGIN FORM -->
          <form id="formLogin" class="auth-form">
            <div class="field">
              <label for="loginEmail">Email Address</label>
              <input type="email" id="loginEmail" class="input" placeholder="you@example.com" required autocomplete="email">
            </div>
            <div class="field">
              <label for="loginPassword">Password</label>
              <input type="password" id="loginPassword" class="input" placeholder="••••••••" required autocomplete="current-password">
            </div>
            <button type="submit" class="btn btn-primary btn-block btn-lg" id="btnLoginSubmit">
              <span>Sign In</span>
            </button>
          </form>

          <!-- REGISTER FORM -->
          <form id="formRegister" class="auth-form hidden">
            <div class="field">
              <label for="regName">Full Name</label>
              <input type="text" id="regName" class="input" placeholder="John Doe" required autocomplete="name">
            </div>
            <div class="field">
              <label for="regEmail">Email Address</label>
              <input type="email" id="regEmail" class="input" placeholder="you@example.com" required autocomplete="email">
            </div>
            <div class="field">
              <label for="regPassword">Password</label>
              <input type="password" id="regPassword" class="input" placeholder="Min. 8 characters" required minlength="8" autocomplete="new-password">
            </div>
            <button type="submit" class="btn btn-primary btn-block btn-lg" id="btnRegSubmit">
              <span>Create Account</span>
            </button>
          </form>
        </div>
      </div>
    `;

    const tabLogin = document.getElementById("tabLogin");
    const tabRegister = document.getElementById("tabRegister");
    const formLogin = document.getElementById("formLogin");
    const formRegister = document.getElementById("formRegister");
    const authAlert = document.getElementById("authAlert");

    function showAlert(msg) {
      authAlert.textContent = msg;
      authAlert.classList.remove("hidden");
    }

    function hideAlert() {
      authAlert.textContent = "";
      authAlert.classList.add("hidden");
    }

    function setMode(newMode) {
      mode = newMode;
      hideAlert();
      if (mode === "login") {
        tabLogin.classList.add("active");
        tabRegister.classList.remove("active");
        formLogin.classList.remove("hidden");
        formRegister.classList.add("hidden");
      } else {
        tabRegister.classList.add("active");
        tabLogin.classList.remove("active");
        formRegister.classList.remove("hidden");
        formLogin.classList.add("hidden");
      }
    }

    tabLogin.addEventListener("click", () => setMode("login"));
    tabRegister.addEventListener("click", () => setMode("register"));

    formLogin.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideAlert();
      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value;
      const btn = document.getElementById("btnLoginSubmit");
      
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="display:inline-block"></span> Signing in...`;

      try {
        const user = await Forge.api.login(email, password);
        if (window.updateAppUserProfile) window.updateAppUserProfile();
        U.toast(`Welcome back, ${user.name || "User"}!`);
        location.hash = "#/dashboard";
      } catch (err) {
        showAlert(err.message || "Failed to sign in. Please check your credentials.");
      } finally {
        btn.disabled = false;
        btn.innerHTML = `<span>Sign In</span>`;
      }
    });

    formRegister.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideAlert();
      const name = document.getElementById("regName").value.trim();
      const email = document.getElementById("regEmail").value.trim();
      const password = document.getElementById("regPassword").value;
      const btn = document.getElementById("btnRegSubmit");

      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="display:inline-block"></span> Creating account...`;

      try {
        const user = await Forge.api.register(email, password, name);
        if (window.updateAppUserProfile) window.updateAppUserProfile();
        U.toast(`Account created! Welcome, ${user.name}!`);
        location.hash = "#/dashboard";
      } catch (err) {
        showAlert(err.message || "Registration failed. Please try again.");
      } finally {
        btn.disabled = false;
        btn.innerHTML = `<span>Create Account</span>`;
      }
    });
  };
})();
