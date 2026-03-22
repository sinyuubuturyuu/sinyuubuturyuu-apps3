(function () {
  "use strict";

  window.DRIVER_POINTS_FIREBASE_CONFIG = {
    apiKey: "AIzaSyCUhbTrb3c5wN3zeJkFHzYvdWtN777hpNk",
    authDomain: "sinyuubuturyuu-86aeb.firebaseapp.com",
    projectId: "sinyuubuturyuu-86aeb",
    storageBucket: "sinyuubuturyuu-86aeb.firebasestorage.app",
    messagingSenderId: "213947378677",
    appId: "1:213947378677:web:03b73a0dc7d710a9900ebc",
    measurementId: "G-F9VYGCTHEV"
  };

  window.DRIVER_POINTS_FIREBASE_SETTINGS = {
    appName: "driver-points-app",
    useAnonymousAuth: true,
    preferredCollection: "driver-points",
    collectionCandidates: [
      "driver-points"
    ],
    vehicleFieldCandidates: [
      "vehicleNumber",
      "vehicleKey",
      "vehicle",
      "carNumber",
      "truckNumber",
      "vehicleNo"
    ],
    driverFieldCandidates: [
      "driverKey",
      "driver",
      "driverName",
      "driverDisplay",
      "employeeName",
      "staffName",
      "name"
    ],
    pointsFieldCandidates: [
      "totalPoints",
      "dailyInspectionPoints",
      "points",
      "point",
      "grantedPoints",
      "currentPoints",
      "score"
    ],
    updatedAtFieldCandidates: [
      "updatedAt",
      "updated_at",
      "lastUpdatedAt",
      "modifiedAt",
      "createdAt"
    ],
    summaryKindValue: "driver_points_summary",
    docIdPatterns: [
      "{vehicle}__{driver}",
      "{vehicle}_{driver}",
      "{vehicle}-{driver}",
      "{driver}__{vehicle}",
      "{driver}_{vehicle}",
      "{driver}-{vehicle}"
    ]
  };
})();
