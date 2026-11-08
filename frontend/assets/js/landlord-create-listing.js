(function () {
  const API_ROOT = "/SilipMunti/backend";
  const FRONTEND_ROOT = "/SilipMunti/frontend";

  const endpoints = {
    createListing: `${API_ROOT}/landlord/create-listing.php`,
    getRentalTypes: `${API_ROOT}/rental-types/get-all.php`,
    getNotifications: `${API_ROOT}/notifications/get-all.php?status=unread`,
    uploadImage: `${API_ROOT}/landlord/upload-listing-image.php`,
  };

  const form = document.querySelector("#create-listing-form");
  const messageBox = document.querySelector("#create-listing-message");
  const verificationGuard = document.querySelector("#verification-guard");
  const rentalTypeSelect = document.querySelector("#rental-type-select");
  const imageInput = document.querySelector("#listing-images");
  const imagePreviewGrid = document.querySelector("#image-preview-grid");
  const imagePickerTitle = document.querySelector("#image-picker-title");
  const imagePickerHelp = document.querySelector("#image-picker-help");
  const submitButton = document.querySelector("#submit-button");
  const notificationCount = document.querySelector("#notification-count");
  const latitudeInput = document.querySelector("#latitude");
  const longitudeInput = document.querySelector("#longitude");
  const mapStatus = document.querySelector("#create-map-status");
  const mapLocateButton = document.querySelector("#create-map-locate");
  const mapSearchInput = document.querySelector("#create-map-search");
  const mapSearchButton = document.querySelector("#create-map-search-button");
  const addressInput = form?.elements.address;
  const barangayInput = form?.elements.barangay;
  const cityInput = form?.elements.city;

  let selectedImages = [];
  let previewUrls = [];
  let imagesLocked = false;
  let mapPickerController = null;

  function showMessage(message, type = "error") {
    if (!messageBox) return;

    messageBox.textContent = message;
    messageBox.className = `create-listing-message ${type}`;
  }

  function hideMessage() {
    if (!messageBox) return;

    messageBox.textContent = "";
    messageBox.className = "create-listing-message hidden";
  }

  function setSubmitting(isSubmitting, text = "Create listing") {
    if (!submitButton) return;

    imagesLocked = isSubmitting;
    if (imageInput) imageInput.disabled = isSubmitting;
    imagePreviewGrid?.querySelectorAll("button").forEach((button) => {
      button.disabled = isSubmitting;
    });
    submitButton.disabled = isSubmitting;
    submitButton.querySelector("span").textContent = text;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function hydrateTopbarUser(user) {
    window.SilipMuntiLandlordShell?.setLandlordProfile(user);
  }

  async function loadCurrentUser() {
    const user = await window.SilipMuntiSession?.getCurrentUser();

    if (!user) {
      window.location.href = `${FRONTEND_ROOT}/pages/auth/login.html`;
      return null;
    }

    if (user.role !== "landlord") {
      window.location.href = `${FRONTEND_ROOT}/index.html`;
      return null;
    }

    hydrateTopbarUser(user);
    return user;
  }

  async function loadNotificationCount() {
    if (!notificationCount) return;

    try {
      const response = await fetch(endpoints.getNotifications, {
        credentials: "include",
        cache: "no-store",
      });
      const result = await response.json();
      const count = Number(result.data?.unread_count || 0);

      notificationCount.textContent = count > 99 ? "99+" : String(count);
      notificationCount.classList.toggle("hidden", count < 1);
    } catch (error) {
      notificationCount.classList.add("hidden");
    }
  }

  async function checkLandlordApproval(user = null) {
    const landlord =
      user || (await window.SilipMuntiSession?.getCurrentUser(true));
    const accountStatus =
      landlord?.account_status || landlord?.landlord_status || "pending";
    const isApproved = accountStatus === "approved";

    verificationGuard?.classList.toggle("hidden", isApproved);
    form?.classList.toggle("hidden", !isApproved);

    if (!isApproved) {
      const messages = {
        pending:
          "Your landlord account is awaiting admin approval. You can create listings after approval.",
        rejected: landlord?.landlord_rejection_reason
          ? `Your landlord account was not approved: ${landlord.landlord_rejection_reason}`
          : "Your landlord account was not approved. Contact the administrator for assistance.",
        suspended:
          "Your landlord account is currently suspended. Contact the administrator for assistance.",
      };

      showMessage(
        messages[accountStatus] ||
          "Admin approval is required before creating a listing.",
        "error",
      );
    }

    return isApproved;
  }

  async function loadRentalTypes() {
    if (!rentalTypeSelect) return;

    try {
      const response = await fetch(endpoints.getRentalTypes, {
        credentials: "include",
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to load rental types.");
      }

      const rentalTypes =
        result.data?.rental_types ?? result.data?.types ?? result.data ?? [];

      rentalTypeSelect.innerHTML =
        '<option value="">Select rental type</option>';

      rentalTypes.forEach((type) => {
        const option = document.createElement("option");
        option.value = type.id;
        option.textContent = type.name;
        rentalTypeSelect.appendChild(option);
      });
    } catch (error) {
      rentalTypeSelect.innerHTML =
        '<option value="">Unable to load rental types</option>';
      showMessage(error.message || "Unable to load rental types.", "error");
    }
  }

  function updateImagePreview() {
    if (!imagePreviewGrid) return;

    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    previewUrls = [];
    imagePreviewGrid.innerHTML = "";
    imagePreviewGrid.classList.toggle("hidden", selectedImages.length < 1);

    imagePickerTitle.textContent =
      selectedImages.length > 0
        ? `${selectedImages.length} image${selectedImages.length === 1 ? "" : "s"} selected`
        : "Choose property images";

    imagePickerHelp.textContent =
      selectedImages.length > 0
        ? "Choose more photos to add to your selection (up to 10 total)."
        : "JPG, PNG, or WebP only, maximum 10 images.";

    selectedImages.forEach((file, index) => {
      const preview = document.createElement("div");
      preview.className = "image-preview-card";

      const imageUrl = URL.createObjectURL(file);
      previewUrls.push(imageUrl);
      preview.innerHTML = `
        <img src="${imageUrl}" alt="${escapeHtml(file.name)}" />
        <span>${escapeHtml(file.name)}</span>
        <button type="button" class="create-image-remove" aria-label="Remove ${escapeHtml(file.name)}" ${imagesLocked ? "disabled" : ""}>Remove photo</button>
      `;
      preview.querySelector("button").addEventListener("click", () => {
        if (imagesLocked) return;
        selectedImages.splice(index, 1);
        hideMessage();
        updateImagePreview();
        const buttons = imagePreviewGrid.querySelectorAll("button");
        (buttons[Math.min(index, buttons.length - 1)] || imageInput)?.focus();
      });

      const image = preview.querySelector("img");
      image.addEventListener("load", () => URL.revokeObjectURL(imageUrl), {
        once: true,
      });

      imagePreviewGrid.appendChild(preview);
    });
  }

  function setupImageInput() {
    imageInput?.addEventListener("change", () => {
      if (imagesLocked) return;
      const files = Array.from(imageInput.files || []);
      // Keep the queue independent of the native picker so later selections append.
      imageInput.value = "";
      if (!files.length) return;
      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
      if (files.some((file) => !allowedTypes.includes(file.type))) {
        showMessage(
          "Only JPG, PNG, and WebP images are allowed. Your selected photos were kept.",
          "error",
        );
        return;
      }
      const key = (file) =>
        JSON.stringify([file.name, file.size, file.lastModified, file.type]);
      const seen = new Set(selectedImages.map(key));
      const additions = files.filter((file) => {
        const identity = key(file);
        if (seen.has(identity)) return false;
        seen.add(identity);
        return true;
      });
      if (selectedImages.length + additions.length > 10) {
        showMessage(
          `You can select up to 10 images. You already have ${selectedImages.length}; choose up to ${10 - selectedImages.length} more. Your selected photos were kept.`,
          "error",
        );
        return;
      }
      selectedImages.push(...additions);
      hideMessage();
      updateImagePreview();
    });
  }

  function splitList(value) {
    return String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function getFieldValue(formData, key) {
    return String(formData.get(key) || "").trim();
  }

  function formatValidationErrors(errors) {
    if (!errors || typeof errors !== "object") {
      return "";
    }

    return Object.values(errors).filter(Boolean).join(" ");
  }

  async function setupMapPicker() {
    if (!window.SilipMuntiMaps || !latitudeInput || !longitudeInput) return;

    try {
      mapPickerController = await window.SilipMuntiMaps.createPicker({
        element: "#create-property-map",
        latitude: latitudeInput.value,
        longitude: longitudeInput.value,
        latitudeInput,
        longitudeInput,
        locateButton: mapLocateButton,
        statusElement: mapStatus,
        searchInput: mapSearchInput,
        searchButton: mapSearchButton,
        addressInput,
        barangayInput,
        cityInput,
      });
    } catch (error) {
      if (mapStatus) {
        mapStatus.textContent =
          "The map could not be loaded. Enter valid coordinates manually.";
        mapStatus.dataset.type = "error";
      }
    }
  }

  function getFormPayload() {
    const formData = new FormData(form);
    const latitudeValue = getFieldValue(formData, "latitude");
    const longitudeValue = getFieldValue(formData, "longitude");

    return {
      rental_type_id: Number(getFieldValue(formData, "rental_type_id")),
      title: getFieldValue(formData, "title"),
      description: getFieldValue(formData, "description"),
      price: Number(getFieldValue(formData, "price")),
      address: getFieldValue(formData, "address"),
      barangay: getFieldValue(formData, "barangay"),
      latitude: latitudeValue === "" ? null : Number(latitudeValue),
      longitude: longitudeValue === "" ? null : Number(longitudeValue),
      bedroom_no: getFieldValue(formData, "bedroom_no"),
      listing_size: getFieldValue(formData, "listing_size"),
      occupancy_limit: getFieldValue(formData, "occupancy_limit"),
      availability_status:
        getFieldValue(formData, "availability_status") || "available",
      nearby_establishments: splitList(formData.get("nearby_establishments")),
      transport_routes: splitList(formData.get("transport_routes")),
      amenities: splitList(formData.get("amenities")),
    };
  }

  async function createListing() {
    const payload = getFormPayload();
    const coordinates = window.SilipMuntiMaps?.normalizeCoordinates(
      payload.latitude,
      payload.longitude,
    );

    if (!coordinates) {
      throw new Error(
        "Select the property location on the map or enter valid coordinates.",
      );
    }

    const response = await window.SilipMuntiSession.secureFetch(
      endpoints.createListing,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      const details = formatValidationErrors(result.errors);
      throw new Error(details || result.message || "Unable to create listing.");
    }

    const listingId =
      result.data?.listing_id ?? result.data?.id ?? result.listing_id ?? null;

    if (!listingId) {
      throw new Error("Listing was created but no listing ID was returned.");
    }

    return Number(listingId);
  }

  async function uploadListingImages(listingId) {
    if (selectedImages.length < 1) return;

    for (const [index, image] of selectedImages.entries()) {
      setSubmitting(
        true,
        `Uploading image ${index + 1} of ${selectedImages.length}...`,
      );

      const imageData = new FormData();
      imageData.append("listing_id", String(listingId));
      imageData.append("image", image);

      const response = await window.SilipMuntiSession.secureFetch(
        endpoints.uploadImage,
        {
          method: "POST",
          credentials: "include",
          body: imageData,
        },
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message ||
            "Listing was created, but one or more images failed to upload.",
        );
      }
    }
  }

  function setupFormSubmit() {
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      hideMessage();

      setSubmitting(true, "Checking...");

      try {
        const isApproved = await checkLandlordApproval();

        if (!isApproved) {
          setSubmitting(false);
          return;
        }

        setSubmitting(true, "Creating...");
        const listingId = await createListing();

        setSubmitting(true, "Uploading images...");
        await uploadListingImages(listingId);

        await window.SilipMuntiLandlordShell?.refreshCounts({
          useCache: false,
        });
        showMessage("Listing created successfully. Redirecting...", "success");

        window.setTimeout(() => {
          window.location.href = `${FRONTEND_ROOT}/pages/landlord/listings.html`;
        }, 800);
      } catch (error) {
        showMessage(error.message || "Unable to create listing.", "error");
        setSubmitting(false);
      }
    });
  }

  async function initialize() {
    const user = await loadCurrentUser();
    if (!user) return;

    setupImageInput();
    setupFormSubmit();

    await Promise.all([loadNotificationCount(), loadRentalTypes()]);

    const isApproved = await checkLandlordApproval(user);

    if (isApproved) {
      await setupMapPicker();
    }
  }

  initialize();
})();
