(() => {
  "use strict";

  if (window.SilipMuntiHomeInitialized) {
    return;
  }

  window.SilipMuntiHomeInitialized = true;

  const API_BASE = "/SilipMunti/backend";
  const FRONTEND_BASE = "/SilipMunti/frontend";

  const endpoints = {
    listings: `${API_BASE}/listings/get-all.php`,
    rentalTypes: `${API_BASE}/rental-types/get-all.php`,
    verifiedLandlords: `${API_BASE}/landlord/get-verified.php?limit=4`,
    addFavorite: `${API_BASE}/renter/add-favorite.php`,
    getFavorites: `${API_BASE}/renter/get-favorites.php`,
    removeFavorite: `${API_BASE}/renter/remove-favorite.php`,
    reviews: `${API_BASE}/reviews/get-all.php`,
  };

  const propertySearchForm = document.querySelector("#property-search-form");
  const propertyTypeSelect = document.querySelector("#search-type");
  const featuredListings = document.querySelector("#featured-listings");
  const featuredMessage = document.querySelector("#featured-listings-message");
  const newlyAddedListings = document.querySelector("#newly-added-listings");
  const newlyAddedMessage = document.querySelector("#newly-added-message");
  const popularLocations = document.querySelector("#popular-locations");
  const verifiedLandlords = document.querySelector("#verified-landlords");
  const reviewCarousel = document.querySelector("#review-carousel");
  const newlyPreviousButton = document.querySelector("#newly-prev");
  const newlyNextButton = document.querySelector("#newly-next");

  const favoriteListingIds = new Set();
  let currentUser = null;
  let allListings = [];
  let newlyAddedIndex = 0;
  let activeLocation = "";
  let reviews = [];
  let verifiedLandlordList = [];

  const barangays = [
    "Alabang",
    "Ayala Alabang",
    "Bayanan",
    "Buli",
    "Cupang",
    "Poblacion",
    "Putatan",
    "Sucat",
    "Tunasan",
  ];

  // Fallback images used for location cards whose barangay has no listings yet.
  // Add more paths here if you have additional generic/stock property photos —
  // they will cycle across the empty cards.
  const placeholderLocationImages = [
    `${FRONTEND_BASE}/assets/images/property-placeholder.svg`,
  ];

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
      maximumFractionDigits: 0,
    }).format(Number(price) || 0);
  }

  function formatMemberSince(value) {
    if (!value) return "Recently joined";
    const date = new Date(String(value).replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return "Recently joined";

    return new Intl.DateTimeFormat("en-PH", {
      month: "short",
      year: "numeric",
    }).format(date);
  }

  function parseListData(value) {
    if (Array.isArray(value)) return value;
    if (typeof value !== "string" || value.trim() === "") return [];

    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  function getListingImage(listing) {
    return (
      listing.primary_image ||
      listing.image_url ||
      listing.images?.[0]?.image_url ||
      `${FRONTEND_BASE}/assets/images/property-placeholder.svg`
    );
  }

  function getProfilePictureUrl(profilePicture) {
    if (!profilePicture) {
      return `${FRONTEND_BASE}/assets/images/default-profile.svg`;
    }

    if (
      /^https?:\/\//i.test(profilePicture) ||
      String(profilePicture).startsWith("/")
    ) {
      return profilePicture;
    }

    return `${API_BASE}/${String(profilePicture).replace(/^\/+/, "")}`;
  }

  function getListingDate(listing) {
    const value = listing.created_at || listing.updated_at || "";
    const date = new Date(String(value).replace(" ", "T"));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function isWithinSevenDays(listing) {
    const date = getListingDate(listing);
    if (!date) return false;

    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    return Date.now() - date.getTime() <= sevenDays;
  }

  function getDayKey() {
    const date = new Date();
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }

  function seededShuffle(items, seedText) {
    const list = [...items];
    let seed = 0;

    for (let index = 0; index < seedText.length; index += 1) {
      seed = (seed * 31 + seedText.charCodeAt(index)) >>> 0;
    }

    for (let index = list.length - 1; index > 0; index -= 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const randomIndex = seed % (index + 1);
      [list[index], list[randomIndex]] = [list[randomIndex], list[index]];
    }

    return list;
  }

  async function initializeCurrentUser() {
    try {
      currentUser = await window.SilipMuntiSession?.getCurrentUser?.();
    } catch (error) {
      currentUser = null;
    }

    await window.SilipMuntiSiteNavbar?.initialize?.();
  }

  async function loadFavoriteListingIds() {
    favoriteListingIds.clear();

    if (!currentUser || currentUser.role !== "renter") return;

    try {
      const response = await fetch(endpoints.getFavorites, {
        credentials: "include",
        cache: "no-store",
      });
      const result = await response.json();
      const favorites = result.data?.favorites ?? [];

      if (response.ok && result.success && Array.isArray(favorites)) {
        favorites.forEach((favorite) => {
          favoriteListingIds.add(Number(favorite.listing_id));
        });
      }
    } catch (error) {
      console.info("Favorites are unavailable.");
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
      await window.SilipModal.warning({
        title: "Renter account required",
        message: "Only renter accounts can save properties.",
      });
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
        isFavorite ? endpoints.removeFavorite : endpoints.addFavorite,
        {
          method: isFavorite ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ listing_id: normalizedListingId }),
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
      await window.SilipModal.error({
        title: "Favorite not updated",
        message: error.message || "Unable to update favorite.",
      });
    } finally {
      button.disabled = false;
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

    const detailsUrl = `${FRONTEND_BASE}/pages/properties/details.html?id=${encodeURIComponent(listing.id)}`;

    const imageWrapper = document.createElement("div");
    imageWrapper.className = "property-image-wrapper";

    const image = document.createElement("img");
    image.className = "property-image";
    image.src = getListingImage(listing);
    image.alt = listing.title || "Rental property";
    image.loading = "lazy";

    image.addEventListener("error", () => {
      image.src = `${FRONTEND_BASE}/assets/images/property-placeholder.svg`;
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

    const content = document.createElement("div");
    content.className = "property-card-content";

    const price = document.createElement("p");
    price.className = "property-price";
    price.innerHTML = `${formatPrice(listing.price)} <span>/ month</span>`;

    const titleLink = document.createElement("a");
    titleLink.className = "property-card-link";
    titleLink.href = detailsUrl;

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

    if (
      listing.occupancy_limit !== null &&
      listing.occupancy_limit !== undefined
    ) {
      information.appendChild(
        createInformationItem(
          "fa-solid fa-users",
          `Up to ${listing.occupancy_limit}`,
        ),
      );
    }

    if (listing.listing_size !== null && listing.listing_size !== undefined) {
      information.appendChild(
        createInformationItem(
          "fa-solid fa-ruler-combined",
          `${listing.listing_size} m²`,
        ),
      );
    }

    const description = document.createElement("p");
    description.className = "property-description";
    description.textContent =
      listing.description || "No description available.";

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

    imageWrapper.append(image, typeBadge, favoriteButton);

    article.append(imageWrapper, content);

    return article;
  }

  function renderMessage(
    element,
    message,
    icon = "fa-solid fa-house-circle-xmark",
  ) {
    if (!element) return;

    element.innerHTML = `<i class="${icon}"></i><span>${escapeHtml(message)}</span>`;
    element.classList.remove("hidden");
  }

  function clearMessage(element) {
    if (!element) return;
    element.textContent = "";
    element.classList.add("hidden");
  }

  function getUniqueListings(listings) {
    const uniqueListings = new Map();

    listings.forEach((listing) => {
      const key = [
        listing?.title,
        listing?.address,
        listing?.barangay,
        listing?.price,
      ]
        .filter(Boolean)
        .join("|")
        .toLowerCase();

      if (key && !uniqueListings.has(key)) {
        uniqueListings.set(key, listing);
      }
    });

    return [...uniqueListings.values()];
  }

  function renderPropertyGrid(container, messageElement, listings) {
    if (!container) return;

    container.innerHTML = "";

    const uniqueListings = Array.isArray(listings)
      ? getUniqueListings(listings)
      : [];

    if (uniqueListings.length === 0) {
      renderMessage(messageElement, "No verified rentals to show yet.");
      return;
    }

    clearMessage(messageElement);
    uniqueListings.slice(0, 4).forEach((listing) => {
      container.appendChild(createPropertyCard(listing));
    });
  }

  function renderFeaturedListings() {
    const shuffled = seededShuffle(allListings, getDayKey());
    renderPropertyGrid(featuredListings, featuredMessage, shuffled);
  }

  function renderNewlyAddedListings() {
    const freshListings = allListings
      .filter(isWithinSevenDays)
      .sort(
        (a, b) =>
          (getListingDate(b)?.getTime() || 0) -
          (getListingDate(a)?.getTime() || 0),
      );

    if (freshListings.length === 0) {
      renderPropertyGrid(
        newlyAddedListings,
        newlyAddedMessage,
        [...allListings].sort(
          (a, b) =>
            (getListingDate(b)?.getTime() || 0) -
            (getListingDate(a)?.getTime() || 0),
        ),
      );
      return;
    }

    const visibleListings = freshListings.slice(
      newlyAddedIndex,
      newlyAddedIndex + 4,
    );

    renderPropertyGrid(newlyAddedListings, newlyAddedMessage, visibleListings);
  }

  function buildLocationCardElement(barangay, listings, placeholderIndex) {
    const sample = listings[0] || null;
    const count = listings.length;
    const hasListings = count > 0;

    // Use a real listing photo when available; otherwise fall back to a
    // cycling placeholder image so every card always shows a background photo.
    const image = sample
      ? getListingImage(sample)
      : placeholderLocationImages[
          placeholderIndex % placeholderLocationImages.length
        ];

    const description = sample?.description
      ? sample.description
      : "No available rentals yet in this area.";
    const countText = hasListings
      ? `${count} available`
      : "No available rentals yet";
    const href = `${FRONTEND_BASE}/pages/properties/index.html?barangay=${encodeURIComponent(barangay)}`;

    const anchor = document.createElement("a");
    anchor.className = hasListings ? "location-card" : "location-card empty";
    anchor.href = href;
    anchor.dataset.locationCard = barangay;
    anchor.setAttribute(
      "style",
      `background-image: linear-gradient(rgba(0, 0, 0, .22), rgba(0, 0, 0, .68)), url('${image}')`,
    );
    anchor.setAttribute("aria-label", `${barangay} rentals`);

    const copy = document.createElement("div");
    copy.className = "location-card-copy";

    const span = document.createElement("span");
    span.textContent = barangay;

    const small = document.createElement("small");
    small.dataset.count = countText;
    small.dataset.description = description;
    small.textContent = countText;

    copy.append(span, small);

    const icon = document.createElement("i");
    icon.className = "fa-solid fa-plus";

    anchor.append(copy, icon);

    return anchor;
  }

  function setActiveLocationCard(barangay, { scroll = true } = {}) {
    if (!popularLocations) return;

    const cards = popularLocations.querySelectorAll("[data-location-card]");

    cards.forEach((card) => {
      const isActive = card.dataset.locationCard === barangay;

      card.classList.toggle("active", isActive);

      const icon = card.querySelector("i");
      icon?.classList.toggle("fa-plus", !isActive);
      icon?.classList.toggle("fa-xmark", isActive);

      const small = card.querySelector("small");
      if (small) {
        small.textContent = isActive
          ? small.dataset.description
          : small.dataset.count;
      }
    });

    activeLocation = barangay;

    if (scroll) {
      popularLocations
        .querySelector(`[data-location-card="${CSS.escape(barangay)}"]`)
        ?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
    }
  }

  function renderPopularLocations() {
    if (!popularLocations) return;

    const listingsByBarangay = new Map();

    barangays.forEach((barangay) => {
      listingsByBarangay.set(barangay, []);
    });

    allListings.forEach((listing) => {
      const barangay = listing.barangay || "Muntinlupa";
      const listings = listingsByBarangay.get(barangay) || [];
      listings.push(listing);
      listingsByBarangay.set(barangay, listings);
    });

    const sortedBarangays = barangays
      .map((barangay) => ({
        barangay,
        listings: listingsByBarangay.get(barangay) || [],
      }))
      .sort((a, b) => b.listings.length - a.listings.length);

    const firstAvailableLocation = sortedBarangays.find(
      (item) => item.listings.length > 0,
    )?.barangay;

    if (!activeLocation || !listingsByBarangay.get(activeLocation)?.length) {
      activeLocation =
        firstAvailableLocation || sortedBarangays[0]?.barangay || "";
    }

    // Built once from scratch here (e.g. on initial load or when listings
    // data changes). Switching the active card afterwards happens through
    // setActiveLocationCard(), which only toggles classes on these same
    // elements instead of re-creating them — that's what lets the CSS
    // transitions actually animate.
    popularLocations.innerHTML = "";

    sortedBarangays.forEach(({ barangay, listings }, index) => {
      popularLocations.appendChild(
        buildLocationCardElement(barangay, listings, index),
      );
    });

    setActiveLocationCard(activeLocation, { scroll: false });
  }

  function renderVerifiedLandlords() {
    if (!verifiedLandlords) return;

    if (verifiedLandlordList.length === 0) {
      verifiedLandlords.innerHTML = `
        <div class="landlord-empty-state">
          <i class="fa-solid fa-user-shield" aria-hidden="true"></i>
          <strong>No verified landlords to display yet</strong>
          <span>Approved property owners will appear here.</span>
        </div>
      `;
      return;
    }

    verifiedLandlords.innerHTML = verifiedLandlordList
      .map((landlord) => {
        const activeCount = Number(landlord.active_listing_count) || 0;
        const rating = Number(landlord.average_rating) || 0;
        const reviewCount = Number(landlord.total_reviews) || 0;
        const listingLabel = activeCount === 1 ? "property" : "properties";
        const availableAreas = landlord.available_areas
          ? landlord.available_areas
          : "No available location yet";
        const isFullyVerified =
          landlord.verification_level === "fully_verified";
        const verificationLabel = isFullyVerified
          ? "Fully verified"
          : "Verified";
        const verificationIcon = isFullyVerified
          ? "fa-shield-halved"
          : "fa-circle-check";
        const ratingDisplay = reviewCount > 0 ? rating.toFixed(1) : "—";
        const memberSince = formatMemberSince(landlord.member_since);
        const profileUrl = `${FRONTEND_BASE}/pages/landlord/details.html?id=${encodeURIComponent(landlord.id)}`;

        return `
        <a
          class="home-landlord-card"
          href="${profileUrl}"
          aria-label="View ${escapeHtml(landlord.name)}'s verified landlord profile"
        >
          <div class="home-landlord-photo">
            <span class="home-landlord-monogram" aria-hidden="true">
              ${escapeHtml(
                String(landlord.name || "L")
                  .trim()
                  .charAt(0)
                  .toUpperCase(),
              )}
            </span>
            <img
              src="${escapeHtml(getProfilePictureUrl(landlord.profile_picture_url))}"
              alt=""
              loading="lazy"
            >
          </div>
          <div class="home-landlord-info">
            <div class="home-landlord-name-row">
              <strong>${escapeHtml(landlord.name || "Verified Landlord")}</strong>
              <span
                class="home-landlord-badge${isFullyVerified ? " is-fully-verified" : ""}"
                title="${verificationLabel} landlord"
                aria-label="${verificationLabel} landlord"
              >
                <i class="fa-solid ${verificationIcon}" aria-hidden="true"></i>
              </span>
            </div>
            <div class="home-landlord-details">
              <span>
                <i class="fa-solid fa-location-dot" aria-hidden="true"></i>
                ${escapeHtml(availableAreas)}
              </span>
              <span>
                <i class="fa-solid fa-calendar" aria-hidden="true"></i>
                Member since ${escapeHtml(memberSince)}
              </span>
            </div>
            <div class="home-landlord-stats">
              <span>
                <strong><i class="fa-solid fa-star" aria-hidden="true"></i>${ratingDisplay}</strong>
                <small>Rating</small>
              </span>
              <span>
                <strong><i class="fa-solid fa-building" aria-hidden="true"></i>${activeCount}</strong>
                <small>${listingLabel}</small>
              </span>
              <span>
                <strong><i class="fa-solid fa-comment-dots" aria-hidden="true"></i>${reviewCount}</strong>
                <small>${reviewCount === 1 ? "Review" : "Reviews"}</small>
              </span>
            </div>
            <div class="home-landlord-actions">
              <span class="home-landlord-link">
                View profile
                <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
              </span>
            </div>
          </div>
        </a>
      `;
      })
      .join("");

    verifiedLandlords
      .querySelectorAll(".home-landlord-photo img")
      .forEach((image) => {
        const useFallback = () => {
          const fallback = `${FRONTEND_BASE}/assets/images/default-profile.svg`;
          if (image.src.endsWith("/assets/images/default-profile.svg")) return;
          image.src = fallback;
        };

        image.addEventListener("error", useFallback, { once: true });

        if (image.complete && image.naturalWidth === 0) {
          useFallback();
        }
      });
  }

  function renderReviewCard(review) {
    const renterName =
      review.renter_name || review.user_name || "SilipMunti Renter";

    return `
      <article class="review-card">
        <div class="review-top">
          <span>Rating <strong>${escapeHtml(review.rating || 5)}</strong></span>
          <i class="fa-solid fa-quote-right" aria-hidden="true"></i>
        </div>
        <p>${escapeHtml(review.comment || "Great rental experience.")}</p>
        <div class="review-author">
          <span>${escapeHtml(String(renterName).charAt(0))}</span>
          <strong>${escapeHtml(renterName)}</strong>
        </div>
      </article>
    `;
  }

  function buildReviewSet(reviewList, isDuplicate = false) {
    return `
      <div class="review-set"${isDuplicate ? ' aria-hidden="true"' : ""}>
        ${reviewList.map(renderReviewCard).join("")}
      </div>
    `;
  }

  function getLoopingReviews() {
    const sourceReviews = reviews;

    if (!sourceReviews.length) return [];

    const loopingReviews = [...sourceReviews];

    while (loopingReviews.length < 6) {
      loopingReviews.push(...sourceReviews);
    }

    return loopingReviews.slice(0, Math.max(6, sourceReviews.length));
  }

  function renderReviews() {
    if (!reviewCarousel) return;

    if (!reviews.length) {
      reviewCarousel.innerHTML = `
        <div class="review-empty">
          <i class="fa-regular fa-comments" aria-hidden="true"></i>
          <strong>No renter reviews yet</strong>
          <span>Verified renter experiences will appear here.</span>
        </div>
      `;
      return;
    }

    const firstRowReviews = getLoopingReviews();
    const splitIndex = Math.ceil(firstRowReviews.length / 2);
    const secondRowReviews = [
      ...firstRowReviews.slice(splitIndex),
      ...firstRowReviews.slice(0, splitIndex),
    ];

    reviewCarousel.innerHTML = `
      <div class="review-row">
        <div class="review-track review-track-left">
          ${buildReviewSet(firstRowReviews)}
          ${buildReviewSet(firstRowReviews, true)}
        </div>
      </div>
      <div class="review-row">
        <div class="review-track review-track-right">
          ${buildReviewSet(secondRowReviews)}
          ${buildReviewSet(secondRowReviews, true)}
        </div>
      </div>
    `;
  }

  async function loadRentalTypes() {
    if (!propertyTypeSelect) return;

    propertyTypeSelect.disabled = true;
    propertyTypeSelect.innerHTML =
      '<option value="">Loading property types...</option>';

    try {
      const response = await fetch(endpoints.rentalTypes, {
        credentials: "include",
        cache: "no-store",
      });
      const result = await response.json();
      const rentalTypes =
        result.data?.rental_types ?? result.data?.types ?? result.data ?? [];

      if (!response.ok || !result.success || !Array.isArray(rentalTypes)) {
        throw new Error(result.message || "Unable to load property types.");
      }

      propertyTypeSelect.innerHTML =
        '<option value="">All property types</option>';
      rentalTypes.forEach((type) => {
        const name = type.name || type.rental_type_name || type.type_name;
        if (!type.id || !name) return;

        const option = document.createElement("option");
        option.value = type.id;
        option.textContent = name;
        propertyTypeSelect.appendChild(option);
      });
    } catch (error) {
      propertyTypeSelect.innerHTML =
        '<option value="">All property types</option>';
    } finally {
      propertyTypeSelect.disabled = false;
    }
  }

  async function loadListings() {
    try {
      const response = await fetch(endpoints.listings, {
        credentials: "include",
        cache: "no-store",
      });
      const result = await response.json();
      const listings = result.data?.listings ?? result.data ?? [];

      if (!response.ok || !result.success || !Array.isArray(listings)) {
        throw new Error(result.message || "Unable to load listings.");
      }

      allListings = getUniqueListings(listings);
    } catch (error) {
      allListings = [];
      renderMessage(
        featuredMessage,
        "Unable to load rental properties.",
        "fa-solid fa-triangle-exclamation",
      );
      renderMessage(
        newlyAddedMessage,
        "Unable to load newly added units.",
        "fa-solid fa-triangle-exclamation",
      );
    }
  }

  async function loadReviews() {
    reviews = [];

    try {
      const response = await fetch(endpoints.reviews, {
        credentials: "include",
        cache: "no-store",
      });
      const result = await response.json();
      const fetchedReviews =
        result.data?.reviews ?? result.reviews ?? result.data ?? [];

      if (!response.ok || result.success === false) {
        throw new Error(result.message || "Unable to load renter reviews.");
      }

      if (!Array.isArray(fetchedReviews)) {
        throw new Error("Invalid reviews response format.");
      }

      reviews = fetchedReviews.filter(
        (review) => review && review.rating && review.comment,
      );
    } catch (error) {
      reviews = [];
      console.error("Unable to load homepage reviews:", error);
    }
  }

  async function loadVerifiedLandlords() {
    verifiedLandlordList = [];

    try {
      const response = await fetch(endpoints.verifiedLandlords, {
        credentials: "include",
        cache: "no-store",
      });
      const result = await response.json();
      const landlords = result.data?.verified_landlords ?? [];

      if (!response.ok || !result.success || !Array.isArray(landlords)) {
        throw new Error(result.message || "Unable to load verified landlords.");
      }

      verifiedLandlordList = landlords;
    } catch (error) {
      verifiedLandlordList = [];
      console.error("Unable to load verified landlords:", error);
    }
  }

  function bindEvents() {
    propertySearchForm?.addEventListener("submit", (event) => {
      event.preventDefault();

      const formData = new FormData(propertySearchForm);
      const params = new URLSearchParams();

      if (formData.get("barangay"))
        params.set("barangay", formData.get("barangay"));
      if (formData.get("rental_type_id"))
        params.set("rental_type_id", formData.get("rental_type_id"));
      if (formData.get("max_price"))
        params.set("max_price", formData.get("max_price"));

      window.location.href = `${FRONTEND_BASE}/pages/properties/index.html?${params.toString()}`;
    });

    newlyPreviousButton?.addEventListener("click", () => {
      const freshCount = Math.max(
        1,
        allListings.filter(isWithinSevenDays).length || allListings.length,
      );
      newlyAddedIndex = (newlyAddedIndex - 1 + freshCount) % freshCount;
      renderNewlyAddedListings();
    });

    newlyNextButton?.addEventListener("click", () => {
      const freshCount = Math.max(
        1,
        allListings.filter(isWithinSevenDays).length || allListings.length,
      );
      newlyAddedIndex = (newlyAddedIndex + 1) % freshCount;
      renderNewlyAddedListings();
    });

    popularLocations?.addEventListener("click", (event) => {
      const card = event.target.closest("[data-location-card]");
      if (!card) return;

      const selectedLocation = card.dataset.locationCard;

      if (selectedLocation && selectedLocation !== activeLocation) {
        event.preventDefault();
        setActiveLocationCard(selectedLocation);
      }
    });
  }

  async function initializeHomepage() {
    bindEvents();
    await initializeCurrentUser();
    await Promise.all([
      loadRentalTypes(),
      loadListings(),
      loadReviews(),
      loadVerifiedLandlords(),
    ]);

    if (currentUser?.role === "renter") {
      await loadFavoriteListingIds();
    }

    renderNewlyAddedListings();
    renderFeaturedListings();
    renderPopularLocations();
    renderVerifiedLandlords();
    renderReviews();
  }

  initializeHomepage();
})();
