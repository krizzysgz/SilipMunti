(function () {
  const API_ROOT = "/SilipMunti/backend";

  const FRONTEND_ROOT = "/SilipMunti/frontend";

  const endpoints = {
    createListing: `${API_ROOT}/landlord/create-listing.php`,

    getRentalTypes: `${API_ROOT}/rental-types/get-all.php`,

    getNotifications: `${API_ROOT}/notifications/get-all.php?status=unread`,

    uploadImage: `${API_ROOT}/landlord/upload-listing-image.php`,

    uploadPropertyProof: `${API_ROOT}/landlord/update-property-proof.php`,
  };

  const form = document.querySelector("#create-listing-form");

  const messageBox = document.querySelector("#create-listing-message");

  const verificationGuard = document.querySelector("#verification-guard");

  const rentalTypeSelect = document.querySelector("#rental-type-select");

  const imageInput = document.querySelector("#listing-images");

  const propertyProofFile = document.querySelector("#property-proof-file");

  const propertyProofType = document.querySelector("#property-proof-type");

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
    const idStatus = landlord?.valid_id_status || "not_submitted";
    const canCreate =
      ["pending", "approved"].includes(idStatus) &&
      !["rejected", "suspended"].includes(accountStatus);
    verificationGuard?.classList.toggle("hidden", canCreate);
    form?.classList.toggle("hidden", !canCreate);
    if (!canCreate) {
      showMessage(
        accountStatus === "suspended" || accountStatus === "rejected"
          ? "Your landlord account is restricted. Contact the administrator."
          : idStatus === "rejected"
            ? "Your Valid ID was rejected. Please resubmit it before creating a listing."
            : "Submit your required Valid Government-Issued ID on the Verification page before adding properties.",
        "error",
      );
    } else {
      hideMessage();
    }
    return canCreate;
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

    imagePreviewGrid.innerHTML = "";
    imagePreviewGrid.classList.toggle("hidden", selectedImages.length === 0);

    if (imagePickerTitle) {
      imagePickerTitle.textContent = selectedImages.length
        ? `${selectedImages.length} image${selectedImages.length === 1 ? "" : "s"} selected`
        : "Choose property images";
    }

    if (imagePickerHelp) {
      imagePickerHelp.textContent = selectedImages.length
        ? `Click the image area to add more photos (${selectedImages.length}/10 selected).`
        : "JPG, PNG, or WebP only, maximum 10 images.";
    }

    selectedImages.forEach((file, index) => {
      const preview = document.createElement("div");
      preview.className = "image-preview-card";

      const imageUrl = URL.createObjectURL(file);
      preview.innerHTML = `
        <img src="${imageUrl}" alt="${escapeHtml(file.name)}" />
        <span>${escapeHtml(file.name)}</span>
      `;

      const image = preview.querySelector("img");
      image.addEventListener("load", () => URL.revokeObjectURL(imageUrl), {
        once: true,
      });
      image.addEventListener("error", () => URL.revokeObjectURL(imageUrl), {
        once: true,
      });

      imagePreviewGrid.appendChild(preview);
    });
  }

  function setupImageInput() {
    if (!imageInput) return;

    // Allow selecting multiple files in the same dialog.
    imageInput.multiple = true;

    imageInput.addEventListener("change", () => {
      const files = Array.from(imageInput.files || []);
      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
      const additions = [];
      let duplicates = 0;

      // Reset input so the same file can be chosen again after a removal,
      // without clearing the already selected images array.
      imageInput.value = "";
      if (files.length === 0) return;

      if (files.some((file) => !allowedTypes.includes(file.type))) {
        showMessage("Only JPG, PNG, and WebP images are allowed.", "error");
        return;
      }

      for (const file of files) {
        const exists = [...selectedImages, ...additions].some(
          (existing) =>
            existing.name === file.name &&
            existing.size === file.size &&
            existing.lastModified === file.lastModified,
        );

        if (exists) {
          duplicates += 1;
          continue;
        }
        additions.push(file);
      }

      if (selectedImages.length + additions.length > 10) {
        showMessage(
          `You can select a maximum of 10 property images. You currently have ${selectedImages.length} selected.`,
          "error",
        );
        return;
      }

      selectedImages.push(...additions);
      updateImagePreview();

      if (duplicates > 0 && additions.length === 0) {
        showMessage("Those photos are already selected.", "error");
      } else {
        hideMessage();
      }
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

  async function uploadOptionalPropertyProof(listingId) {
    const file = propertyProofFile?.files?.[0];

    if (!file) return;

    if (!propertyProofType?.value) {
      throw new Error(
        "Select the supporting document type before submitting the file.",
      );
    }

    const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];

    if (!allowedTypes.includes(file.type) || file.size > 5 * 1024 * 1024) {
      throw new Error(
        "Supporting document must be a PDF, JPG, or PNG under 5 MB.",
      );
    }

    const data = new FormData();

    data.append("listing_id", String(listingId));

    data.append("document_type", propertyProofType.value);

    data.append("document", file);

    const response = await window.SilipMuntiSession.secureFetch(
      endpoints.uploadPropertyProof,

      { method: "POST", credentials: "include", body: data },
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.message ||
          "Listing was created but the optional proof was not uploaded. Please contact support.",
      );
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

        if (propertyProofFile?.files?.length) {
          setSubmitting(true, "Uploading supporting document...");

          await uploadOptionalPropertyProof(listingId);
        }

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

    const isApproved = await checkLandlordApproval();

    if (isApproved) {
      await setupMapPicker();
    }
  }

  initialize();
})();
