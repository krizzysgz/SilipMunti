(() => {
  "use strict";

  if (window.SilipMuntiMaps) return;

  const LEAFLET_VERSION = "1.9.4";
  const resourcePromises = new Map();
  const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";
  const NOMINATIM_REQUEST_INTERVAL = 1100;
  const MUNTINLUPA_BARANGAYS = [
    "New Alabang Village",
    "Ayala Alabang",
    "Poblacion",
    "Putatan",
    "Tunasan",
    "Alabang",
    "Bayanan",
    "Cupang",
    "Sucat",
    "Buli",
  ];
  let nominatimQueue = Promise.resolve();
  let lastNominatimRequestAt = 0;

  function getConfig() {
    return window.SILIPMUNTI_MAP_CONFIG || {};
  }

  function loadStylesheet(id, href) {
    if (document.querySelector(`#${id}`)) return Promise.resolve();

    const stylesheet = document.createElement("link");
    stylesheet.id = id;
    stylesheet.rel = "stylesheet";
    stylesheet.href = href;
    document.head.append(stylesheet);
    return Promise.resolve();
  }

  function loadScript(id, src) {
    if (resourcePromises.has(id)) return resourcePromises.get(id);
    if (document.querySelector(`#${id}`)) return Promise.resolve();

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.id = id;
      script.src = src;
      script.async = true;
      script.defer = true;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener(
        "error",
        () => reject(new Error("Unable to load the selected map provider.")),
        { once: true },
      );
      document.head.append(script);
    });

    resourcePromises.set(id, promise);
    return promise;
  }

  async function loadLeaflet() {
    if (window.L?.map) return "leaflet";

    await loadStylesheet(
      "silipmunti-leaflet-css",
      `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`,
    );
    await loadScript(
      "silipmunti-leaflet-js",
      `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`,
    );

    if (!window.L?.map) {
      throw new Error("Leaflet did not initialize correctly.");
    }

    return "leaflet";
  }

  async function loadGoogle() {
    if (window.google?.maps?.Map) return "google";

    const apiKey = String(getConfig().google?.apiKey || "").trim();

    if (!apiKey) {
      throw new Error("Google Maps API key is not configured.");
    }

    await loadScript(
      "silipmunti-google-maps-js",
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`,
    );

    if (!window.google?.maps?.Map) {
      throw new Error("Google Maps did not initialize correctly.");
    }

    return "google";
  }

  async function loadProvider() {
    const config = getConfig();
    const requested = String(config.provider || "leaflet").toLowerCase();

    if (requested === "google") {
      try {
        return await loadGoogle();
      } catch (error) {
        if (String(config.fallbackProvider || "").toLowerCase() !== "leaflet") {
          throw error;
        }
        return loadLeaflet();
      }
    }

    return loadLeaflet();
  }

  function normalizeCoordinates(latitude, longitude) {
    if (
      latitude === null ||
      latitude === undefined ||
      longitude === null ||
      longitude === undefined ||
      String(latitude).trim() === "" ||
      String(longitude).trim() === ""
    ) {
      return null;
    }

    const lat = Number(latitude);
    const lng = Number(longitude);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return null;
    }

    return { latitude: lat, longitude: lng };
  }

  function defaultCoordinates() {
    const center = getConfig().defaultCenter || {};
    return (
      normalizeCoordinates(center.latitude, center.longitude) || {
        latitude: 14.4081,
        longitude: 121.0415,
      }
    );
  }

  function writeInputs(latitudeInput, longitudeInput, coordinates) {
    if (latitudeInput) latitudeInput.value = coordinates.latitude.toFixed(8);
    if (longitudeInput) longitudeInput.value = coordinates.longitude.toFixed(8);
  }

  function setStatus(statusElement, message, type = "info") {
    if (!statusElement) return;
    statusElement.textContent = message;
    statusElement.dataset.type = type;
  }

  function wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function requestNominatim(path, parameters) {
    const runRequest = async () => {
      const elapsed = Date.now() - lastNominatimRequestAt;
      const remaining = Math.max(0, NOMINATIM_REQUEST_INTERVAL - elapsed);

      if (remaining > 0) await wait(remaining);

      const baseUrl =
        String(getConfig().geocoding?.nominatimUrl || "").trim() ||
        NOMINATIM_BASE_URL;
      const url = new URL(`${baseUrl.replace(/\/$/, "")}/${path}`);

      Object.entries(parameters).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== "") {
          url.searchParams.set(key, String(value));
        }
      });

      lastNominatimRequestAt = Date.now();
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error("The address service is temporarily unavailable.");
      }

      return response.json();
    };

    const request = nominatimQueue.then(runRequest, runRequest);
    nominatimQueue = request.then(
      () => undefined,
      () => undefined,
    );
    return request;
  }

  function matchBarangay(...values) {
    const text = values
      .filter(Boolean)
      .map((value) => String(value).toLowerCase())
      .join(" ");

    return (
      MUNTINLUPA_BARANGAYS.find((barangay) =>
        text.includes(barangay.toLowerCase()),
      ) || ""
    );
  }

  function normalizeNominatimResult(result) {
    const coordinates = normalizeCoordinates(result?.lat, result?.lon);
    if (!coordinates) return null;

    const address = result.address || {};
    const road =
      address.road ||
      address.pedestrian ||
      address.residential ||
      address.path ||
      address.neighbourhood ||
      "";
    const shortAddress = [address.house_number, road].filter(Boolean).join(" ");
    const formattedAddress = String(result.display_name || shortAddress).trim();

    return {
      ...coordinates,
      formattedAddress,
      shortAddress: shortAddress || formattedAddress,
      barangay: matchBarangay(
        address.suburb,
        address.quarter,
        address.neighbourhood,
        address.village,
        address.city_district,
        formattedAddress,
      ),
    };
  }

  function buildSearchQuery(query, options = {}) {
    const parts = [
      String(query || "").trim(),
      options.barangayInput?.value,
      options.cityInput?.value || "Muntinlupa",
      "Metro Manila",
      "Philippines",
    ];

    return parts
      .map((part) => String(part || "").trim())
      .filter((part, index, values) => {
        if (!part) return false;
        const normalized = part.toLowerCase();
        return (
          values.findIndex(
            (value) =>
              String(value || "")
                .trim()
                .toLowerCase() === normalized,
          ) === index
        );
      })
      .join(", ");
  }

  async function searchLeafletAddress(query, options = {}) {
    const results = await requestNominatim("search", {
      q: buildSearchQuery(query, options),
      format: "jsonv2",
      addressdetails: 1,
      countrycodes: "ph",
      limit: 5,
      viewbox: "120.9700,14.5000,121.1600,14.3200",
      bounded: 1,
    });

    if (!Array.isArray(results)) return null;
    return results.map(normalizeNominatimResult).find(Boolean) || null;
  }

  async function reverseLeafletAddress(coordinates) {
    const result = await requestNominatim("reverse", {
      lat: coordinates.latitude,
      lon: coordinates.longitude,
      format: "jsonv2",
      addressdetails: 1,
      zoom: 18,
    });

    return normalizeNominatimResult(result);
  }

  function googleGeocode(request) {
    return new Promise((resolve, reject) => {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode(request, (results, status) => {
        if (status === "ZERO_RESULTS") {
          resolve(null);
          return;
        }

        if (status !== "OK" || !results?.length) {
          reject(new Error("The Google address service could not respond."));
          return;
        }

        resolve(results[0]);
      });
    });
  }

  function normalizeGoogleResult(result) {
    const location = result?.geometry?.location;
    if (!location) return null;

    const coordinates = normalizeCoordinates(location.lat(), location.lng());
    if (!coordinates) return null;

    const components = result.address_components || [];
    const componentValue = (...types) =>
      components.find((component) =>
        types.some((type) => component.types.includes(type)),
      )?.long_name || "";
    const shortAddress = [
      componentValue("street_number"),
      componentValue("route"),
    ]
      .filter(Boolean)
      .join(" ");
    const formattedAddress = String(result.formatted_address || "").trim();

    return {
      ...coordinates,
      formattedAddress,
      shortAddress: shortAddress || formattedAddress,
      barangay: matchBarangay(
        componentValue("sublocality_level_1"),
        componentValue("sublocality", "neighborhood"),
        componentValue("administrative_area_level_3"),
        formattedAddress,
      ),
    };
  }

  async function searchGoogleAddress(query, options = {}) {
    const result = await googleGeocode({
      address: buildSearchQuery(query, options),
      componentRestrictions: { country: "PH" },
      region: "PH",
    });

    return result ? normalizeGoogleResult(result) : null;
  }

  async function reverseGoogleAddress(coordinates) {
    const result = await googleGeocode({
      location: {
        lat: coordinates.latitude,
        lng: coordinates.longitude,
      },
    });

    return result ? normalizeGoogleResult(result) : null;
  }

  async function searchAddress(query, options = {}) {
    const provider = options.provider || (await loadProvider());
    return provider === "google"
      ? searchGoogleAddress(query, options)
      : searchLeafletAddress(query, options);
  }

  async function reverseGeocode(latitude, longitude, options = {}) {
    const coordinates = normalizeCoordinates(latitude, longitude);
    if (!coordinates) return null;

    const provider = options.provider || (await loadProvider());
    return provider === "google"
      ? reverseGoogleAddress(coordinates)
      : reverseLeafletAddress(coordinates);
  }

  function setSelectValue(select, value) {
    if (!select || !value) return false;

    const option = Array.from(select.options || []).find(
      (item) => item.value.toLowerCase() === value.toLowerCase(),
    );

    if (!option) return false;
    select.value = option.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function applyResolvedAddress(options, result) {
    if (!result) return;

    if (options.searchInput && result.formattedAddress) {
      options.searchInput.value = result.formattedAddress;
    }

    if (
      options.addressInput &&
      !String(options.addressInput.value || "").trim() &&
      result.shortAddress
    ) {
      options.addressInput.value = result.shortAddress;
      options.addressInput.dispatchEvent(new Event("input", { bubbles: true }));
    }

    setSelectValue(options.barangayInput, result.barangay);
    options.onAddressResolved?.(result);
  }

  function externalUrl(latitude, longitude, provider = getConfig().provider) {
    const coordinates = normalizeCoordinates(latitude, longitude);
    if (!coordinates) return "#";

    if (String(provider).toLowerCase() === "google") {
      return `https://www.google.com/maps?q=${coordinates.latitude},${coordinates.longitude}`;
    }

    return `https://www.openstreetmap.org/?mlat=${coordinates.latitude}&mlon=${coordinates.longitude}#map=17/${coordinates.latitude}/${coordinates.longitude}`;
  }

  function createLeafletViewer(element, coordinates, options) {
    const config = getConfig();
    const zoom = Number(options.zoom || config.defaultZoom || 15);
    const map = window.L.map(element, {
      scrollWheelZoom: false,
    }).setView([coordinates.latitude, coordinates.longitude], zoom);

    window.L.tileLayer(config.leaflet.tileUrl, {
      attribution: config.leaflet.attribution,
      maxZoom: 19,
    }).addTo(map);

    const marker = window.L.marker([
      coordinates.latitude,
      coordinates.longitude,
    ]).addTo(map);
    const popupText = options.title || options.address;

    if (popupText) marker.bindPopup(String(popupText));
    window.setTimeout(() => map.invalidateSize(), 80);

    return {
      provider: "leaflet",
      map,
      marker,
      setCoordinates(latitude, longitude) {
        const next = normalizeCoordinates(latitude, longitude);
        if (!next) return false;
        marker.setLatLng([next.latitude, next.longitude]);
        map.setView([next.latitude, next.longitude], zoom);
        return true;
      },
      destroy() {
        map.remove();
      },
    };
  }

  function createGoogleViewer(element, coordinates, options) {
    const config = getConfig();
    const position = {
      lat: coordinates.latitude,
      lng: coordinates.longitude,
    };
    const mapOptions = {
      center: position,
      zoom: Number(options.zoom || config.defaultZoom || 15),
      streetViewControl: true,
      mapTypeControl: false,
      fullscreenControl: true,
    };

    if (config.google?.mapId) mapOptions.mapId = config.google.mapId;

    const map = new window.google.maps.Map(element, mapOptions);
    const marker = new window.google.maps.Marker({
      map,
      position,
      title: options.title || "Property location",
    });

    return {
      provider: "google",
      map,
      marker,
      setCoordinates(latitude, longitude) {
        const next = normalizeCoordinates(latitude, longitude);
        if (!next) return false;
        const nextPosition = { lat: next.latitude, lng: next.longitude };
        marker.setPosition(nextPosition);
        map.setCenter(nextPosition);
        return true;
      },
      destroy() {
        marker.setMap(null);
      },
    };
  }

  function createLeafletPicker(element, initial, options) {
    const config = getConfig();
    const center = initial || defaultCoordinates();
    const zoom = Number(options.zoom || config.defaultZoom || 15);
    const map = window.L.map(element).setView(
      [center.latitude, center.longitude],
      zoom,
    );
    let marker = null;
    let current = initial;

    window.L.tileLayer(config.leaflet.tileUrl, {
      attribution: config.leaflet.attribution,
      maxZoom: 19,
    }).addTo(map);

    function update(
      coordinates,
      centerMap = false,
      shouldResolveAddress = false,
    ) {
      current = coordinates;

      if (!marker) {
        marker = window.L.marker(
          [coordinates.latitude, coordinates.longitude],
          { draggable: true },
        ).addTo(map);
        marker.on("dragend", () => {
          const point = marker.getLatLng();
          update({ latitude: point.lat, longitude: point.lng }, false, true);
        });
      } else {
        marker.setLatLng([coordinates.latitude, coordinates.longitude]);
      }

      if (centerMap) {
        map.setView([coordinates.latitude, coordinates.longitude], zoom);
      }

      writeInputs(options.latitudeInput, options.longitudeInput, coordinates);
      setStatus(
        options.statusElement,
        `Selected: ${coordinates.latitude.toFixed(6)}, ${coordinates.longitude.toFixed(6)}`,
        "success",
      );
      options.onChange?.(coordinates, { shouldResolveAddress });
    }

    if (initial) update(initial);
    map.on("click", (event) => {
      update(
        {
          latitude: event.latlng.lat,
          longitude: event.latlng.lng,
        },
        false,
        true,
      );
    });
    window.setTimeout(() => map.invalidateSize(), 80);

    return {
      provider: "leaflet",
      map,
      getCoordinates: () => current,
      setCoordinates(
        latitude,
        longitude,
        centerMap = true,
        shouldResolveAddress = false,
      ) {
        const coordinates = normalizeCoordinates(latitude, longitude);
        if (!coordinates) return false;
        update(coordinates, centerMap, shouldResolveAddress);
        return true;
      },
      destroy() {
        map.remove();
      },
    };
  }

  function createGooglePicker(element, initial, options) {
    const config = getConfig();
    const center = initial || defaultCoordinates();
    const mapOptions = {
      center: { lat: center.latitude, lng: center.longitude },
      zoom: Number(options.zoom || config.defaultZoom || 15),
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: true,
    };

    if (config.google?.mapId) mapOptions.mapId = config.google.mapId;

    const map = new window.google.maps.Map(element, mapOptions);
    let marker = null;
    let current = initial;

    function update(
      coordinates,
      centerMap = false,
      shouldResolveAddress = false,
    ) {
      current = coordinates;
      const position = {
        lat: coordinates.latitude,
        lng: coordinates.longitude,
      };

      if (!marker) {
        marker = new window.google.maps.Marker({
          map,
          position,
          draggable: true,
          title: "Selected property location",
        });
        marker.addListener("dragend", () => {
          const point = marker.getPosition();
          update(
            { latitude: point.lat(), longitude: point.lng() },
            false,
            true,
          );
        });
      } else {
        marker.setPosition(position);
      }

      if (centerMap) map.setCenter(position);
      writeInputs(options.latitudeInput, options.longitudeInput, coordinates);
      setStatus(
        options.statusElement,
        `Selected: ${coordinates.latitude.toFixed(6)}, ${coordinates.longitude.toFixed(6)}`,
        "success",
      );
      options.onChange?.(coordinates, { shouldResolveAddress });
    }

    if (initial) update(initial);
    map.addListener("click", (event) => {
      update(
        {
          latitude: event.latLng.lat(),
          longitude: event.latLng.lng(),
        },
        false,
        true,
      );
    });

    return {
      provider: "google",
      map,
      getCoordinates: () => current,
      setCoordinates(
        latitude,
        longitude,
        centerMap = true,
        shouldResolveAddress = false,
      ) {
        const coordinates = normalizeCoordinates(latitude, longitude);
        if (!coordinates) return false;
        update(coordinates, centerMap, shouldResolveAddress);
        return true;
      },
      destroy() {
        marker?.setMap(null);
      },
    };
  }

  async function createViewer(options = {}) {
    const element =
      typeof options.element === "string"
        ? document.querySelector(options.element)
        : options.element;
    const coordinates = normalizeCoordinates(
      options.latitude,
      options.longitude,
    );

    if (!element) throw new Error("Map element was not found.");
    if (!coordinates)
      throw new Error("Valid property coordinates are required.");

    element.classList.add("sm-map-canvas", "is-loading");
    const provider = await loadProvider();
    element.classList.remove("is-loading");
    element.replaceChildren();

    return provider === "google"
      ? createGoogleViewer(element, coordinates, options)
      : createLeafletViewer(element, coordinates, options);
  }

  async function createPicker(options = {}) {
    const element =
      typeof options.element === "string"
        ? document.querySelector(options.element)
        : options.element;
    const initial = normalizeCoordinates(options.latitude, options.longitude);

    if (!element) throw new Error("Map picker element was not found.");

    element.classList.add("sm-map-canvas", "is-loading");
    setStatus(options.statusElement, "Loading map…");
    const provider = await loadProvider();
    element.classList.remove("is-loading");
    element.replaceChildren();
    let reverseTimer = null;
    let reverseSequence = 0;
    let searchSequence = 0;
    let controller = null;

    const scheduleReverseLookup = (coordinates) => {
      window.clearTimeout(reverseTimer);
      const sequence = ++reverseSequence;

      setStatus(
        options.statusElement,
        "Pin selected. Looking up the nearest address…",
      );

      reverseTimer = window.setTimeout(async () => {
        try {
          const result = await reverseGeocode(
            coordinates.latitude,
            coordinates.longitude,
            { provider },
          );

          if (sequence !== reverseSequence) return;

          if (result) {
            applyResolvedAddress(options, result);
            setStatus(
              options.statusElement,
              `Pin selected near ${result.formattedAddress}. Review the address before saving.`,
              "success",
            );
            return;
          }

          setStatus(
            options.statusElement,
            "Pin selected. Please verify the complete address manually.",
          );
        } catch (error) {
          if (sequence !== reverseSequence) return;
          setStatus(
            options.statusElement,
            "Pin selected, but the address lookup was unavailable. Verify the address manually.",
          );
        }
      }, 700);
    };

    const pickerOptions = {
      ...options,
      onChange(coordinates, metadata = {}) {
        options.onChange?.(coordinates, metadata);

        if (metadata.shouldResolveAddress) {
          scheduleReverseLookup(coordinates);
        }
      },
    };

    controller =
      provider === "google"
        ? createGooglePicker(element, initial, pickerOptions)
        : createLeafletPicker(element, initial, pickerOptions);

    if (!initial) {
      setStatus(
        options.statusElement,
        "Click the map or use your current location to place the property pin.",
      );
    }

    const syncFromInputs = () => {
      const coordinates = normalizeCoordinates(
        options.latitudeInput?.value,
        options.longitudeInput?.value,
      );
      if (coordinates) {
        controller.setCoordinates(coordinates.latitude, coordinates.longitude);
      }
    };

    options.latitudeInput?.addEventListener("change", syncFromInputs);
    options.longitudeInput?.addEventListener("change", syncFromInputs);

    const handleLocate = () => {
      if (!navigator.geolocation) {
        setStatus(
          options.statusElement,
          "Current location is not supported by this browser.",
          "error",
        );
        return;
      }

      options.locateButton.disabled = true;
      setStatus(options.statusElement, "Getting your current location…");
      navigator.geolocation.getCurrentPosition(
        (position) => {
          controller.setCoordinates(
            position.coords.latitude,
            position.coords.longitude,
            true,
            true,
          );
          options.locateButton.disabled = false;
        },
        () => {
          setStatus(
            options.statusElement,
            "Location access was unavailable. You can still click the map.",
            "error",
          );
          options.locateButton.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
      );
    };

    const setSearchBusy = (isBusy) => {
      if (!options.searchButton) return;
      const label = options.searchButton.querySelector("span");

      if (label && !options.searchButton.dataset.idleLabel) {
        options.searchButton.dataset.idleLabel = label.textContent.trim();
      }

      options.searchButton.disabled = isBusy;
      options.searchButton.classList.toggle("is-loading", isBusy);

      if (label) {
        label.textContent = isBusy
          ? "Searching…"
          : options.searchButton.dataset.idleLabel || "Search map";
      }
    };

    const handleSearch = async () => {
      const query = String(options.searchInput?.value || "").trim();

      if (query.length < 3) {
        setStatus(
          options.statusElement,
          "Enter at least three characters to search for a location.",
          "error",
        );
        options.searchInput?.focus();
        return;
      }

      window.clearTimeout(reverseTimer);
      reverseSequence += 1;
      const sequence = ++searchSequence;
      setSearchBusy(true);
      setStatus(options.statusElement, "Searching within Muntinlupa City…");

      try {
        const result = await searchAddress(query, { ...options, provider });

        if (sequence !== searchSequence) return;

        if (!result) {
          setStatus(
            options.statusElement,
            "No matching location was found in Muntinlupa. Try a street, subdivision, or landmark.",
            "error",
          );
          return;
        }

        controller.setCoordinates(
          result.latitude,
          result.longitude,
          true,
          false,
        );
        applyResolvedAddress(options, result);
        setStatus(
          options.statusElement,
          `Location found: ${result.formattedAddress}. Drag the pin if you need a more exact position.`,
          "success",
        );
      } catch (error) {
        if (sequence !== searchSequence) return;
        setStatus(
          options.statusElement,
          error.message || "The location search could not be completed.",
          "error",
        );
      } finally {
        if (sequence === searchSequence) setSearchBusy(false);
      }
    };

    const handleSearchClick = (event) => {
      event.preventDefault();
      handleSearch();
    };
    const handleSearchKeydown = (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      handleSearch();
    };

    options.locateButton?.addEventListener("click", handleLocate);
    options.searchButton?.addEventListener("click", handleSearchClick);
    options.searchInput?.addEventListener("keydown", handleSearchKeydown);

    const destroyPicker = controller.destroy?.bind(controller);
    controller.destroy = () => {
      window.clearTimeout(reverseTimer);
      reverseSequence += 1;
      searchSequence += 1;
      options.latitudeInput?.removeEventListener("change", syncFromInputs);
      options.longitudeInput?.removeEventListener("change", syncFromInputs);
      options.locateButton?.removeEventListener("click", handleLocate);
      options.searchButton?.removeEventListener("click", handleSearchClick);
      options.searchInput?.removeEventListener("keydown", handleSearchKeydown);
      destroyPicker?.();
    };

    return controller;
  }

  window.SilipMuntiMaps = Object.freeze({
    createViewer,
    createPicker,
    externalUrl,
    normalizeCoordinates,
    searchAddress,
    reverseGeocode,
    getConfiguredProvider: () =>
      String(getConfig().provider || "leaflet").toLowerCase(),
  });
})();
