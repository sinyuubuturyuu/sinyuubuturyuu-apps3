(function () {
  "use strict";

  const FIREBASE_VERSION = "12.10.0";
  const DEFAULT_WAIT_MS = 5000;
  let runtimePromise = null;

  function getFirebaseConfig() {
    return window.APP_FIREBASE_CONFIG || window.APP_FIREBASE_DIRECTORY_CONFIG || {};
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
        throw new Error("Firebase設定が不足しています。");
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
      let unsubscribe = () => {};
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

  async function getCurrentUser(options = {}) {
    const runtime = await ensureRuntime();
    return waitForAuthState(runtime.authModule, runtime.auth, options.waitMs);
  }

  async function requireUser(options = {}) {
    const user = await getCurrentUser({ waitMs: options.waitMs });
    if (user) {
      return user;
    }

    if (options.redirectTo) {
      window.location.replace(options.redirectTo);
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

  async function ensureCompatUser(compatAuth, options = {}) {
    if (!compatAuth) {
      throw new Error("compat_auth_missing");
    }

    const user = await getCurrentUser({ waitMs: options.waitMs });
    if (!user) {
      if (options.redirectTo) {
        window.location.replace(options.redirectTo);
      }
      return null;
    }

    if (compatAuth.currentUser && compatAuth.currentUser.uid === user.uid) {
      return compatAuth.currentUser;
    }

    if (typeof compatAuth.updateCurrentUser === "function") {
      await compatAuth.updateCurrentUser(user);
    }

    return compatAuth.currentUser || user;
  }

  window.DevFirebaseAuth = {
    ensureRuntime,
    getCurrentUser,
    requireUser,
    signIn,
    signOut,
    onChange,
    ensureCompatUser
  };
})();
