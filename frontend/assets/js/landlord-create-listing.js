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

  const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
  const MAX_IMAGES = 10;
  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

  const uploadedImages = new Set();

  let selectedImages = [];
  let previewUrls = [];
  let imagesLocked = false;
  let mapPickerController = null;
  let savedListingId = null;
  let needsReview = false;
  let submitting = false;
  let completed = false;
  let photoNotice = null;

  function showPhotoNotice(message, type = "error", scroll = false) {
    if (!photoNotice) {
      photoNotice = document.createElement("p");
      photoNotice.id = "listing-photo-notice";
      photoNotice.setAttribute("role", "alert");

      photoNotice.style.cssText = [
        "padding:12px 14px",
        "border:1px solid currentColor",
        "border-radius:6px",
        "font-size:14px",
        "line-height:1.6",
        "overflow-wrap:anywhere",
      ].join(";");

      const picker = imageInput?.closest("label");

      if (picker) {
        picker.insertAdjacentElement("afterend", photoNotice);
      } else {
        imagePreviewGrid?.insertAdjacentElement("beforebegin", photoNotice);
      }
    }

    photoNotice.textContent = message;
    photoNotice.hidden = !message;
    photoNotice.style.color = type === "error" ? "#a51d32" : "#185c3b";

    if (scroll && message) {
      photoNotice.scrollIntoView({
        block: "center",
        behavior: "auto",
      });
    }
  }

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

    imagesLocked = isSubmitting || needsReview;

    if (imageInput) {
      imageInput.disabled = imagesLocked;
    }

    imagePreviewGrid?.querySelectorAll("button").forEach((button) => {
      button.disabled = imagesLocked || button.dataset.uploaded === "true";
    });

    submitButton.disabled = isSubmitting;
    submitButton.querySelector("span").textContent = text;
  }

  function lockSavedDetails() {
    form
      ?.querySelectorAll("input:not([type=file]), select, textarea")
      .forEach((field) => {
        field.disabled = true;
      });

    [mapLocateButton, mapSearchButton].forEach((button) => {
      if (button) button.disabled = true;
    });

    const map = document.querySelector("#create-property-map");

    if (map) {
      map.inert = true;
    }

    if (form) {
      form.noValidate = true;
    }
  }

  async function readJson(response) {
    try {
      return await response.json();
    } catch {
      throw new Error(
        "The server returned an unreadable response. Check My Properties before retrying.",
      );
    }
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
    } catch {
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
        ? "Add more photos, up to 10 total. Maximum 5 MB per image."
        : "JPG, PNG, or WebP only. Maximum 10 images, 5 MB each.";

    selectedImages.forEach((file, index) => {
      const preview = document.createElement("div");
      preview.className = "image-preview-card";

      const imageUrl = URL.createObjectURL(file);
      const uploaded = uploadedImages.has(file);

      previewUrls.push(imageUrl);

      preview.innerHTML = `
        <img src="${imageUrl}" alt="${escapeHtml(file.name)}" />
        <span>${escapeHtml(file.name)}</span>
        <button
          type="button"
          class="create-image-remove"
          aria-label="${uploaded ? "Uploaded" : "Remove"} ${escapeHtml(file.name)}"
          data-uploaded="${uploaded}"
          ${imagesLocked || uploaded ? "disabled" : ""}
        >
          ${uploaded ? "Uploaded" : "Remove photo"}
        </button>
      `;

      preview.querySelector("button").addEventListener("click", () => {
        if (imagesLocked || uploadedImages.has(file)) return;

        selectedImages.splice(index, 1);
        showPhotoNotice("");
        updateImagePreview();

        const buttons = imagePreviewGrid.querySelectorAll("button");

        (buttons[Math.min(index, buttons.length - 1)] || imageInput)?.focus();
      });

      preview
        .querySelector("img")
        .addEventListener("load", () => URL.revokeObjectURL(imageUrl), {
          once: true,
        });

      imagePreviewGrid.appendChild(preview);
    });
  }

  function setupImageInput() {
    imageInput?.addEventListener("change", () => {
      if (imagesLocked) return;

      const files = Array.from(imageInput.files || []);
      imageInput.value = "";

      if (!files.length) return;

      const problems = [];

      const validFiles = files.filter((file) => {
        if (!ALLOWED_TYPES.includes(file.type)) {
          problems.push(`${file.name}: JPG, PNG, or WebP only.`);
          return false;
        }

        if (file.size < 1 || file.size > MAX_IMAGE_SIZE) {
          problems.push(
            `${file.name}: maximum 5 MB per image; empty files are not allowed.`,
          );
          return false;
        }

        return true;
      });

      const key = (file) =>
        JSON.stringify([file.name, file.size, file.lastModified, file.type]);

      const seen = new Set(selectedImages.map(key));

      const additions = validFiles.filter((file) => {
        const identity = key(file);

        if (seen.has(identity)) return false;

        seen.add(identity);
        return true;
      });

      if (selectedImages.length + additions.length > MAX_IMAGES) {
        problems.push(
          `Maximum 10 images. You already have ${selectedImages.length}; choose up to ${MAX_IMAGES - selectedImages.length} more. Existing photos were kept.`,
        );
      } else {
        selectedImages.push(...additions);
      }

      updateImagePreview();

      if (problems.length) {
        const text =
          problems.slice(0, 5).join(" ") +
          (problems.length > 5
            ? ` ${problems.length - 5} more files were rejected.`
            : "");

        showPhotoNotice(text, "error", true);
      } else {
        showPhotoNotice(
          `${selectedImages.length} photo(s) selected. Maximum 5 MB per image.`,
          "success",
        );
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
    if (!window.SilipMuntiMaps || !latitudeInput || !longitudeInput) {
      return;
    }

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
    } catch {
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

    // Until the response is confirmed, do not assume creation failed.
    needsReview = true;

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

    const result = await readJson(response);

    if (!response.ok || !result.success) {
      if (
        !response.ok &&
        response.status >= 400 &&
        response.status < 500 &&
        result.success === false
      ) {
        needsReview = false;
      }

      const details = formatValidationErrors(result.errors);

      throw new Error(details || result.message || "Unable to create listing.");
    }

    const listingId =
      result.data?.listing_id ?? result.data?.id ?? result.listing_id ?? null;

    if (!Number.isSafeInteger(Number(listingId)) || Number(listingId) < 1) {
      throw new Error("Listing was created but no listing ID was returned.");
    }

    savedListingId = Number(listingId);
    needsReview = false;

    lockSavedDetails();

    return savedListingId;
  }

  async function uploadListingImages(listingId) {
    const pending = selectedImages.filter((file) => !uploadedImages.has(file));

    for (const [index, image] of pending.entries()) {
      setSubmitting(true, `Uploading ${index + 1} of ${pending.length}...`);

      const imageData = new FormData();
      imageData.append("listing_id", String(listingId));
      imageData.append("image", image);

      needsReview = true;

      const response = await window.SilipMuntiSession.secureFetch(
        endpoints.uploadImage,
        {
          method: "POST",
          credentials: "include",
          body: imageData,
        },
      );

      const result = await readJson(response);

      if (!response.ok || !result.success) {
        if (
          !response.ok &&
          response.status >= 400 &&
          response.status < 500 &&
          result.success === false
        ) {
          needsReview = false;
        }

        throw new Error(
          `${image.name}: ${result.message || "Unable to upload this photo."}`,
        );
      }

      uploadedImages.add(image);
      needsReview = false;

      updateImagePreview();
    }
  }

  function setupFormSubmit() {
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (submitting || completed) return;

      if (needsReview) {
        window.location.href = `${FRONTEND_ROOT}/pages/landlord/listings.html`;
        return;
      }

      hideMessage();

      const invalidImage = selectedImages.find(
        (file) =>
          !ALLOWED_TYPES.includes(file.type) ||
          file.size < 1 ||
          file.size > MAX_IMAGE_SIZE,
      );

      if (invalidImage || selectedImages.length > MAX_IMAGES) {
        showPhotoNotice(
          "Remove invalid photos before continuing. Maximum 10 images, 5 MB each.",
          "error",
          true,
        );
        return;
      }

      submitting = true;
      setSubmitting(true, "Checking...");

      try {
        if (!(await checkLandlordApproval())) return;

        if (!savedListingId) {
          setSubmitting(true, "Creating...");
          await createListing();
        }

        await uploadListingImages(savedListingId);

        completed = true;
        setSubmitting(true, "Saved");

        try {
          await window.SilipMuntiLandlordShell?.refreshCounts({
            useCache: false,
          });
        } catch {
          console.warn("Unable to refresh listing counts.");
        }

        showMessage("Listing saved successfully. Redirecting...", "success");

        showPhotoNotice(
          "Listing and selected photos saved successfully.",
          "success",
        );

        window.setTimeout(() => {
          window.location.href = `${FRONTEND_ROOT}/pages/landlord/listings.html`;
        }, 800);
      } catch (error) {
        if (needsReview) {
          lockSavedDetails();
        }

        const prefix = savedListingId
          ? `Listing #${savedListingId} is already saved. `
          : "";

        const recovery = needsReview
          ? " The server outcome could not be confirmed. Open My Properties and check before retrying."
          : savedListingId
            ? " Successfully uploaded photos were kept. Remove/replace rejected photos or retry the remaining uploads. Listing details are already saved; edit them through My Properties."
            : "";

        const text =
          prefix + (error.message || "Unable to save listing.") + recovery;

        showMessage(text, "error");
        showPhotoNotice(text, "error", true);
      } finally {
        submitting = false;

        if (!completed) {
          setSubmitting(
            false,
            needsReview
              ? "Open My Properties"
              : savedListingId
                ? "Retry remaining photos"
                : "Create listing",
          );
        }
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
