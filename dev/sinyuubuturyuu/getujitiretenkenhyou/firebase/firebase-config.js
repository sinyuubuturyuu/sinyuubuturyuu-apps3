// Firebase runtime config
// Fill production values and set enabled=true.
// Keep keys out of index.html by using this file.
(function () {
  "use strict";

  window.APP_FIREBASE_CONFIG = {
    apiKey: "AIzaSyDdLIx-gZNn3i9LrT3XY6dyyhFXQ8Ogw6A",
    authDomain: "sinyuubuturyuu-dev.firebaseapp.com",
    projectId: "sinyuubuturyuu-dev",
    appId: "1:997788842966:web:e011e7340e2af863c40277",
    messagingSenderId: "997788842966",
    storageBucket: "sinyuubuturyuu-dev.firebasestorage.app"
  };
  window.APP_FIREBASE_SYNC_OPTIONS = {
    enabled: true,
    // Firestore collection name
    collection: "getujitiretenkenhyou",
    // Reuse existing collection to avoid additional Firestore rules setup
    settingsBackupCollection: "syainmeibo",
    // Prefix for document id
    documentPrefix: "getujitiretenkenhyou",
    // Company identifier for future access control
    companyCode: "company",
    // Use anonymous auth (no user login UI)
    useAnonymousAuth: false,
    // Retry flush interval (ms)
    autoFlushIntervalMs: 15000
  };

  window.APP_FIREBASE_DIRECTORY_CONFIG = {
    apiKey: "AIzaSyDdLIx-gZNn3i9LrT3XY6dyyhFXQ8Ogw6A",
    authDomain: "sinyuubuturyuu-dev.firebaseapp.com",
    projectId: "sinyuubuturyuu-dev",
    storageBucket: "sinyuubuturyuu-dev.firebasestorage.app",
    messagingSenderId: "997788842966",
    appId: "1:997788842966:web:e011e7340e2af863c40277"
  };

  window.APP_FIREBASE_DIRECTORY_SYNC_OPTIONS = {
    enabled: true,
    appName: "sinyuubuturyuu-directory",
    collection: "syainmeibo",
    docIds: {
      vehicles: "monthly_tire_company_settings_backup_vehicles_slot1",
      drivers: "monthly_tire_company_settings_backup_drivers_slot1"
    },
    useAnonymousAuth: false
  };
})();

