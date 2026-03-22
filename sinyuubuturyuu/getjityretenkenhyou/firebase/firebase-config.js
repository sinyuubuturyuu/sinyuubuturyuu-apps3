// Firebase runtime config
// Fill production values and set enabled=true.
// Keep keys out of index.html by using this file.
(function () {
  "use strict";

  window.APP_FIREBASE_CONFIG = {
    apiKey: "AIzaSyCUhbTrb3c5wN3zeJkFHzYvdWtN777hpNk",
    authDomain: "sinyuubuturyuu-86aeb.firebaseapp.com",
    projectId: "sinyuubuturyuu-86aeb",
    appId: "1:213947378677:web:03b73a0dc7d710a9900ebc",
    messagingSenderId: "213947378677",
    storageBucket: "sinyuubuturyuu-86aeb.firebasestorage.app",
    measurementId: "G-F9VYGCTHEV"
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
    useAnonymousAuth: true,
    // Retry flush interval (ms)
    autoFlushIntervalMs: 15000
  };

  window.APP_FIREBASE_DIRECTORY_CONFIG = {
    apiKey: "AIzaSyCUhbTrb3c5wN3zeJkFHzYvdWtN777hpNk",
    authDomain: "sinyuubuturyuu-86aeb.firebaseapp.com",
    projectId: "sinyuubuturyuu-86aeb",
    storageBucket: "sinyuubuturyuu-86aeb.firebasestorage.app",
    messagingSenderId: "213947378677",
    appId: "1:213947378677:web:03b73a0dc7d710a9900ebc",
    measurementId: "G-F9VYGCTHEV"
  };

  window.APP_FIREBASE_DIRECTORY_SYNC_OPTIONS = {
    enabled: true,
    appName: "sinyuubuturyuu-directory",
    collection: "syainmeibo",
    docIds: {
      vehicles: "monthly_tire_company_settings_backup_vehicles_slot1",
      drivers: "monthly_tire_company_settings_backup_drivers_slot1"
    },
    useAnonymousAuth: true
  };
})();
