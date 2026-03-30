(function () {
  "use strict";

  const FIREBASE_VERSION = "12.10.0";
  const DEFAULT_WAIT_MS = 5000;
  const APP_ROOT_MARKER = "/dev/sinyuubuturyuu-pc/";
  let runtimePromise = null;

  function getFirebaseConfig() {
    return window.APP_FIREBASE_CONFIG
      || window.DRIVER_POINTS_FIREBASE_CONFIG
      || window.APP_FIREBASE_DIRECTORY_CONFIG
      || {};
  }

  function hasFirebaseConfig(config) {
    return ["apiKey", "authDomain", "projectId", "appId"].every((key) => {
      const value = config && config[key];
      return typeof value === "string" && value.trim();
    });
  }

  async function ensureRuntime() {
    if (runtimePromise) {
      return runtimePromise;
    }

    runtimePromise = (async () => {
      const config = getFirebaseConfig();
      if (!hasFirebaseConfig(config)) {
        throw new Error("Firebase設定が見つかりません。");
      }

      const [{ getApp, getApps, initializeApp }, authModule] = await Promise.all([
        import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
        import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`)
      ]);

      const app = typeof getApps === "function" && getApps().length
        ? getApp()
        : initializeApp(config);

      return {
        app,
        auth: authModule.getAuth(app),
        authModule
      };
    })().catch((error) => {
      runtimePromise = null;
      throw error;
    });

    return runtimePromise;
  }

  function timeoutAfter(ms) {
    if (!Number.isFinite(ms) || ms <= 0) {
      return null;
    }

    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  async function waitForAuthState(authModule, auth, waitMs = DEFAULT_WAIT_MS) {
    if (typeof auth.authStateReady === "function") {
      const wait = auth.authStateReady();
      const timer = timeoutAfter(waitMs);
      if (timer) {
        await Promise.race([wait, timer]);
      } else {
        await wait;
      }
      return auth.currentUser || null;
    }

    if (auth.currentUser) {
      return auth.currentUser;
    }

    return new Promise((resolve) => {
      let settled = false;
      let unsubscribe = function () {};
      const finish = (user) => {
        if (settled) {
          return;
        }
        settled = true;
        unsubscribe();
        resolve(user || null);
      };

      unsubscribe = authModule.onAuthStateChanged(auth, (user) => finish(user), () => finish(null));
      if (Number.isFinite(waitMs) && waitMs > 0) {
        window.setTimeout(() => finish(auth.currentUser || null), waitMs);
      }
    });
  }

  function getAppBaseUrl() {
    const href = window.location.href;
    const index = href.indexOf(APP_ROOT_MARKER);
    if (index >= 0) {
      return href.slice(0, index + APP_ROOT_MARKER.length);
    }
    return new URL("./", window.location.href).toString();
  }

  function getDefaultReturnTo() {
    const current = window.location.pathname + window.location.search + window.location.hash;
    const index = current.indexOf(APP_ROOT_MARKER);
    if (index >= 0) {
      return current.slice(index + APP_ROOT_MARKER.length) || "index.html";
    }

    const url = new URL(window.location.href);
    const relativePath = url.pathname.split("/").pop() || "index.html";
    return relativePath + url.search + url.hash;
  }

  function buildReturnUrl(returnTo) {
    const next = String(returnTo || "").trim() || "index.html";
    return new URL(next, getAppBaseUrl()).toString();
  }

  function buildLoginUrl(loginPath, returnTo) {
    const url = new URL(loginPath || "./login.html", window.location.href);
    const next = String(returnTo || "").trim() || getDefaultReturnTo();
    if (next) {
      url.searchParams.set("returnTo", next);
    }
    return url.toString();
  }

  async function getCurrentUser(options = {}) {
    const runtime = await ensureRuntime();
    return waitForAuthState(runtime.authModule, runtime.auth, options.waitMs);
  }

  async function requireUser(options = {}) {
    const user = await getCurrentUser({ waitMs: options.waitMs });
    if (user) {
      return user;
    }

    const redirectTo = options.redirectTo || buildLoginUrl(options.loginPath, options.returnTo);
    if (redirectTo) {
      window.location.replace(redirectTo);
    }
    return null;
  }

  async function signIn(email, password) {
    const runtime = await ensureRuntime();
    const credential = await runtime.authModule.signInWithEmailAndPassword(
      runtime.auth,
      String(email || "").trim(),
      String(password || "")
    );
    return credential.user;
  }

  async function signOut() {
    const runtime = await ensureRuntime();
    await runtime.authModule.signOut(runtime.auth);
  }

  async function onChange(callback) {
    const runtime = await ensureRuntime();
    return runtime.authModule.onAuthStateChanged(runtime.auth, callback);
  }

  window.DevPcFirebaseAuth = {
    ensureRuntime,
    getCurrentUser,
    requireUser,
    signIn,
    signOut,
    onChange,
    getDefaultReturnTo,
    buildReturnUrl,
    buildLoginUrl
  };
})();


