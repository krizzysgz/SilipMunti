const GET_FAVORITES_API = "/SilipMunti/backend/renter/get-favorites.php";

const REMOVE_FAVORITE_API = "/SilipMunti/backend/renter/remove-favorite.php";

const DEFAULT_PROPERTY_IMAGE = "../../assets/images/property-placeholder.jpg";

const favoritesLoading = document.querySelector("#favorites-loading");

const favoritesGrid = document.querySelector("#favorites-grid");

const emptyFavorites = document.querySelector("#empty-favorites");

const favoritesCount = document.querySelector("#favorites-count");

const favoritesMessage = document.querySelector("#favorites-message");

const confirmationModal = document.querySelector("#confirmation-modal");

const confirmationOverlay = document.querySelector("#confirmation-overlay");

const cancelRemoveButton = document.querySelector("#cancel-remove-button");

const confirmRemoveButton = document.querySelector("#confirm-remove-button");

let currentUser = null;
let selectedListingId = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPrice(price) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(price) || 0);
}

function formatDate(dateValue) {
  if (!dateValue) {
    return "Recently saved";
  }

  const date = new Date(String(dateValue).replace(" ", "T"));

  if (Number.isNaN(date.getTime())) {
    return "Recently saved";
  }

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function showMessage(message, type) {
  favoritesMessage.textContent = message;
  favoritesMessage.className = `favorites-message ${type}`;

  window.setTimeout(() => {
    favoritesMessage.textContent = "";
    favoritesMessage.className = "favorites-message hidden";
  }, 3500);
}

function setPropertyImageFallback(image) {
  image.addEventListener("error", () => {
    image.src = DEFAULT_PROPERTY_IMAGE;
  });
}

async function requireRenterUser() {
  try {
    currentUser = await window.SilipMuntiSession?.getCurrentUser();
  } catch (error) {
    currentUser = null;
  }

  if (!currentUser) {
    window.location.href = "../auth/login.html";
    return false;
  }

  if (currentUser.role !== "renter") {
    window.location.href =
      window.SilipMuntiSession?.getDashboardUrl(currentUser.role) ||
      "/SilipMunti/frontend/index.html";
    return false;
  }

  return true;
}

function createFavoriteCard(favorite) {
  const listingId = Number(favorite.listing_id);

  const detailsUrl = `../properties/details.html?id=${listingId}`;

  const imageUrl = favorite.primary_image || DEFAULT_PROPERTY_IMAGE;

  const title = escapeHtml(favorite.title || "Rental property");

  const barangay = escapeHtml(favorite.barangay || "");

  const city = escapeHtml(favorite.city || "Muntinlupa");

  const rentalType = escapeHtml(favorite.rental_type || "Rental");

  const landlordName = escapeHtml(
    favorite.landlord_name || "Verified landlord",
  );

  const bedroomText =
    Number(favorite.bedroom_no) === 1
      ? "1 Bedroom"
      : `${Number(favorite.bedroom_no) || 0} Bedrooms`;

  const card = document.createElement("article");

  card.className = "favorite-card";
  card.dataset.listingId = String(listingId);

  card.innerHTML = `
    <button
      type="button"
      class="remove-favorite-button"
      data-remove-listing="${listingId}"
      aria-label="Remove ${title} from favorites"
    >
      <i class="fa-solid fa-heart"></i>
    </button>

    <a
      href="${detailsUrl}"
      class="favorite-image-link"
    >
      <img
        src="${escapeHtml(imageUrl)}"
        alt="${title}"
        class="favorite-image"
      />
    </a>

    <div class="favorite-content">
      <div class="favorite-price">
        ${formatPrice(favorite.price)}
        <small>/ month</small>
      </div>

      <h3 class="favorite-title">
        <a href="${detailsUrl}">
          ${title}
        </a>
      </h3>

      <div class="favorite-location">
        <i class="fa-solid fa-location-dot"></i>
        <span>
          ${barangay}${barangay && city ? ", " : ""}${city}
        </span>
      </div>

      <div class="favorite-details">
        <div class="favorite-type">
          <i class="fa-solid fa-building"></i>
          <span>${rentalType}</span>
        </div>

        <div class="favorite-type">
          <i class="fa-solid fa-bed"></i>
          <span>${escapeHtml(bedroomText)}</span>
        </div>

        <div class="favorite-landlord">
          <i class="fa-solid fa-circle-check"></i>
          <span>${landlordName}</span>
        </div>
      </div>

      <div class="favorite-footer">
        <div class="favorite-saved-date">
          <i class="fa-regular fa-clock"></i>
          <span>
            ${escapeHtml(formatDate(favorite.saved_at))}
          </span>
        </div>

        <a
          href="${detailsUrl}"
          class="view-property-button"
        >
          View details
        </a>
      </div>
    </div>
  `;

  const propertyImage = card.querySelector(".favorite-image");

  setPropertyImageFallback(propertyImage);

  return card;
}

function renderFavorites(favorites) {
  favoritesGrid.innerHTML = "";

  favoritesCount.textContent = `${favorites.length} saved ${
    favorites.length === 1 ? "property" : "properties"
  }`;

  if (favorites.length === 0) {
    favoritesGrid.classList.add("hidden");
    emptyFavorites.classList.remove("hidden");
    return;
  }

  emptyFavorites.classList.add("hidden");
  favoritesGrid.classList.remove("hidden");

  favorites.forEach((favorite) => {
    favoritesGrid.appendChild(createFavoriteCard(favorite));
  });
}

async function loadFavorites() {
  favoritesLoading.classList.remove("hidden");
  favoritesGrid.classList.add("hidden");
  emptyFavorites.classList.add("hidden");

  try {
    const response = await fetch(GET_FAVORITES_API, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    });

    const result = await response.json();

    if (response.status === 401) {
      window.location.href = "../auth/login.html";
      return;
    }

    if (response.status === 403) {
      throw new Error("Only renter accounts can access favorites.");
    }

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to retrieve favorites.");
    }

    const favorites = result.data?.favorites ?? [];

    renderFavorites(favorites);
  } catch (error) {
    favoritesCount.textContent = "Unable to load saved properties";

    showMessage(error.message || "Unable to connect to the server.", "error");
  } finally {
    favoritesLoading.classList.add("hidden");
  }
}

function openRemoveConfirmation(listingId) {
  selectedListingId = Number(listingId);

  confirmationModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeRemoveConfirmation() {
  selectedListingId = null;

  confirmationModal.classList.add("hidden");
  document.body.style.overflow = "";
}

async function removeFavorite() {
  if (!selectedListingId) {
    return;
  }

  confirmRemoveButton.disabled = true;
  confirmRemoveButton.textContent = "Removing...";

  try {
    const response = await fetch(REMOVE_FAVORITE_API, {
      method: "DELETE",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        listing_id: selectedListingId,
      }),
    });

    const result = await response.json();

    if (response.status === 401) {
      window.location.href = "../auth/login.html";
      return;
    }

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to remove favorite.");
    }

    const card = favoritesGrid.querySelector(
      `[data-listing-id="${selectedListingId}"]`,
    );

    card?.remove();

    const remainingCards =
      favoritesGrid.querySelectorAll(".favorite-card").length;

    favoritesCount.textContent = `${remainingCards} saved ${
      remainingCards === 1 ? "property" : "properties"
    }`;

    if (remainingCards === 0) {
      favoritesGrid.classList.add("hidden");
      emptyFavorites.classList.remove("hidden");
    }

    closeRemoveConfirmation();

    showMessage(
      result.message || "Property removed from favorites.",
      "success",
    );
  } catch (error) {
    showMessage(error.message || "Unable to remove favorite.", "error");
  } finally {
    confirmRemoveButton.disabled = false;
    confirmRemoveButton.textContent = "Remove";
  }
}

favoritesGrid.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-listing]");

  if (!removeButton) {
    return;
  }

  openRemoveConfirmation(removeButton.dataset.removeListing);
});

confirmationOverlay.addEventListener("click", closeRemoveConfirmation);

cancelRemoveButton.addEventListener("click", closeRemoveConfirmation);

confirmRemoveButton.addEventListener("click", removeFavorite);

document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    !confirmationModal.classList.contains("hidden")
  ) {
    closeRemoveConfirmation();
  }
});

async function initializeFavoritesPage() {
  const authenticated = await requireRenterUser();

  if (!authenticated) {
    return;
  }

  await loadFavorites();
}

initializeFavoritesPage();
