const LISTINGS_API = "/SilipMunti/backend/listings/get-all.php";

const RENTAL_TYPES_API = "/SilipMunti/backend/rental-types/get-all.php";

const ADD_FAVORITE_API = "/SilipMunti/backend/renter/add-favorite.php";

const GET_FAVORITES_API = "/SilipMunti/backend/renter/get-favorites.php";

const REMOVE_FAVORITE_API = "/SilipMunti/backend/renter/remove-favorite.php";

const filterForm = document.querySelector("#properties-filter-form");

const searchInput = document.querySelector("#filter-search");

const barangaySelect = document.querySelector("#filter-barangay");

const rentalTypeSelect = document.querySelector("#filter-rental-type");

const minPriceInput = document.querySelector("#filter-min-price");

const maxPriceInput = document.querySelector("#filter-max-price");

const bedroomsSelect = document.querySelector("#filter-bedrooms");

const sortSelect = document.querySelector("#filter-sort");

const resetFilterButton = document.querySelector("#reset-filter-button");

const applyFilterButton = document.querySelector("#apply-filter-button");

const propertiesGrid = document.querySelector("#properties-grid");

const propertiesMessage = document.querySelector("#properties-message");

const propertiesTotal = document.querySelector("#properties-total");

const paginationContainer = document.querySelector("#properties-pagination");

const favoriteListingIds = new Set();

let currentUser = null;
let currentPage = 1;
let currentRequest = null;
let activeLandlordId = "";

const listingsPerPage = 12;

async function initializeCurrentUser() {
  try {
    currentUser = await window.SilipMuntiSession?.getCurrentUser();
  } catch (error) {
    currentUser = null;
  }

  return currentUser;
}

async function loadRentalTypes() {
  rentalTypeSelect.disabled = true;
  rentalTypeSelect.innerHTML =
    '<option value="">Loading property types...</option>';

  try {
    const response = await fetch(RENTAL_TYPES_API, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to load property types.");
    }

    const rentalTypes =
      result.data?.rental_types ?? result.data?.types ?? result.data ?? [];

    if (!Array.isArray(rentalTypes)) {
      throw new Error("Invalid rental types response.");
    }

    rentalTypeSelect.innerHTML = '<option value="">All property types</option>';

    rentalTypes.forEach((rentalType) => {
      const name =
        rentalType.name ?? rentalType.rental_type_name ?? rentalType.type_name;

      if (!rentalType.id || !name) {
        return;
      }

      const option = document.createElement("option");

      option.value = rentalType.id;
      option.textContent = name;

      rentalTypeSelect.appendChild(option);
    });
  } catch (error) {
    console.error(error);

    rentalTypeSelect.innerHTML =
      '<option value="">Unable to load property types</option>';
  } finally {
    rentalTypeSelect.disabled = false;
  }
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
      throw new Error(result.message || "Unable to load favorites.");
    }

    const favorites = result.data?.favorites ?? [];

    favorites.forEach((favorite) => {
      favoriteListingIds.add(Number(favorite.listing_id));
    });
  } catch (error) {
    console.error(error);
  }
}

function updateFavoriteButton(button, listingId) {
  const isFavorite = favoriteListingIds.has(Number(listingId));

  button.classList.toggle("active", isFavorite);

  button.innerHTML = isFavorite
    ? '<i class="fa-solid fa-heart"></i>'
    : '<i class="fa-regular fa-heart"></i>';

  button.setAttribute(
    "aria-label",
    isFavorite ? "Remove from favorites" : "Add to favorites",
  );

  button.title = isFavorite ? "Remove from favorites" : "Add to favorites";
}

async function toggleFavorite(listingId, button) {
  if (!currentUser) {
    window.SilipMuntiSession?.showLoginPrompt({
      title: "Save this property",
      message:
        "Sign in using a renter account to add this rental to your favorites.",
    });

    return;
  }

  if (currentUser.role !== "renter") {
    alert("Only renter accounts can save properties.");

    return;
  }

  const normalizedListingId = Number(listingId);

  const isFavorite = favoriteListingIds.has(normalizedListingId);

  button.disabled = true;

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

    updateFavoriteButton(button, normalizedListingId);
  } catch (error) {
    alert(error.message || "Unable to update favorite.");
  } finally {
    button.disabled = false;
  }
}

function formatPrice(price) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(price));
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

function createInformationItem(iconClass, text) {
  const item = document.createElement("span");
  const icon = document.createElement("i");
  const label = document.createElement("span");

  icon.className = iconClass;
  label.textContent = text;

  item.append(icon, label);

  return item;
}

function createPropertyCard(listing) {
  const article = document.createElement("article");
  article.className = "property-card";

  const imageWrapper = document.createElement("div");

  imageWrapper.className = "property-image-wrapper";

  const image = document.createElement("img");

  image.className = "property-image";
  image.src =
    listing.primary_image || "../../assets/images/property-placeholder.svg";
  image.alt = listing.title || "Rental property";
  image.loading = "lazy";

  image.addEventListener("error", () => {
    image.src = "../../assets/images/property-placeholder.svg";
  });

  const typeBadge = document.createElement("span");

  typeBadge.className = "property-type-badge";
  typeBadge.textContent = listing.rental_type || "Rental";

  const favoriteButton = document.createElement("button");

  favoriteButton.type = "button";
  favoriteButton.className = "favorite-button";

  favoriteButton.dataset.listingId = listing.id;

  updateFavoriteButton(favoriteButton, listing.id);

  favoriteButton.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    await toggleFavorite(listing.id, favoriteButton);
  });

  imageWrapper.append(image, typeBadge, favoriteButton);

  const content = document.createElement("div");

  content.className = "property-card-content";

  const price = document.createElement("p");

  price.className = "property-price";
  price.innerHTML = `${formatPrice(listing.price)} <span>/ month</span>`;

  const titleLink = document.createElement("a");

  titleLink.className = "property-card-link";

  titleLink.href = `details.html?id=${listing.id}`;

  const title = document.createElement("h3");

  title.className = "property-title";
  title.textContent = listing.title || "Untitled property";

  titleLink.appendChild(title);

  const location = document.createElement("p");

  location.className = "property-location";

  const locationIcon = document.createElement("i");

  locationIcon.className = "fa-solid fa-location-dot";

  const locationText = document.createElement("span");

  locationText.textContent = [listing.barangay, listing.city]
    .filter(Boolean)
    .join(", ");

  location.append(locationIcon, locationText);

  const information = document.createElement("div");

  information.className = "property-information";

  const bedroomText =
    Number(listing.bedroom_no) === 0
      ? "Studio"
      : `${listing.bedroom_no ?? 0} ${
          Number(listing.bedroom_no) === 1 ? "bedroom" : "bedrooms"
        }`;

  information.appendChild(
    createInformationItem("fa-solid fa-bed", bedroomText),
  );

  if (listing.occupancy_limit !== null) {
    information.appendChild(
      createInformationItem(
        "fa-solid fa-users",
        `Up to ${listing.occupancy_limit}`,
      ),
    );
  }

  if (listing.listing_size !== null) {
    information.appendChild(
      createInformationItem(
        "fa-solid fa-ruler-combined",
        `${listing.listing_size} m²`,
      ),
    );
  }

  const description = document.createElement("p");

  description.className = "property-description";

  description.textContent = listing.description || "No description available.";

  const divider = document.createElement("hr");

  divider.className = "property-divider";

  const amenitiesList = document.createElement("ul");

  amenitiesList.className = "property-amenities";

  const amenities = parseListData(listing.amenities).slice(0, 4);

  if (amenities.length === 0) {
    const item = document.createElement("li");

    item.textContent = "No amenities listed";

    amenitiesList.appendChild(item);
  } else {
    amenities.forEach((amenity) => {
      const item = document.createElement("li");

      item.textContent = amenity;

      amenitiesList.appendChild(item);
    });
  }

  content.append(
    price,
    titleLink,
    location,
    information,
    description,
    divider,
    amenitiesList,
  );

  article.append(imageWrapper, content);

  return article;
}

function showLoadingCards() {
  propertiesGrid.innerHTML = "";
  propertiesMessage.classList.add("hidden");
  paginationContainer.classList.add("hidden");

  propertiesTotal.textContent = "Loading properties...";

  for (let index = 0; index < 8; index += 1) {
    const skeleton = document.createElement("div");

    skeleton.className = "property-skeleton";

    skeleton.innerHTML = `
      <div class="skeleton-image"></div>
      <div class="skeleton-content">
        <div class="skeleton-line short"></div>
        <div class="skeleton-line medium"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
      </div>
    `;

    propertiesGrid.appendChild(skeleton);
  }
}

function showPropertiesMessage(title, message, iconClass) {
  propertiesGrid.innerHTML = "";
  paginationContainer.classList.add("hidden");

  propertiesMessage.innerHTML = `
    <i class="${iconClass}"></i>
    <strong>${title}</strong>
    <span>${message}</span>
  `;

  propertiesMessage.classList.remove("hidden");
}

function getFilterParameters() {
  const parameters = new URLSearchParams();

  const fields = {
    search: searchInput.value.trim(),
    barangay: barangaySelect.value,
    rental_type_id: rentalTypeSelect.value,
    min_price: minPriceInput.value,
    max_price: maxPriceInput.value,
    bedroom_no: bedroomsSelect.value,
    landlord_id: activeLandlordId,
    sort: sortSelect.value,
    page: String(currentPage),
    limit: String(listingsPerPage),
  };

  Object.entries(fields).forEach(([key, value]) => {
    if (String(value).trim() !== "") {
      parameters.set(key, value);
    }
  });

  return parameters;
}

function updatePageUrl(parameters) {
  const visibleParameters = new URLSearchParams(parameters);

  visibleParameters.delete("limit");

  if (visibleParameters.get("page") === "1") {
    visibleParameters.delete("page");
  }

  if (visibleParameters.get("sort") === "newest") {
    visibleParameters.delete("sort");
  }

  const queryString = visibleParameters.toString();

  const newUrl = queryString
    ? `${window.location.pathname}?${queryString}`
    : window.location.pathname;

  window.history.replaceState({}, "", newUrl);
}

function setFilterValuesFromUrl() {
  const parameters = new URLSearchParams(window.location.search);

  const requestedLandlordId = parameters.get("landlord_id") ?? "";
  activeLandlordId = /^\d+$/.test(requestedLandlordId)
    ? requestedLandlordId
    : "";

  searchInput.value = parameters.get("search") ?? "";

  barangaySelect.value = parameters.get("barangay") ?? "";

  rentalTypeSelect.value = parameters.get("rental_type_id") ?? "";

  minPriceInput.value = parameters.get("min_price") ?? "";

  maxPriceInput.value = parameters.get("max_price") ?? "";

  bedroomsSelect.value = parameters.get("bedroom_no") ?? "";

  const requestedSort = parameters.get("sort") ?? "newest";

  const allowedSorts = ["newest", "price_low", "price_high"];

  sortSelect.value = allowedSorts.includes(requestedSort)
    ? requestedSort
    : "newest";

  const requestedPage = Number(parameters.get("page") ?? 1);

  currentPage =
    Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
}

function createPaginationButton(label, page, options = {}) {
  const button = document.createElement("button");

  button.type = "button";
  button.className = "pagination-button";

  button.textContent = label;
  button.disabled = options.disabled ?? false;

  if (options.active) {
    button.classList.add("active");
    button.setAttribute("aria-current", "page");
  }

  button.addEventListener("click", () => {
    if (button.disabled || currentPage === page) {
      return;
    }

    currentPage = page;
    loadProperties(true);
  });

  return button;
}

function renderPagination(pagination) {
  paginationContainer.innerHTML = "";

  const totalPages = Number(pagination.total_pages) || 0;

  const activePage = Number(pagination.current_page) || 1;

  if (totalPages <= 1) {
    paginationContainer.classList.add("hidden");

    return;
  }

  paginationContainer.appendChild(
    createPaginationButton("Previous", activePage - 1, {
      disabled: activePage <= 1,
    }),
  );

  let startPage = Math.max(1, activePage - 2);

  let endPage = Math.min(totalPages, activePage + 2);

  if (activePage <= 3) {
    endPage = Math.min(5, totalPages);
  }

  if (activePage >= totalPages - 2) {
    startPage = Math.max(1, totalPages - 4);
  }

  for (let page = startPage; page <= endPage; page += 1) {
    paginationContainer.appendChild(
      createPaginationButton(String(page), page, {
        active: page === activePage,
      }),
    );
  }

  paginationContainer.appendChild(
    createPaginationButton("Next", activePage + 1, {
      disabled: activePage >= totalPages,
    }),
  );

  paginationContainer.classList.remove("hidden");
}

async function loadProperties(scrollToResults = false) {
  if (currentRequest) {
    currentRequest.abort();
  }

  currentRequest = new AbortController();

  showLoadingCards();

  applyFilterButton.disabled = true;

  const buttonText = applyFilterButton.querySelector("span");

  if (buttonText) {
    buttonText.textContent = "Loading...";
  }

  try {
    const parameters = getFilterParameters();

    updatePageUrl(parameters);

    const response = await fetch(`${LISTINGS_API}?${parameters.toString()}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: currentRequest.signal,
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to load properties.");
    }

    const listings = result.data?.listings ?? [];

    const total = Number(result.data?.total) || 0;

    const pagination = result.data?.pagination ?? {
      current_page: 1,
      total_pages: 1,
    };

    propertiesGrid.innerHTML = "";
    propertiesMessage.classList.add("hidden");

    propertiesTotal.textContent =
      total === 1
        ? "1 verified property found"
        : `${total} verified properties found`;

    if (!Array.isArray(listings) || listings.length === 0) {
      showPropertiesMessage(
        "No properties found",
        "Try changing or resetting your filters.",
        "fa-solid fa-house-circle-xmark",
      );

      return;
    }

    listings.forEach((listing) => {
      propertiesGrid.appendChild(createPropertyCard(listing));
    });

    renderPagination(pagination);

    if (scrollToResults) {
      document.querySelector(".properties-toolbar")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    console.error(error);

    propertiesTotal.textContent = "Unable to load properties";

    showPropertiesMessage(
      "Something went wrong",
      error.message || "Unable to load rental properties.",
      "fa-solid fa-triangle-exclamation",
    );
  } finally {
    applyFilterButton.disabled = false;

    const buttonText = applyFilterButton.querySelector("span");

    if (buttonText) {
      buttonText.textContent = "Apply Filters";
    }

    currentRequest = null;
  }
}

filterForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const minPrice = Number(minPriceInput.value || 0);

  const maxPrice = Number(maxPriceInput.value || 0);

  if (minPriceInput.value && maxPriceInput.value && minPrice > maxPrice) {
    alert("Minimum price cannot be greater than maximum price.");

    return;
  }

  currentPage = 1;
  loadProperties(true);
});

sortSelect.addEventListener("change", () => {
  currentPage = 1;
  loadProperties(true);
});

resetFilterButton.addEventListener("click", () => {
  filterForm.reset();
  sortSelect.value = "newest";
  currentPage = 1;
  activeLandlordId = "";

  loadProperties(true);
});

async function initializePropertiesPage() {
  await Promise.all([initializeCurrentUser(), loadRentalTypes()]);

  setFilterValuesFromUrl();

  if (currentUser?.role === "renter") {
    await loadFavoriteListingIds();
  }

  await loadProperties();
}

initializePropertiesPage();
