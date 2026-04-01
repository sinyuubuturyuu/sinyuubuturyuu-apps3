(function () {
  "use strict";

  const LATEST_PC_APP_VERSION = "20260401c";
  const VERSION_PARAM = "v";

  function getVersion(fallbackVersion) {
    return LATEST_PC_APP_VERSION || fallbackVersion || "";
  }

  function ensureLatestVersion(fallbackVersion) {
    const latestVersion = getVersion(fallbackVersion);
    const url = new URL(window.location.href);

    if (url.searchParams.get(VERSION_PARAM) === latestVersion) {
      return latestVersion;
    }

    url.searchParams.set(VERSION_PARAM, latestVersion);
    window.location.replace(url.toString());
    return "";
  }

  window.SinyuubuturyuuPcVersion = Object.freeze({
    latestVersion: LATEST_PC_APP_VERSION,
    getVersion: getVersion,
    ensureLatestVersion: ensureLatestVersion
  });
})();
