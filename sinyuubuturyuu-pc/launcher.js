const PC_LAUNCHER_VERSION = window.__SINYUUBUTURYUU_PC_VERSION__ || "20260404b";
const elements = {
  authLoading: document.getElementById("authLoading"),
  loginPanel: document.getElementById("loginPanel"),
  launcherApp: document.getElementById("launcherApp"),
  loginForm: document.getElementById("loginForm"),
  loginEmail: document.getElementById("loginEmail"),
  loginPassword: document.getElementById("loginPassword"),
  loginButton: document.getElementById("loginButton"),
  authStatus: document.getElementById("authStatus"),
  authUserEmail: document.getElementById("authUserEmail"),
  logoutButton: document.getElementById("logoutButton"),
  tireInspectionButton: document.getElementById("tireInspectionButton"),
  dailyInspectionButton: document.getElementById("dailyInspectionButton"),
  driverPointsButton: document.getElementById("driverPointsButton"),
  dataAdjustmentButton: document.getElementById("dataAdjustmentButton"),
  settingsButton: document.getElementById("settingsButton")
};

const state = {
  auth: {
    ready: false,
    user: null,
    busy: false,
    returnTo: getRequestedReturnTo(),
    redirected: false
  }
};

renderAuth();
bindEvents();
setVersionedLinks();
registerInstallServiceWorker();
bindLauncherWindowLinks();
void initializeAuth();

function renderAuth() {
  const user = state.auth.user;
  const ready = state.auth.ready;
  const busy = state.auth.busy;
  const pending = !ready && !user;

  document.body.classList.toggle("auth-pending", pending);
  if (elements.authLoading) {
    elements.authLoading.hidden = !pending;
  }
  if (elements.loginPanel) {
    elements.loginPanel.hidden = !ready || Boolean(user);
  }
  if (elements.launcherApp) {
    elements.launcherApp.hidden = !ready || !user;
  }
  if (elements.loginButton) {
    elements.loginButton.disabled = busy || !ready;
  }
  if (elements.loginEmail) {
    elements.loginEmail.disabled = busy || !ready;
  }
  if (elements.loginPassword) {
    elements.loginPassword.disabled = busy || !ready;
  }
  if (elements.logoutButton) {
    elements.logoutButton.disabled = busy || !user;
  }
  if (elements.authUserEmail) {
    elements.authUserEmail.textContent = user && user.email ? user.email : "";
  }

  if (!ready) {
    setAuthStatus("");
  }
}

function setAuthStatus(message, isError = false) {
  if (!elements.authStatus) {
    return;
  }
  elements.authStatus.textContent = message || "";
  elements.authStatus.classList.toggle("error", Boolean(isError));
}

function getRequestedReturnTo() {
  const params = new URLSearchParams(window.location.search);
  const raw = String(params.get("returnTo") || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const resolved = new URL(raw, window.location.href);
    const launcherRoot = new URL("./", window.location.href);
    if (resolved.origin !== window.location.origin) {
      return "";
    }
    if (!resolved.pathname.startsWith(launcherRoot.pathname)) {
      return "";
    }
    return resolved.href;
  } catch {
    return "";
  }
}

async function redirectToReturnTarget() {
  if (!state.auth.user || !state.auth.returnTo || state.auth.redirected) {
    return;
  }

  state.auth.redirected = true;
  window.location.replace(state.auth.returnTo);
}

async function initializeAuth() {
  const authApi = window.DevFirebaseAuth;
  if (!authApi || typeof authApi.onChange !== "function") {
    state.auth.ready = true;
    setAuthStatus("認証モジュールの読み込みに失敗しました。", true);
    renderAuth();
    return;
  }

  try {
    if (typeof authApi.ensureRuntime === "function") {
      const runtime = await authApi.ensureRuntime();
      const immediateUser = runtime && runtime.auth ? (runtime.auth.currentUser || null) : null;
      if (immediateUser) {
        state.auth.ready = true;
        state.auth.user = immediateUser;
        state.auth.busy = false;
        setAuthStatus("");
        renderAuth();
      }
    }

    await authApi.onChange(async (user) => {
      state.auth.ready = true;
      state.auth.user = user || null;
      state.auth.busy = false;

      if (user) {
        setAuthStatus("");
        renderAuth();
        await redirectToReturnTarget();
        return;
      }

      renderAuth();
    });
  } catch (error) {
    state.auth.ready = true;
    state.auth.busy = false;
    setAuthStatus(`認証の初期化に失敗しました: ${error.message}`, true);
    renderAuth();
  }
}

async function handleLoginSubmit() {
  const authApi = window.DevFirebaseAuth;
  if (!authApi || typeof authApi.signIn !== "function") {
    setAuthStatus("認証モジュールの読み込みに失敗しました。", true);
    return;
  }

  const email = String(elements.loginEmail && elements.loginEmail.value || "").trim();
  const password = String(elements.loginPassword && elements.loginPassword.value || "");
  if (!email || !password) {
    setAuthStatus("メールアドレスとパスワードを入力してください。", true);
    return;
  }

  state.auth.busy = true;
  setAuthStatus("ログインしています。", false);
  renderAuth();

  try {
    await authApi.signIn(email, password);
    if (elements.loginPassword) {
      elements.loginPassword.value = "";
    }
  } catch (error) {
    state.auth.busy = false;
    setAuthStatus(`ログインに失敗しました: ${error.message}`, true);
    renderAuth();
  }
}

async function handleLogout() {
  const authApi = window.DevFirebaseAuth;
  if (!authApi || typeof authApi.signOut !== "function") {
    setAuthStatus("認証モジュールの読み込みに失敗しました。", true);
    return;
  }

  state.auth.busy = true;
  setAuthStatus("ログアウトしています。", false);
  renderAuth();

  try {
    await authApi.signOut();
  } catch (error) {
    state.auth.busy = false;
    setAuthStatus(`ログアウトに失敗しました: ${error.message}`, true);
    renderAuth();
  }
}

function bindEvents() {
  if (elements.loginForm) {
    elements.loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void handleLoginSubmit();
    });
  }

  if (elements.logoutButton) {
    elements.logoutButton.addEventListener("click", () => {
      void handleLogout();
    });
  }
}

function setVersionedLinks() {
  setVersionedHref(elements.tireInspectionButton, "./getujitiretenkenhyou-pc/index.html");
  setVersionedHref(elements.dailyInspectionButton, "./getujinitijyoutenkenhyou-pc/index.html");
  setVersionedHref(elements.driverPointsButton, "./driver-points-kanri/index.html");
  setVersionedHref(elements.dataAdjustmentButton, "./driver-points-kanri/data-adjustment.html");
  setVersionedHref(elements.settingsButton, "./settings.html");
}

function setVersionedHref(element, path) {
  if (!element) {
    return;
  }
  element.href = path + "?v=" + PC_LAUNCHER_VERSION;
}

function bindLauncherWindowLinks() {
  if (!window.launcherWindow) {
    return;
  }

  window.launcherWindow.bindInspectionLaunch(elements.tireInspectionButton);
  window.launcherWindow.bindInspectionLaunch(elements.dailyInspectionButton);
  window.launcherWindow.bindLauncherSizedLaunch(elements.driverPointsButton);
  window.launcherWindow.bindLauncherSizedLaunch(elements.dataAdjustmentButton);
  window.launcherWindow.bindLauncherSizedLaunch(elements.settingsButton);
}

function registerInstallServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("./sw.js?v=" + PC_LAUNCHER_VERSION, {
      updateViaCache: "none"
    }).then(function (registration) {
      return registration.update();
    }).catch(function (error) {
      console.warn("Failed to register service worker:", error);
    });
  });
}
