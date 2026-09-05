(() => {
  "use strict";

  const existing = window.SILIPMUNTI_MAP_CONFIG || {};

  window.SILIPMUNTI_MAP_CONFIG = {
    provider: "leaflet",
    fallbackProvider: "leaflet",
    defaultZoom: 15,
    ...existing,
    defaultCenter: {
      latitude: 14.4081,
      longitude: 121.0415,
      ...existing.defaultCenter,
    },
    leaflet: {
      tileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      ...existing.leaflet,
    },
    google: {
      apiKey: "",
      mapId: "",
      ...existing.google,
    },
  };
})();
