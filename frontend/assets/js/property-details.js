const GET_LISTING_API = "/SilipMunti/backend/listings/get-one.php";

const ADD_FAVORITE_API = "/SilipMunti/backend/renter/add-favorite.php";

const GET_FAVORITES_API = "/SilipMunti/backend/renter/get-favorites.php";

const REMOVE_FAVORITE_API = "/SilipMunti/backend/renter/remove-favorite.php";

const CREATE_INQUIRY_API = "/SilipMunti/backend/inquiries/create-inquiry.php";

const MESSAGES_PAGE_URL = "/SilipMunti/frontend/pages/messages/index.html";

const propertyLoading = document.querySelector("#property-loading");

const propertyError = document.querySelector("#property-error");

const propertyErrorMessage = document.querySelector("#property-error-message");

const propertyPage = document.querySelector("#property-page");

const breadcrumbTitle = document.querySelector("#breadcrumb-title");

const propertyTitle = document.querySelector("#property-title");

const propertyAddress = document.querySelector("#property-address");

const propertyPrice = document.querySelector("#property-price");

const favoriteButton = document.querySelector("#favorite-button");

const propertyType = document.querySelector("#property-type");

const propertyBedrooms = document.querySelector("#property-bedrooms");

const propertySize = document.querySelector("#property-size");

const propertyOccupancy = document.querySelector("#property-occupancy");

const propertyAvailability = document.querySelector("#property-availability");

const propertyDescription = document.querySelector("#property-description");

const propertyAmenities = document.querySelector("#property-amenities");

const nearbyEstablishments = document.querySelector("#nearby-establishments");

const transportRoutes = document.querySelector("#transport-routes");

const mapLocationTitle = document.querySelector("#map-location-title");

const mapLocationAddress = document.querySelector("#map-location-address");

const openMapButton = document.querySelector("#open-map-button");

const landlordName = document.querySelector("#landlord-name");

const galleryGrid = document.querySelector("#gallery-grid");

const viewImagesButton = document.querySelector("#view-images-button");

const imageLightbox = document.querySelector("#image-lightbox");

const lightboxImage = document.querySelector("#lightbox-image");

const lightboxCounter = document.querySelector("#lightbox-counter");

const closeLightboxButton = document.querySelector("#close-lightbox");

const lightboxPreviousButton = document.querySelector("#lightbox-previous");

const lightboxNextButton = document.querySelector("#lightbox-next");

const openInquiryButton = document.querySelector("#open-inquiry-button");

const inquiryModal = document.querySelector("#inquiry-modal");

const closeInquiryButton = document.querySelector("#close-inquiry-button");

const inquiryForm = document.querySelector("#inquiry-form");

const inquiryMessage = document.querySelector("#inquiry-message");

const inquiryFormMessage = document.querySelector("#inquiry-form-message");

const sendInquiryButton = document.querySelector("#send-inquiry-button");

const messageError = document.querySelector('[data-error-for="message_text"]');

const pageParameters = new URLSearchParams(window.location.search);

const listingId = pageParameters.get("id");

const favoriteListingIds = new Set();

let currentUser = null;
let currentListing = null;
let galleryImages = [];
let currentImageIndex = 0;

function getProfilePictureUrl(profilePicture) {
  if (!profilePicture) {
    return "../../assets/images/default-profile.png";
  }

  if (/^https?:\/\//i.test(profilePicture)) {
    return profilePicture;
  }

  if (profilePicture.startsWith("/")) {
    return profilePicture;
  }

  return `/SilipMunti/backend/${profilePicture}`;
}

function formatPrice(price) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(price) || 0);
}

function parseListData(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string" || value.trim() === "") {
    return [];
  }

  try {
    const parsedValue = JSON.parse(value);

    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch (error) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function setProfileImageFallback(imageElement) {
  if (!imageElement) {
    return;
  }

  imageElement.addEventListener("error", () => {
    imageElement.onerror = null;

    imageElement.src =
      "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' rx='60' fill='%23eef1ff'/%3E%3Ccircle cx='60' cy='43' r='20' fill='%23112bc1'/%3E%3Cpath d='M25 105c2-24 17-36 35-36s33 12 35 36' fill='%23112bc1'/%3E%3C/svg%3E";
  });
}

function setPropertyImageFallback(imageElement) {
  if (!imageElement) {
    return;
  }

  imageElement.addEventListener("error", () => {
    imageElement.onerror = null;

    imageElement.src = "../../assets/images/property-placeholder.jpg";
  });
}

async function initializeCurrentUser() {
  try {
    currentUser = await SilipMuntiSession.getCurrentUser();
  } catch (error) {
    currentUser = null;
  }

  await window.SilipMuntiSiteNavbar?.initialize?.();
}

async function loadFavoriteListingIds() {
  favoriteListingIds.clear();

  if (!currentUser || currentUser.role !== "renter") {
    return;
  }

  try {
    const response = await fetch(GET_FAVORITES_API, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      return;
    }

    const favorites = result.data?.favorites ?? [];

    favorites.forEach((favorite) => {
      favoriteListingIds.add(Number(favorite.listing_id));
    });
  } catch (error) {
    console.error(error);
  }
}

function updateFavoriteButton() {
  if (!favoriteButton || !currentListing) {
    return;
  }

  const isFavorite = favoriteListingIds.has(Number(currentListing.id));

  favoriteButton.classList.toggle("active", isFavorite);

  favoriteButton.setAttribute(
    "aria-label",
    isFavorite ? "Remove from favorites" : "Add to favorites",
  );

  favoriteButton.title = isFavorite
    ? "Remove from favorites"
    : "Add to favorites";

  favoriteButton.innerHTML = isFavorite
    ? '<i class="fa-solid fa-heart"></i>'
    : '<i class="fa-regular fa-heart"></i>';
}

async function toggleFavorite() {
  if (!currentListing) {
    return;
  }

  if (!currentUser) {
    sessionStorage.setItem(
      "silip_munti_redirect",
      window.location.pathname + window.location.search,
    );

    window.location.href = "../auth/login.html";

    return;
  }

  if (currentUser.role !== "renter") {
    alert("Only renter accounts can save properties.");

    return;
  }

  const normalizedListingId = Number(currentListing.id);

  const isFavorite = favoriteListingIds.has(normalizedListingId);

  favoriteButton.disabled = true;

  try {
    const response = await fetch(
      isFavorite ? REMOVE_FAVORITE_API : ADD_FAVORITE_API,
      {
        method: isFavorite ? "DELETE" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          listing_id: normalizedListingId,
        }),
      },
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to update favorite.");
    }

    if (isFavorite) {
      favoriteListingIds.delete(normalizedListingId);
    } else {
      favoriteListingIds.add(normalizedListingId);
    }

    updateFavoriteButton();
  } catch (error) {
    alert(error.message || "Unable to update favorite.");
  } finally {
    favoriteButton.disabled = false;
  }
}

function createGalleryPreview(image, index, remainingImages) {
  const button = document.createElement("button");

  const previewImage = document.createElement("img");

  button.type = "button";

  button.className = "gallery-preview";

  button.setAttribute("aria-label", `View property image ${index + 1}`);

  previewImage.src = image.image_url;

  previewImage.alt = `${currentListing?.title || "Property"} image ${index + 1}`;

  setPropertyImageFallback(previewImage);

  button.appendChild(previewImage);

  if (remainingImages > 0) {
    const overlay = document.createElement("span");

    overlay.className = "gallery-more-overlay";

    overlay.innerHTML = `
      <i class="fa-regular fa-images"></i>
      <span>+${remainingImages} more</span>
    `;

    button.appendChild(overlay);
  }

  button.addEventListener("click", () => {
    openImageLightbox(index);
  });

  return button;
}

function renderGallery(images) {
  if (!galleryGrid) {
    return;
  }

  galleryImages = Array.isArray(images)
    ? images.filter((image) => image && image.image_url)
    : [];

  galleryGrid.innerHTML = "";

  galleryGrid.classList.remove("single-image", "two-images");

  if (galleryImages.length === 0) {
    galleryImages = [
      {
        image_url: "../../assets/images/property-placeholder.jpg",
      },
    ];
  }

  if (galleryImages.length === 1) {
    galleryGrid.classList.add("single-image");
  } else if (galleryImages.length === 2) {
    galleryGrid.classList.add("two-images");
  }

  galleryImages.slice(0, 3).forEach((image, index) => {
    const remainingImages = index === 2 ? galleryImages.length - 3 : 0;

    const preview = createGalleryPreview(
      image,
      index,
      Math.max(remainingImages, 0),
    );

    galleryGrid.appendChild(preview);
  });

  if (viewImagesButton) {
    viewImagesButton.innerHTML = `
      <i class="fa-regular fa-images"></i>
      View Images (${galleryImages.length})
    `;
  }
}

function updateLightboxImage() {
  if (galleryImages.length === 0 || !lightboxImage) {
    return;
  }

  const activeImage = galleryImages[currentImageIndex];

  lightboxImage.src = activeImage.image_url;

  lightboxImage.alt = `${currentListing?.title || "Property"} image ${currentImageIndex + 1}`;

  if (lightboxCounter) {
    lightboxCounter.textContent = `${currentImageIndex + 1} / ${galleryImages.length}`;
  }

  const hasMultipleImages = galleryImages.length > 1;

  if (lightboxPreviousButton) {
    lightboxPreviousButton.disabled = !hasMultipleImages;
  }

  if (lightboxNextButton) {
    lightboxNextButton.disabled = !hasMultipleImages;
  }
}

function openImageLightbox(index) {
  if (!imageLightbox || galleryImages.length === 0) {
    return;
  }

  currentImageIndex = index;

  updateLightboxImage();

  imageLightbox.classList.remove("hidden");

  document.body.classList.add("modal-open");
}

function closeImageLightbox() {
  if (!imageLightbox) {
    return;
  }

  imageLightbox.classList.add("hidden");

  if (!inquiryModal || inquiryModal.classList.contains("hidden")) {
    document.body.classList.remove("modal-open");
  }
}

function showPreviousImage() {
  if (galleryImages.length <= 1) {
    return;
  }

  currentImageIndex =
    currentImageIndex === 0 ? galleryImages.length - 1 : currentImageIndex - 1;

  updateLightboxImage();
}

function showNextImage() {
  if (galleryImages.length <= 1) {
    return;
  }

  currentImageIndex =
    currentImageIndex === galleryImages.length - 1 ? 0 : currentImageIndex + 1;

  updateLightboxImage();
}

function renderDetailItems(
  container,
  items,
  iconClass,
  itemClass,
  emptyMessage,
) {
  if (!container) {
    return;
  }

  container.innerHTML = "";

  if (items.length === 0) {
    const emptyText = document.createElement("p");

    emptyText.className = "empty-detail";

    emptyText.textContent = emptyMessage;

    container.appendChild(emptyText);

    return;
  }

  items.forEach((item) => {
    const element = document.createElement("span");

    const icon = document.createElement("i");

    const text = document.createElement("span");

    element.className = itemClass;

    icon.className = iconClass;

    text.textContent = item;

    element.append(icon, text);

    container.appendChild(element);
  });
}

function showPropertyError(message) {
  propertyLoading?.classList.add("hidden");

  propertyPage?.classList.add("hidden");

  if (propertyErrorMessage) {
    propertyErrorMessage.textContent = message;
  }

  propertyError?.classList.remove("hidden");
}

function renderListing(listing) {
  currentListing = listing;

  const fullAddress = [listing.address, listing.barangay, listing.city]
    .filter(Boolean)
    .join(", ");

  const bedroomNumber = Number(listing.bedroom_no);

  const availability = String(listing.availability_status || "").toLowerCase();

  const isAvailable = availability === "available";

  document.title = `${listing.title} | SilipMunti`;

  if (breadcrumbTitle) {
    breadcrumbTitle.textContent = listing.title;
  }

  if (propertyTitle) {
    propertyTitle.textContent = listing.title;
  }

  if (propertyAddress) {
    propertyAddress.textContent = fullAddress || "Muntinlupa City";
  }

  if (propertyPrice) {
    propertyPrice.textContent = formatPrice(listing.price);
  }

  if (propertyType) {
    propertyType.textContent = listing.rental_type || "Not specified";
  }

  if (propertyBedrooms) {
    propertyBedrooms.textContent =
      bedroomNumber === 0
        ? "Studio"
        : Number.isFinite(bedroomNumber)
          ? `${bedroomNumber} ${bedroomNumber === 1 ? "Bedroom" : "Bedrooms"}`
          : "Not specified";
  }

  if (propertySize) {
    propertySize.textContent = listing.listing_size
      ? `${Number(listing.listing_size).toLocaleString()} m²`
      : "Not specified";
  }

  if (propertyOccupancy) {
    propertyOccupancy.textContent = listing.occupancy_limit
      ? `Up to ${listing.occupancy_limit}`
      : "Not specified";
  }

  if (propertyAvailability) {
    propertyAvailability.textContent = isAvailable
      ? "Available"
      : "Unavailable";
  }

  if (propertyDescription) {
    propertyDescription.textContent =
      listing.description || "No description available.";
  }

  if (landlordName) {
    landlordName.textContent = listing.landlord_name || "Verified landlord";
  }

  if (mapLocationTitle) {
    mapLocationTitle.textContent =
      listing.barangay || listing.city || "Muntinlupa City";
  }

  if (mapLocationAddress) {
    mapLocationAddress.textContent =
      fullAddress || "Location is not specified.";
  }

  if (openMapButton) {
    if (listing.latitude && listing.longitude) {
      const coordinates = `${listing.latitude},${listing.longitude}`;

      openMapButton.href = `https://www.google.com/maps?q=${encodeURIComponent(coordinates)}`;

      openMapButton.classList.remove("hidden");
    } else {
      openMapButton.classList.add("hidden");
    }
  }

  if (openInquiryButton) {
    openInquiryButton.disabled = !isAvailable;

    openInquiryButton.innerHTML = isAvailable
      ? `
          <i class="fa-regular fa-paper-plane"></i>
          Send Inquiry
        `
      : `
          <i class="fa-solid fa-ban"></i>
          Currently Unavailable
        `;
  }

  renderDetailItems(
    propertyAmenities,
    parseListData(listing.amenities),
    "fa-solid fa-circle-check",
    "detail-chip",
    "No amenities have been listed.",
  );

  renderDetailItems(
    nearbyEstablishments,
    parseListData(listing.nearby_establishments),
    "fa-solid fa-location-dot",
    "detail-list-item",
    "No nearby establishments have been listed.",
  );

  renderDetailItems(
    transportRoutes,
    parseListData(listing.transport_routes),
    "fa-solid fa-bus",
    "detail-list-item",
    "No transportation routes have been listed.",
  );

  renderGallery(listing.images);

  updateFavoriteButton();

  propertyLoading?.classList.add("hidden");

  propertyError?.classList.add("hidden");

  propertyPage?.classList.remove("hidden");
}

async function loadListing() {
  if (!listingId || !/^\d+$/.test(listingId) || Number(listingId) < 1) {
    showPropertyError("A valid property ID is required.");

    return;
  }

  try {
    const response = await fetch(
      `${GET_LISTING_API}?id=${encodeURIComponent(listingId)}`,
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      },
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to retrieve property.");
    }

    if (!result.data?.listing) {
      throw new Error("Property information is unavailable.");
    }

    renderListing(result.data.listing);
  } catch (error) {
    console.error(error);

    showPropertyError(error.message || "Unable to retrieve property details.");
  }
}

function showInquiryMessage(message, type) {
  if (!inquiryFormMessage) {
    return;
  }

  inquiryFormMessage.textContent = message;

  inquiryFormMessage.className = `form-message ${type}`;
}

function clearInquiryMessage() {
  if (inquiryFormMessage) {
    inquiryFormMessage.textContent = "";

    inquiryFormMessage.className = "form-message hidden";
  }

  if (messageError) {
    messageError.textContent = "";
  }
}

function getInquiryId(result) {
  return (
    result?.data?.inquiry_id ??
    result?.data?.inquiry?.id ??
    result?.inquiry_id ??
    null
  );
}

function openInquiryModal() {
  if (!currentUser) {
    sessionStorage.setItem(
      "silip_munti_redirect",
      window.location.pathname + window.location.search,
    );

    window.location.href = "../auth/login.html";

    return;
  }

  if (currentUser.role !== "renter") {
    alert("Only renter accounts can send inquiries.");

    return;
  }

  if (!inquiryModal) {
    return;
  }

  clearInquiryMessage();

  inquiryModal.classList.remove("hidden");

  document.body.classList.add("modal-open");

  setTimeout(() => {
    inquiryMessage?.focus();
  }, 100);
}

function closeInquiryModal() {
  if (!inquiryModal) {
    return;
  }

  inquiryModal.classList.add("hidden");

  if (!imageLightbox || imageLightbox.classList.contains("hidden")) {
    document.body.classList.remove("modal-open");
  }
}

async function submitInquiry(event) {
  event.preventDefault();

  clearInquiryMessage();

  const messageText = inquiryMessage?.value.trim() || "";

  if (messageText === "") {
    if (messageError) {
      messageError.textContent = "Message is required.";
    }

    return;
  }

  if (messageText.length > 2000) {
    if (messageError) {
      messageError.textContent = "Message must not exceed 2000 characters.";
    }

    return;
  }

  if (!sendInquiryButton || !currentListing) {
    return;
  }

  sendInquiryButton.disabled = true;

  const buttonText = sendInquiryButton.querySelector("span");

  if (buttonText) {
    buttonText.textContent = "Sending...";
  }

  try {
    const response = await fetch(CREATE_INQUIRY_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        listing_id: Number(currentListing.id),
        message_text: messageText,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to send inquiry.");
    }

    const inquiryId = getInquiryId(result);

    if (!inquiryId) {
      throw new Error(
        "Inquiry was created, but no conversation ID was returned.",
      );
    }

    inquiryForm?.reset();

    showInquiryMessage("Inquiry sent. Opening your conversation...", "success");

    window.setTimeout(() => {
      window.location.href = `${MESSAGES_PAGE_URL}?inquiry_id=${encodeURIComponent(inquiryId)}`;
    }, 500);
  } catch (error) {
    showInquiryMessage(error.message || "Unable to send inquiry.", "error");
  } finally {
    sendInquiryButton.disabled = false;

    if (buttonText) {
      buttonText.textContent = "Send Inquiry";
    }
  }
}

favoriteButton?.addEventListener("click", toggleFavorite);

viewImagesButton?.addEventListener("click", () => {
  openImageLightbox(0);
});

closeLightboxButton?.addEventListener("click", closeImageLightbox);

lightboxPreviousButton?.addEventListener("click", showPreviousImage);

lightboxNextButton?.addEventListener("click", showNextImage);

imageLightbox?.addEventListener("click", (event) => {
  if (event.target === imageLightbox) {
    closeImageLightbox();
  }
});

setPropertyImageFallback(lightboxImage);

openInquiryButton?.addEventListener("click", openInquiryModal);

closeInquiryButton?.addEventListener("click", closeInquiryModal);

inquiryModal?.addEventListener("click", (event) => {
  if (event.target === inquiryModal) {
    closeInquiryModal();
  }
});

inquiryForm?.addEventListener("submit", submitInquiry);

document.addEventListener("keydown", (event) => {
  if (imageLightbox && !imageLightbox.classList.contains("hidden")) {
    if (event.key === "Escape") {
      closeImageLightbox();
    } else if (event.key === "ArrowLeft") {
      showPreviousImage();
    } else if (event.key === "ArrowRight") {
      showNextImage();
    }

    return;
  }

  if (
    event.key === "Escape" &&
    inquiryModal &&
    !inquiryModal.classList.contains("hidden")
  ) {
    closeInquiryModal();
  }
});

async function initializePropertyDetailsPage() {
  await initializeCurrentUser();

  if (currentUser?.role === "renter") {
    await loadFavoriteListingIds();
  }

  await loadListing();
}

initializePropertyDetailsPage();
