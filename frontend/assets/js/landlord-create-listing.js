(function () {
  const API_ROOT = "/SilipMunti/backend";
  const FRONTEND_ROOT = "/SilipMunti/frontend";

  const endpoints = {
    createListing: `${API_ROOT}/landlord/create-listing.php`,
    getDocuments: `${API_ROOT}/landlord/get-documents.php`,
    getListings: `${API_ROOT}/landlord/get-listings.php`,
    getRentalTypes: `${API_ROOT}/rental-types/get-all.php`,
    getNotifications: `${API_ROOT}/notifications/get-all.php?status=unread`,
    uploadImage: `${API_ROOT}/landlord/upload-listing-image.php`,
  };

  const requiredDocuments = ["valid_id", "barangay_clearance", "land_title"];

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

  let selectedImages = [];

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

  function getProfileUrl(user) {
    if (!user?.profile_picture) {
      return `${FRONTEND_ROOT}/assets/images/default-profile.png`;
    }

    return user.profile_picture.startsWith("/")
      ? user.profile_picture
      : `${API_ROOT}/${user.profile_picture}`;
  }

  function hydrateTopbarUser(user) {
    const fullName = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
    const displayName = fullName || "Landlord";
    const profileUrl = getProfileUrl(user);

    document.querySelector("#landlord-topbar-name").textContent = displayName;
    document.querySelector("#dropdown-landlord-name").textContent = displayName;
    document.querySelector("#landlord-profile-picture").src = profileUrl;
    document.querySelector("#dropdown-landlord-picture").src = profileUrl;
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

  async function loadSidebarCounts() {
    try {
      const response = await fetch(endpoints.getListings, {
        credentials: "include",
        cache: "no-store",
      });
      const result = await response.json();
      const listings = Array.isArray(result.data?.listings)
        ? result.data.listings
        : [];

      window.SilipMuntiLandlordShell?.setListingCount(listings.length);
    } catch (error) {
      window.SilipMuntiLandlordShell?.setListingCount(0);
    }
  }

  async function checkVerification() {
    const response = await fetch(endpoints.getDocuments, {
      credentials: "include",
      cache: "no-store",
    });
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.message || "Unable to check your verification status.",
      );
    }

    const documents = Array.isArray(result.data?.documents)
      ? result.data.documents
      : [];

    const approvedCount = requiredDocuments.filter((documentType) =>
      documents.some(
        (document) =>
          document.document_type === documentType &&
          document.verification_status === "approved",
      ),
    ).length;

    const isVerified = approvedCount === requiredDocuments.length;

    verificationGuard?.classList.toggle("hidden", isVerified);
    form?.classList.toggle("hidden", !isVerified);

    if (!isVerified) {
      showMessage(
        `Your account has ${approvedCount} of 3 approved documents. Complete verification before creating a listing.`,
        "error",
      );
    }

    return isVerified;
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
    imagePreviewGrid.classList.toggle("hidden", selectedImages.length < 1);

    imagePickerTitle.textContent =
      selectedImages.length > 0
        ? `${selectedImages.length} image${selectedImages.length === 1 ? "" : "s"} selected`
        : "Choose property images";

    imagePickerHelp.textContent =
      selectedImages.length > 0
        ? "Click the image area again to replace selected photos."
        : "JPG, PNG, or WebP only, maximum 10 images.";

    selectedImages.forEach((file) => {
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

      imagePreviewGrid.appendChild(preview);
    });
  }

  function setupImageInput() {
    imageInput?.addEventListener("change", () => {
      const files = Array.from(imageInput.files || []);
      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

      if (files.length > 10) {
        imageInput.value = "";
        selectedImages = [];
        updateImagePreview();
        showMessage("You can upload up to 10 images only.", "error");
        return;
      }

      const invalidFile = files.find(
        (file) => !allowedTypes.includes(file.type),
      );

      if (invalidFile) {
        imageInput.value = "";
        selectedImages = [];
        updateImagePreview();
        showMessage("Only JPG, PNG, and WebP images are allowed.", "error");
        return;
      }

      selectedImages = files;
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

  function getFormPayload() {
    const formData = new FormData(form);

    return {
      rental_type_id: Number(getFieldValue(formData, "rental_type_id")),
      title: getFieldValue(formData, "title"),
      description: getFieldValue(formData, "description"),
      price: Number(getFieldValue(formData, "price")),
      address: getFieldValue(formData, "address"),
      barangay: getFieldValue(formData, "barangay"),
      latitude: Number(getFieldValue(formData, "latitude")),
      longitude: Number(getFieldValue(formData, "longitude")),
      bedroom_no: getFieldValue(formData, "bedroom_no"),
      listing_size: getFieldValue(formData, "listing_size"),
      occupancy_limit: getFieldValue(formData, "occupancy_limit"),
      nearby_establishments: splitList(formData.get("nearby_establishments")),
      transport_routes: splitList(formData.get("transport_routes")),
      amenities: splitList(formData.get("amenities")),
    };
  }

  async function createListing() {
    const payload = getFormPayload();

    const response = await fetch(endpoints.createListing, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

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

      const response = await fetch(endpoints.uploadImage, {
        method: "POST",
        credentials: "include",
        body: imageData,
      });

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
        const isVerified = await checkVerification();

        if (!isVerified) {
          setSubmitting(false);
          return;
        }

        setSubmitting(true, "Creating...");
        const listingId = await createListing();

        setSubmitting(true, "Uploading images...");
        await uploadListingImages(listingId);

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

    await Promise.all([
      loadNotificationCount(),
      loadSidebarCounts(),
      loadRentalTypes(),
    ]);

    await checkVerification();
  }

  initialize();
})();
