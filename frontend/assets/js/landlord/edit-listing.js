(() => {
  const API = {
    listings: "/SilipMunti/backend/landlord/get-listings.php",
    rentalTypes: "/SilipMunti/backend/rental-types/get-all.php",
    update: "/SilipMunti/backend/landlord/update-listing.php",
    uploadImage: "/SilipMunti/backend/landlord/upload-listing-image.php",
    deleteImage: "/SilipMunti/backend/landlord/delete-listing-image.php",
  };

  const listingId = Number(
    new URLSearchParams(window.location.search).get("id"),
  );
  let listing = null;
  const form = document.querySelector("#edit-listing-form");
  const loading = document.querySelector("#page-loading");
  const pageError = document.querySelector("#page-error");
  const formMessage = document.querySelector("#form-message");
  const saveButton = document.querySelector("#save-button");
  const imageGrid = document.querySelector("#image-grid");
  const imageInput = document.querySelector("#image-upload");
  const imageUploadLabel = document.querySelector("#image-upload-label");
  const uploadMessage = document.querySelector("#upload-message");
  const latitudeInput = document.querySelector("#latitude");
  const longitudeInput = document.querySelector("#longitude");
  const mapStatus = document.querySelector("#edit-map-status");
  const mapLocateButton = document.querySelector("#edit-map-locate");
  const mapSearchInput = document.querySelector("#edit-map-search");
  const mapSearchButton = document.querySelector("#edit-map-search-button");
  const addressInput = form?.elements.address;
  const barangayInput = form?.elements.barangay;
  let mapPickerController = null;

  const request = async (url, options = {}) => {
    const response = await window.SilipMuntiSession.secureFetch(url, {
      credentials: "include",
      cache: "no-store",
      ...options,
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) {
      const error = new Error(
        result?.message || "Unable to complete the request.",
      );
      error.status = response.status;
      error.errors = result?.errors || {};
      throw error;
    }
    return result;
  };

  const listFromInput = (value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  const inputFromList = (value) =>
    Array.isArray(value) ? value.join(", ") : "";
  const showMessage = (element, message, type) => {
    element.textContent = message;
    element.className = `${element.id === "form-message" ? "form-message" : "upload-message"} ${type}`;
  };

  const clearFieldErrors = () => {
    document
      .querySelectorAll(".field-error")
      .forEach((item) => (item.textContent = ""));
    document
      .querySelectorAll(".invalid")
      .forEach((item) => item.classList.remove("invalid"));
  };

  const showFieldErrors = (errors) => {
    Object.entries(errors || {}).forEach(([field, message]) => {
      const input = form.elements[field];
      const error = document.querySelector(`[data-error-for="${field}"]`);
      input?.classList.add("invalid");
      if (error) error.textContent = message;
    });
  };

  const populateRentalTypes = async () => {
    const result = await request(API.rentalTypes);
    const select = document.querySelector("#rental-type");
    select.innerHTML = '<option value="">Select rental type</option>';
    result.data.rental_types.forEach((type) => {
      const option = document.createElement("option");
      option.value = type.id;
      option.textContent = type.name;
      select.append(option);
    });
  };

  const renderImages = () => {
    const images = listing.images || [];
    document.querySelector("#image-count").textContent = `${images.length}/10`;
    document
      .querySelector("#empty-images")
      .classList.toggle("hidden", images.length > 0);
    imageUploadLabel.classList.toggle("disabled", images.length >= 10);
    imageGrid.innerHTML = images
      .map(
        (image) => `
      <article class="property-image">
        <img src="${image.image_url}" alt="Property image" />
        <button class="delete-image-button" type="button" data-image-id="${image.id}" aria-label="Delete image"><i class="fa-solid fa-trash"></i></button>
      </article>
    `,
      )
      .join("");
  };

  const populateForm = () => {
    form.elements.title.value = listing.title || "";
    form.elements.rental_type_id.value = listing.rental_type_id || "";
    form.elements.price.value = listing.price ?? "";
    form.elements.description.value = listing.description || "";
    form.elements.address.value = listing.address || "";
    form.elements.barangay.value = listing.barangay || "";
    form.elements.latitude.value = listing.latitude ?? "";
    form.elements.longitude.value = listing.longitude ?? "";
    form.elements.bedroom_no.value = listing.bedroom_no ?? "";
    form.elements.listing_size.value = listing.listing_size ?? "";
    form.elements.occupancy_limit.value = listing.occupancy_limit ?? "";
    form.elements.availability_status.value =
      listing.availability_status || "available";
    document.querySelector("#amenities").value = inputFromList(
      listing.amenities,
    );
    document.querySelector("#nearby-establishments").value = inputFromList(
      listing.nearby_establishments,
    );
    document.querySelector("#transport-routes").value = inputFromList(
      listing.transport_routes,
    );
    document.querySelector("#description-count").textContent =
      `${form.elements.description.value.length}/5000`;
    const badge = document.querySelector("#verification-status");
    badge.textContent = listing.verification_status || "pending";
    badge.className = `status-badge ${listing.verification_status || "pending"}`;
    renderImages();
  };

  const setupMapPicker = async () => {
    if (!window.SilipMuntiMaps || !latitudeInput || !longitudeInput) return;

    if (mapSearchInput && !mapSearchInput.value.trim()) {
      mapSearchInput.value = [addressInput?.value, barangayInput?.value]
        .filter(Boolean)
        .join(", ");
    }

    try {
      mapPickerController = await window.SilipMuntiMaps.createPicker({
        element: "#edit-property-map",
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
      });
    } catch (error) {
      if (mapStatus) {
        mapStatus.textContent =
          "The map could not be loaded. Enter valid coordinates manually.";
        mapStatus.dataset.type = "error";
      }
    }
  };

  const loadPage = async () => {
    if (!Number.isInteger(listingId) || listingId < 1)
      throw new Error("A valid listing ID is required.");
    const user = await window.SilipMuntiSession?.getCurrentUser();
    if (!user) {
      window.location.href = "/SilipMunti/frontend/pages/auth/login.html";
      return;
    }
    if (user.role !== "landlord") {
      window.location.href = "/SilipMunti/frontend/index.html";
      return;
    }
    window.SilipMuntiLandlordShell?.setLandlordProfile(user);
    const [listingsResult] = await Promise.all([
      request(API.listings),
      populateRentalTypes(),
    ]);
    listing = listingsResult.data.listings.find(
      (item) => Number(item.id) === listingId,
    );
    if (!listing)
      throw new Error("Listing not found or does not belong to your account.");
    populateForm();
    loading.classList.add("hidden");
    form.classList.remove("hidden");
    await setupMapPicker();
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFieldErrors();
    formMessage.classList.add("hidden");
    saveButton.disabled = true;
    saveButton.querySelector("span").textContent = "Saving...";
    const data = {
      listing_id: listingId,
      rental_type_id: Number(form.elements.rental_type_id.value),
      title: form.elements.title.value.trim(),
      description: form.elements.description.value.trim(),
      price: form.elements.price.value,
      address: form.elements.address.value.trim(),
      barangay: form.elements.barangay.value,
      latitude: form.elements.latitude.value,
      longitude: form.elements.longitude.value,
      bedroom_no: form.elements.bedroom_no.value,
      listing_size: form.elements.listing_size.value,
      occupancy_limit: form.elements.occupancy_limit.value,
      availability_status: form.elements.availability_status.value,
      amenities: listFromInput(document.querySelector("#amenities").value),
      nearby_establishments: listFromInput(
        document.querySelector("#nearby-establishments").value,
      ),
      transport_routes: listFromInput(
        document.querySelector("#transport-routes").value,
      ),
    };
    const coordinates = window.SilipMuntiMaps?.normalizeCoordinates(
      data.latitude,
      data.longitude,
    );

    if (!coordinates) {
      showMessage(
        formMessage,
        "Select the property location on the map or enter valid coordinates.",
        "error",
      );
      saveButton.disabled = false;
      saveButton.querySelector("span").textContent = "Save Changes";
      return;
    }
    try {
      const result = await request(API.update, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      listing.availability_status = result.data.availability_status;
      listing.verification_status = result.data.verification_status;
      document.querySelector("#verification-status").textContent =
        result.data.verification_status;
      document.querySelector("#verification-status").className =
        `status-badge ${result.data.verification_status}`;
      showMessage(formMessage, result.message, "success");
    } catch (error) {
      showFieldErrors(error.errors);
      showMessage(formMessage, error.message, "error");
      document
        .querySelector(".invalid")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    } finally {
      saveButton.disabled = false;
      saveButton.querySelector("span").textContent = "Save Changes";
    }
  });

  imageInput.addEventListener("change", async () => {
    const file = imageInput.files[0];
    if (!file) return;
    const data = new FormData();
    data.append("listing_id", listingId);
    data.append("image", file);
    imageUploadLabel.classList.add("disabled");
    showMessage(uploadMessage, "Uploading image...", "success");
    try {
      const result = await request(API.uploadImage, {
        method: "POST",
        body: data,
      });
      listing.images.push({
        id: result.data.image_id,
        image_url: result.data.image_url,
      });
      renderImages();
      showMessage(uploadMessage, result.message, "success");
    } catch (error) {
      showMessage(uploadMessage, error.message, "error");
    } finally {
      imageInput.value = "";
      if (listing.images.length < 10)
        imageUploadLabel.classList.remove("disabled");
    }
  });

  imageGrid.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-image-id]");
    if (!button) return;
    const shouldDelete = await window.SilipModal.confirm({
      title: "Delete property image?",
      message: "This image will be permanently removed from the listing.",
      confirmText: "Delete image",
    });
    if (!shouldDelete) return;
    button.disabled = true;
    try {
      const imageId = Number(button.dataset.imageId);
      const result = await request(API.deleteImage, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_id: imageId }),
      });
      listing.images = listing.images.filter(
        (image) => Number(image.id) !== imageId,
      );
      renderImages();
      showMessage(uploadMessage, result.message, "success");
    } catch (error) {
      button.disabled = false;
      showMessage(uploadMessage, error.message, "error");
    }
  });

  document.querySelector("#description").addEventListener("input", (event) => {
    document.querySelector("#description-count").textContent =
      `${event.target.value.length}/5000`;
  });

  loadPage().catch((error) => {
    loading.classList.add("hidden");
    pageError.textContent = error.message;
    pageError.classList.remove("hidden");
  });
})();
