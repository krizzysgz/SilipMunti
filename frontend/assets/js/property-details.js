const GET_LISTING_API = "/SilipMunti/backend/listings/get-one.php";

const ADD_FAVORITE_API = "/SilipMunti/backend/renter/add-favorite.php";

const GET_FAVORITES_API = "/SilipMunti/backend/renter/get-favorites.php";

const REMOVE_FAVORITE_API = "/SilipMunti/backend/renter/remove-favorite.php";

const CREATE_INQUIRY_API = "/SilipMunti/backend/inquiries/create-inquiry.php";

const GET_LISTING_REVIEWS_API =
  "/SilipMunti/backend/reviews/get-by-listing.php";

const MESSAGES_PAGE_URL = "/SilipMunti/frontend/pages/messages/index.html";

const REVIEWS_PAGE_URL = "/SilipMunti/frontend/pages/reviews/index.html";

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

const propertyMap = document.querySelector("#property-map");

const landlordName = document.querySelector("#landlord-name");

const landlordVerificationBadge = document.querySelector(
  "#landlord-verification-badge",
);

const galleryGrid = document.querySelector("#gallery-grid");

const viewImagesButton = document.querySelector("#view-images-button");

const imageLightbox = document.querySelector("#image-lightbox");

const lightboxImage = document.querySelector("#lightbox-image");

const lightboxCounter = document.querySelector("#lightbox-counter");

const closeLightboxButton = document.querySelector("#close-lightbox");

const lightboxPreviousButton = document.querySelector("#lightbox-previous");

const lightboxNextButton = document.querySelector("#lightbox-next");

const openInquiryButton = document.querySelector("#open-inquiry-button");

const writeReviewButton = document.querySelector("#write-review-button");

const listingReviewAverage = document.querySelector("#listing-review-average");

const listingReviewTotal = document.querySelector("#listing-review-total");

const listingReviewsStatus = document.querySelector("#listing-reviews-status");

const listingReviewsList = document.querySelector("#listing-reviews-list");

const listingReviewsActions = document.querySelector(
  "#listing-reviews-actions",
);

const listingReviewsVisibleCount = document.querySelector(
  "#listing-reviews-visible-count",
);

const toggleListingReviewsButton = document.querySelector(
  "#toggle-listing-reviews",
);

const listingRatingBreakdown = document.querySelector(
  "#listing-rating-breakdown",
);

const listingRatingFilters = document.querySelector("#listing-rating-filters");

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
let allListingReviews = [];
let selectedReviewRating = "all";
let showAllListingReviews = false;

const INITIAL_LISTING_REVIEWS_LIMIT = 5;
let propertyMapController = null;

function getProfilePictureUrl(profilePicture) {
  if (!profilePicture) {
    return "../../assets/images/default-profile.svg";
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

function formatReviewDate(dateValue) {
  if (!dateValue) {
    return "Date unavailable";
  }

  const parsedDate = new Date(String(dateValue).replace(" ", "T"));

  if (Number.isNaN(parsedDate.getTime())) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsedDate);
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

    imageElement.src = "../../assets/images/property-placeholder.svg";
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
    window.SilipMuntiSession?.showLoginPrompt({
      title: "Save this property",
      message:
        "Sign in using a renter account to add this rental to your favorites.",
    });

    return;
  }

  if (currentUser.role !== "renter") {
    await window.SilipModal.warning({
      title: "Renter account required",
      message: "Only renter accounts can save properties.",
    });

    return;
  }

  const normalizedListingId = Number(currentListing.id);

  const isFavorite = favoriteListingIds.has(normalizedListingId);

  favoriteButton.disabled = true;

  try {
    if (!window.SilipMuntiSession?.secureFetch) {
      throw new Error(
        "Request security is unavailable. Refresh the page and try again.",
      );
    }

    const response = await window.SilipMuntiSession.secureFetch(
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

    if (response.status === 401) {
      currentUser = null;
      window.SilipMuntiSession?.showLoginPrompt({
        title: "Your session has ended",
        message: "Sign in again to update your saved properties.",
      });
      return;
    }

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
    await window.SilipModal.error({
      title: "Favorite not updated",
      message: error.message || "Unable to update favorite.",
    });
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
        image_url: "../../assets/images/property-placeholder.svg",
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

async function initializePropertyMap(listing) {
  if (!propertyMap || !window.SilipMuntiMaps) return;

  const coordinates = window.SilipMuntiMaps.normalizeCoordinates(
    listing.latitude,
    listing.longitude,
  );

  if (!coordinates) {
    propertyMap.classList.remove("is-loading");
    propertyMap.classList.add("sm-map-unavailable");
    propertyMap.textContent =
      "The landlord has not provided a valid map location.";
    openMapButton?.classList.add("hidden");
    return;
  }

  try {
    propertyMapController?.destroy?.();
    propertyMapController = await window.SilipMuntiMaps.createViewer({
      element: propertyMap,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      title: listing.title,
      address: [listing.address, listing.barangay, listing.city]
        .filter(Boolean)
        .join(", "),
    });

    if (openMapButton) {
      openMapButton.href = window.SilipMuntiMaps.externalUrl(
        coordinates.latitude,
        coordinates.longitude,
        propertyMapController.provider,
      );
      openMapButton.classList.remove("hidden");
    }
  } catch (error) {
    propertyMap.classList.remove("is-loading");
    propertyMap.classList.add("sm-map-unavailable");
    propertyMap.textContent =
      "The map could not be loaded. You can still open the location externally.";

    if (openMapButton) {
      openMapButton.href = window.SilipMuntiMaps.externalUrl(
        coordinates.latitude,
        coordinates.longitude,
      );
      openMapButton.classList.remove("hidden");
    }
  }
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

  if (landlordVerificationBadge) {
    landlordVerificationBadge.innerHTML =
      listing.landlord_verification_level === "fully_verified"
        ? '<i class="fa-solid fa-shield-halved"></i> Fully verified landlord'
        : '<i class="fa-solid fa-circle-check"></i> Verified landlord';
  }

  if (mapLocationTitle) {
    mapLocationTitle.textContent =
      listing.barangay || listing.city || "Muntinlupa City";
  }

  if (mapLocationAddress) {
    mapLocationAddress.textContent =
      fullAddress || "Location is not specified.";
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

  initializePropertyMap(listing);
}

function showListingReviewsStatus(message, state = "loading") {
  if (!listingReviewsStatus) {
    return;
  }

  const iconClass = {
    loading: "fa-solid fa-spinner fa-spin",
    empty: "fa-regular fa-message",
    error: "fa-solid fa-circle-exclamation",
  }[state];

  listingReviewsStatus.className = `listing-reviews-status ${state}`;
  listingReviewsStatus.replaceChildren();

  const icon = document.createElement("i");
  icon.className = iconClass;

  const text = document.createElement("span");
  text.textContent = message;

  listingReviewsStatus.append(icon, text);
}

function createListingReviewCard(review) {
  const card = document.createElement("article");
  card.className = "renter-review-card";

  const top = document.createElement("div");
  top.className = "renter-review-top";

  const author = document.createElement("div");
  author.className = "renter-review-author";

  const avatar = document.createElement("img");
  avatar.className = "renter-review-avatar";
  avatar.src = getProfilePictureUrl(review.profile_picture_url);
  avatar.alt = `${review.renter_name || "Renter"} profile picture`;
  setProfileImageFallback(avatar);

  const renterInformation = document.createElement("div");
  renterInformation.className = "renter-review-meta";

  const renterName = document.createElement("strong");
  renterName.textContent = review.renter_name || "SilipMunti renter";

  const reviewDate = document.createElement("time");
  reviewDate.dateTime = review.created_at || "";
  reviewDate.textContent = formatReviewDate(review.created_at);

  renterInformation.append(renterName, reviewDate);
  author.append(avatar, renterInformation);

  const rating = document.createElement("span");
  rating.className = "renter-review-rating";
  rating.textContent = `Rating ${Number(review.rating) || 0}`;

  top.append(author, rating);

  const comment = document.createElement("p");
  comment.className = "renter-review-comment";
  comment.textContent = review.comment || "No written comment was provided.";

  card.append(top, comment);

  return card;
}

function getListingRatingCounts(reviews) {
  const counts = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };

  reviews.forEach((review) => {
    const rating = Number(review.rating);

    if (counts[rating] !== undefined) {
      counts[rating] += 1;
    }
  });

  return counts;
}

function renderListingRatingBreakdown(reviews) {
  if (!listingRatingBreakdown) {
    return;
  }

  const counts = getListingRatingCounts(reviews);
  const total = reviews.length;

  listingRatingBreakdown.replaceChildren();

  for (let rating = 5; rating >= 1; rating -= 1) {
    const row = document.createElement("div");
    row.className = "rating-breakdown-row";

    const label = document.createElement("span");
    label.className = "rating-breakdown-label";
    label.textContent = `Rating ${rating}`;

    const track = document.createElement("div");
    track.className = "rating-breakdown-track";
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", `Rating ${rating}`);
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", String(total));
    track.setAttribute("aria-valuenow", String(counts[rating]));

    const fill = document.createElement("div");
    fill.className = "rating-breakdown-fill";
    fill.style.width = `${total > 0 ? (counts[rating] / total) * 100 : 0}%`;

    const count = document.createElement("span");
    count.className = "rating-breakdown-count";
    count.textContent = String(counts[rating]);

    track.appendChild(fill);
    row.append(label, track, count);
    listingRatingBreakdown.appendChild(row);
  }
}

function updateListingRatingFilters(reviews) {
  if (!listingRatingFilters) {
    return;
  }

  const counts = getListingRatingCounts(reviews);

  listingRatingFilters
    .querySelectorAll(".rating-filter-button")
    .forEach((button) => {
      const rating = button.dataset.rating;
      const count = rating === "all" ? reviews.length : counts[rating] || 0;
      const countElement = button.querySelector("span");

      if (countElement) {
        countElement.textContent = String(count);
      }

      const isActive = rating === selectedReviewRating;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
}

function getFilteredListingReviews() {
  return selectedReviewRating === "all"
    ? allListingReviews
    : allListingReviews.filter(
        (review) => Number(review.rating) === Number(selectedReviewRating),
      );
}

function updateListingReviewToggle(totalFilteredReviews, visibleReviews) {
  if (
    !listingReviewsActions ||
    !toggleListingReviewsButton ||
    !listingReviewsVisibleCount
  ) {
    return;
  }

  const hasMoreReviews = totalFilteredReviews > INITIAL_LISTING_REVIEWS_LIMIT;

  listingReviewsActions.classList.toggle("hidden", !hasMoreReviews);

  if (!hasMoreReviews) {
    toggleListingReviewsButton.setAttribute("aria-expanded", "false");
    return;
  }

  listingReviewsVisibleCount.textContent = `Showing ${visibleReviews} of ${totalFilteredReviews} reviews`;

  const label = toggleListingReviewsButton.querySelector("span");

  if (label) {
    label.textContent = showAllListingReviews
      ? "Show latest 5"
      : "See all reviews";
  }

  toggleListingReviewsButton.setAttribute(
    "aria-expanded",
    String(showAllListingReviews),
  );
}

function renderFilteredListingReviews() {
  if (!listingReviewsList) {
    return;
  }

  const filteredReviews = getFilteredListingReviews();

  listingReviewsList.replaceChildren();

  if (filteredReviews.length === 0) {
    listingReviewsList.classList.add("hidden");
    showListingReviewsStatus(
      selectedReviewRating === "all"
        ? "No renter reviews yet. Be the first to share your experience."
        : `No published reviews with rating ${selectedReviewRating}.`,
      "empty",
    );
    listingReviewsActions?.classList.add("hidden");
    return;
  }

  const visibleReviews = showAllListingReviews
    ? filteredReviews
    : filteredReviews.slice(0, INITIAL_LISTING_REVIEWS_LIMIT);

  visibleReviews.forEach((review) => {
    listingReviewsList.appendChild(createListingReviewCard(review));
  });

  updateListingReviewToggle(filteredReviews.length, visibleReviews.length);

  listingReviewsStatus?.classList.add("hidden");
  listingReviewsList.classList.remove("hidden");
}

function renderListingReviews(reviewData) {
  const reviews = Array.isArray(reviewData?.reviews) ? reviewData.reviews : [];
  const totalReviews = Number(reviewData?.summary?.total_reviews) || 0;
  const averageRating = Number(reviewData?.summary?.average_rating) || 0;

  if (listingReviewAverage) {
    listingReviewAverage.textContent = averageRating.toFixed(1);
  }

  if (listingReviewTotal) {
    listingReviewTotal.textContent =
      totalReviews === 0
        ? "No reviews yet"
        : `${totalReviews} ${totalReviews === 1 ? "review" : "reviews"}`;
  }

  allListingReviews = [...reviews].sort((firstReview, secondReview) => {
    const firstDate = new Date(
      String(firstReview.created_at || "").replace(" ", "T"),
    ).getTime();
    const secondDate = new Date(
      String(secondReview.created_at || "").replace(" ", "T"),
    ).getTime();

    if (Number.isFinite(firstDate) && Number.isFinite(secondDate)) {
      return secondDate - firstDate;
    }

    return Number(secondReview.id || 0) - Number(firstReview.id || 0);
  });
  selectedReviewRating = "all";
  showAllListingReviews = false;

  renderListingRatingBreakdown(reviews);
  updateListingRatingFilters(reviews);
  renderFilteredListingReviews();
}

async function loadListingReviews(currentListingId) {
  if (!currentListingId) {
    return;
  }

  listingReviewsList?.classList.add("hidden");
  showListingReviewsStatus("Loading renter reviews...", "loading");

  try {
    const response = await fetch(
      `${GET_LISTING_REVIEWS_API}?listing_id=${encodeURIComponent(currentListingId)}`,
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      },
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to retrieve renter reviews.");
    }

    renderListingReviews(result.data);
  } catch (error) {
    console.error(error);

    if (listingReviewAverage) {
      listingReviewAverage.textContent = "0.0";
    }

    if (listingReviewTotal) {
      listingReviewTotal.textContent = "Reviews unavailable";
    }

    showListingReviewsStatus(
      error.message || "Unable to load renter reviews right now.",
      "error",
    );
  }
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
    await loadListingReviews(result.data.listing.id);
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

async function openInquiryModal() {
  if (!currentUser) {
    window.SilipMuntiSession?.showLoginPrompt({
      title: "Message the landlord",
      message:
        "Sign in using a renter account to ask about availability, schedules, or rental terms.",
    });

    return;
  }

  if (currentUser.role !== "renter") {
    await window.SilipModal.warning({
      title: "Renter account required",
      message: "Only renter accounts can send inquiries.",
    });

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
    if (!window.SilipMuntiSession?.secureFetch) {
      throw new Error(
        "Request security is unavailable. Refresh the page and try again.",
      );
    }

    const response = await window.SilipMuntiSession.secureFetch(
      CREATE_INQUIRY_API,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          listing_id: Number(currentListing.id),
          message_text: messageText,
        }),
      },
    );

    const result = await response.json();

    if (response.status === 401) {
      currentUser = null;
      closeInquiryModal();
      window.SilipMuntiSession?.showLoginPrompt({
        title: "Your session has ended",
        message: "Sign in again to message the landlord.",
      });
      return;
    }

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

async function openListingReviewPage() {
  if (!currentListing) {
    return;
  }

  const reviewUrl = `${REVIEWS_PAGE_URL}?type=listing&listing_id=${encodeURIComponent(currentListing.id)}`;

  if (!currentUser) {
    window.SilipMuntiSession?.showLoginPrompt({
      title: "Write a property review",
      message:
        "Sign in using a renter account before sharing your experience with this property.",
      returnUrl: reviewUrl,
    });
    return;
  }

  if (currentUser.role !== "renter") {
    await window.SilipModal.warning({
      title: "Renter account required",
      message: "Only renter accounts can submit property reviews.",
    });
    return;
  }

  window.location.href = reviewUrl;
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

writeReviewButton?.addEventListener("click", openListingReviewPage);

listingRatingFilters?.addEventListener("click", (event) => {
  const button = event.target.closest(".rating-filter-button");

  if (!button || !listingRatingFilters.contains(button)) {
    return;
  }

  selectedReviewRating = button.dataset.rating || "all";
  showAllListingReviews = false;
  updateListingRatingFilters(allListingReviews);
  renderFilteredListingReviews();
});

toggleListingReviewsButton?.addEventListener("click", () => {
  showAllListingReviews = !showAllListingReviews;
  renderFilteredListingReviews();

  if (!showAllListingReviews) {
    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    document.querySelector("#listing-reviews-title")?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  }
});

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
