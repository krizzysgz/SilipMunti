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

  const request = async (url, options = {}) => {
    const response = await fetch(url, {
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
    document.querySelector("#topbar-user-name").textContent =
      `${user.first_name} ${user.last_name}`;
    const picture = user.profile_picture
      ? `/SilipMunti/backend/${user.profile_picture}`
      : "/SilipMunti/frontend/assets/images/default-profile.png";
    document.querySelector("#topbar-profile-picture").src = picture;
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
      amenities: listFromInput(document.querySelector("#amenities").value),
      nearby_establishments: listFromInput(
        document.querySelector("#nearby-establishments").value,
      ),
      transport_routes: listFromInput(
        document.querySelector("#transport-routes").value,
      ),
    };
    try {
      const result = await request(API.update, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      document.querySelector("#verification-status").textContent = "pending";
      document.querySelector("#verification-status").className =
        "status-badge pending";
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
    if (!button || !confirm("Delete this property image?")) return;
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

  const profileButton = document.querySelector("#topbar-profile-button");
  const profileDropdown = document.querySelector("#topbar-profile-dropdown");
  profileButton.addEventListener("click", (event) => {
    event.stopPropagation();
    profileDropdown.classList.toggle("hidden");
    profileButton.setAttribute(
      "aria-expanded",
      String(!profileDropdown.classList.contains("hidden")),
    );
  });
  document.addEventListener("click", () =>
    profileDropdown.classList.add("hidden"),
  );
  document
    .querySelector("#sidebar-toggle")
    .addEventListener("click", () =>
      document.querySelector("#dashboard-sidebar").classList.add("open"),
    );
  document
    .querySelector("#sidebar-close")
    .addEventListener("click", () =>
      document.querySelector("#dashboard-sidebar").classList.remove("open"),
    );
  ["#sidebar-logout", "#dropdown-logout"].forEach((selector) =>
    document
      .querySelector(selector)
      .addEventListener("click", () => window.SilipMuntiSession.logoutUser()),
  );

  loadPage().catch((error) => {
    loading.classList.add("hidden");
    pageError.textContent = error.message;
    pageError.classList.remove("hidden");
  });
})();
