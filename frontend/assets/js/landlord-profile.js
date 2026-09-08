(() => {
  "use strict";

  const API_ROOT = "/SilipMunti/backend";
  const FRONTEND_ROOT = "/SilipMunti/frontend";
  const DEFAULT_PROFILE = `${FRONTEND_ROOT}/assets/images/default-profile.svg`;
  const PROPERTY_PLACEHOLDER = `${FRONTEND_ROOT}/assets/images/property-placeholder.svg`;

  const profileCard = document.querySelector("#landlord-profile-card");
  const profileMessage = document.querySelector("#landlord-profile-message");
  const listingsGrid = document.querySelector("#landlord-listings-grid");
  const listingsMessage = document.querySelector("#landlord-listings-message");
  const listingsSummary = document.querySelector("#landlord-listings-summary");
  const ratingSummaryElement = document.querySelector(
    "#landlord-rating-summary",
  );
  const reviewList = document.querySelector("#landlord-review-list");
  const reviewsTabCount = document.querySelector("#reviews-tab-count");
  const aboutListingCount = document.querySelector("#about-listing-count");
  const aboutLocations = document.querySelector("#about-locations");
  const aboutMemberSince = document.querySelector("#about-member-since");
  const tabButtons = document.querySelectorAll("[data-profile-tab]");
  const tabPanels = document.querySelectorAll("[data-profile-panel]");

  function getLandlordId() {
    const value = new URLSearchParams(window.location.search).get("id") || "";
    return /^\d+$/.test(value) && Number(value) > 0 ? value : "";
  }

  function getProfileUrl(value) {
    if (!value) return DEFAULT_PROFILE;
    if (/^https?:\/\//i.test(value) || String(value).startsWith("/")) {
      return value;
    }
    return `${API_ROOT}/${String(value).replace(/^\/+/, "")}`;
  }

  function formatPrice(value) {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(Number(value) || 0);
  }

  function formatDate(value, options = {}) {
    if (!value) return "";
    const date = new Date(String(value).replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat("en-PH", {
      month: "long",
      year: "numeric",
      ...options,
    }).format(date);
  }

  function activateTab(tabName, shouldScroll = false) {
    tabButtons.forEach((button) => {
      const isActive = button.dataset.profileTab === tabName;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });

    tabPanels.forEach((panel) => {
      const isActive = panel.dataset.profilePanel === tabName;
      panel.classList.toggle("active", isActive);
      panel.hidden = !isActive;
    });

    if (shouldScroll) {
      document.querySelector(".landlord-profile-tabs")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }

  async function getJson(url) {
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.success) {
      throw new Error(result?.message || "Unable to load this page.");
    }

    return result;
  }

  function showProfileMessage(message) {
    profileCard.classList.add("hidden");
    profileMessage.innerHTML = "";

    const icon = document.createElement("i");
    icon.className = "fa-solid fa-circle-exclamation";

    const title = document.createElement("strong");
    title.textContent = "Landlord profile unavailable";

    const text = document.createElement("span");
    text.textContent = message;

    profileMessage.append(icon, title, text);
    profileMessage.classList.remove("hidden");
  }

  function renderProfile(landlord, ratingSummary = {}) {
    const count = Number(landlord.active_listing_count) || 0;
    const label = count === 1 ? "available property" : "available properties";
    const totalReviews = Number(ratingSummary.total_reviews) || 0;
    const averageRating = Number(ratingSummary.average_rating) || 0;
    const isFullyVerified = landlord.verification_level === "fully_verified";

    profileCard.innerHTML = "";

    const image = document.createElement("img");
    image.className = "landlord-profile-photo";
    image.src = getProfileUrl(landlord.profile_picture_url);
    image.alt = landlord.name || "Verified landlord";
    image.addEventListener(
      "error",
      () => {
        image.src = DEFAULT_PROFILE;
      },
      { once: true },
    );

    const content = document.createElement("div");
    content.className = "landlord-profile-content";

    const badge = document.createElement("span");
    badge.className = `landlord-verified-badge${isFullyVerified ? " fully-verified" : ""}`;
    badge.innerHTML = isFullyVerified
      ? '<i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Fully verified landlord'
      : '<i class="fa-solid fa-circle-check" aria-hidden="true"></i> Verified landlord';

    const name = document.createElement("h1");
    name.textContent = landlord.name || "Verified Landlord";

    const description = document.createElement("p");
    description.textContent = isFullyVerified
      ? "This property owner is admin-approved and has all three required documents verified by SilipMunti."
      : "This property owner has been reviewed and approved by the SilipMunti administrator.";

    const stats = document.createElement("div");
    stats.className = "landlord-profile-stats";

    const listingStat = document.createElement("div");
    listingStat.innerHTML =
      '<i class="fa-solid fa-building" aria-hidden="true"></i>';
    const listingText = document.createElement("span");
    listingText.textContent = `${count} ${label}`;
    listingStat.appendChild(listingText);

    const areaStat = document.createElement("div");
    areaStat.innerHTML =
      '<i class="fa-solid fa-location-dot" aria-hidden="true"></i>';
    const areaText = document.createElement("span");
    areaText.textContent = landlord.available_areas
      ? `Properties in ${landlord.available_areas}`
      : "No available property locations right now";
    areaStat.appendChild(areaText);

    stats.append(listingStat, areaStat);

    if (totalReviews > 0) {
      const ratingStat = document.createElement("div");
      ratingStat.innerHTML =
        '<i class="fa-solid fa-star" aria-hidden="true"></i>';
      const ratingText = document.createElement("span");
      ratingText.textContent = `${averageRating.toFixed(1)} rating · ${totalReviews} review${totalReviews === 1 ? "" : "s"}`;
      ratingStat.appendChild(ratingText);
      stats.appendChild(ratingStat);
    }

    const actions = document.createElement("div");
    actions.className = "landlord-profile-actions";

    const viewPropertiesButton = document.createElement("button");
    viewPropertiesButton.type = "button";
    viewPropertiesButton.className = "landlord-primary-action";
    viewPropertiesButton.innerHTML =
      '<i class="fa-solid fa-building" aria-hidden="true"></i> View properties';
    viewPropertiesButton.addEventListener("click", () => {
      activateTab("properties", true);
    });

    const shareButton = document.createElement("button");
    shareButton.type = "button";
    shareButton.className = "landlord-secondary-action";
    shareButton.innerHTML =
      '<i class="fa-solid fa-share-nodes" aria-hidden="true"></i> Share profile';
    shareButton.addEventListener("click", async () => {
      const shareData = {
        title: `${landlord.name || "Verified Landlord"} | SilipMunti`,
        text: `View ${landlord.name || "this landlord"}'s verified rentals on SilipMunti.`,
        url: window.location.href,
      };

      try {
        if (navigator.share) {
          await navigator.share(shareData);
        } else {
          await navigator.clipboard.writeText(window.location.href);
          shareButton.innerHTML =
            '<i class="fa-solid fa-check" aria-hidden="true"></i> Link copied';
          window.setTimeout(() => {
            shareButton.innerHTML =
              '<i class="fa-solid fa-share-nodes" aria-hidden="true"></i> Share profile';
          }, 1800);
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Unable to share profile:", error);
        }
      }
    });

    actions.append(viewPropertiesButton, shareButton);
    content.append(badge, name, description, stats, actions);
    profileCard.append(image, content);

    document.title = `${landlord.name || "Verified Landlord"} | SilipMunti`;
  }

  function renderAbout(landlord) {
    const count = Number(landlord.active_listing_count) || 0;
    aboutListingCount.textContent = `${count} available ${count === 1 ? "property" : "properties"}`;
    aboutLocations.textContent = landlord.available_areas
      ? landlord.available_areas
      : "No available locations right now.";

    const memberSince = formatDate(landlord.member_since);
    aboutMemberSince.textContent = memberSince
      ? `Member since ${memberSince}`
      : "Membership date unavailable.";
  }

  function createStars(rating) {
    const stars = document.createElement("span");
    stars.className = "landlord-review-stars";
    stars.setAttribute("aria-label", `${rating} out of 5 stars`);

    for (let index = 1; index <= 5; index += 1) {
      const star = document.createElement("i");
      star.className =
        index <= rating ? "fa-solid fa-star" : "fa-regular fa-star";
      star.setAttribute("aria-hidden", "true");
      stars.appendChild(star);
    }

    return stars;
  }

  function renderReviews(ratingSummary = {}, reviews = []) {
    const totalReviews = Number(ratingSummary.total_reviews) || 0;
    const averageRating = Number(ratingSummary.average_rating) || 0;
    reviewsTabCount.textContent = String(totalReviews);
    ratingSummaryElement.innerHTML = "";
    reviewList.innerHTML = "";

    const score = document.createElement("strong");
    score.textContent = totalReviews > 0 ? averageRating.toFixed(1) : "—";

    const summaryContent = document.createElement("div");
    summaryContent.appendChild(createStars(Math.round(averageRating)));

    const summaryText = document.createElement("span");
    summaryText.textContent =
      totalReviews === 1
        ? "Based on 1 published property review"
        : `Based on ${totalReviews} published property reviews`;
    summaryContent.appendChild(summaryText);
    ratingSummaryElement.append(score, summaryContent);

    if (!Array.isArray(reviews) || reviews.length === 0) {
      const emptyState = document.createElement("div");
      emptyState.className = "landlord-review-empty";
      emptyState.innerHTML = `
        <i class="fa-regular fa-star" aria-hidden="true"></i>
        <strong>No property reviews yet</strong>
        <span>Published renter reviews will appear here.</span>
      `;
      reviewList.appendChild(emptyState);
      return;
    }

    reviews.forEach((review) => {
      const article = document.createElement("article");
      article.className = "landlord-review-card";

      const header = document.createElement("div");
      header.className = "landlord-review-header";

      const avatar = document.createElement("img");
      avatar.src = getProfileUrl(review.profile_picture_url);
      avatar.alt = review.renter_name || "Renter";
      avatar.loading = "lazy";
      avatar.addEventListener(
        "error",
        () => {
          avatar.src = DEFAULT_PROFILE;
        },
        { once: true },
      );

      const reviewer = document.createElement("div");
      const reviewerName = document.createElement("strong");
      reviewerName.textContent = review.renter_name || "SilipMunti Renter";
      const reviewDate = document.createElement("span");
      reviewDate.textContent = formatDate(review.created_at, {
        day: "numeric",
      });
      reviewer.append(reviewerName, reviewDate);
      header.append(avatar, reviewer, createStars(Number(review.rating) || 0));

      const comment = document.createElement("p");
      comment.textContent = review.comment || "No comment provided.";

      const listingLink = document.createElement("a");
      listingLink.href = `${FRONTEND_ROOT}/pages/properties/details.html?id=${encodeURIComponent(review.listing_id)}`;
      listingLink.innerHTML =
        '<i class="fa-solid fa-building" aria-hidden="true"></i>';
      const listingTitle = document.createElement("span");
      listingTitle.textContent =
        review.listing_title || "View reviewed property";
      listingLink.appendChild(listingTitle);

      article.append(header, comment, listingLink);
      reviewList.appendChild(article);
    });
  }

  function createPropertyCard(listing) {
    const card = document.createElement("a");
    card.className = "public-property-card";
    card.href = `${FRONTEND_ROOT}/pages/properties/details.html?id=${encodeURIComponent(listing.id)}`;

    const imageWrap = document.createElement("div");
    imageWrap.className = "public-property-image";

    const image = document.createElement("img");
    image.src = listing.primary_image || PROPERTY_PLACEHOLDER;
    image.alt = listing.title || "Rental property";
    image.loading = "lazy";
    image.addEventListener(
      "error",
      () => {
        image.src = PROPERTY_PLACEHOLDER;
      },
      { once: true },
    );

    const type = document.createElement("span");
    type.textContent = listing.rental_type || "Rental";
    imageWrap.append(image, type);

    const content = document.createElement("div");
    content.className = "public-property-content";

    const price = document.createElement("p");
    price.className = "public-property-price";
    price.textContent = `${formatPrice(listing.price)} / month`;

    const title = document.createElement("h3");
    title.textContent = listing.title || "Untitled property";

    const location = document.createElement("p");
    location.className = "public-property-location";
    location.innerHTML =
      '<i class="fa-solid fa-location-dot" aria-hidden="true"></i>';
    const locationText = document.createElement("span");
    locationText.textContent = [listing.barangay, listing.city]
      .filter(Boolean)
      .join(", ");
    location.appendChild(locationText);

    const details = document.createElement("div");
    details.className = "public-property-details";
    const bedrooms =
      Number(listing.bedroom_no) === 0
        ? "Studio"
        : `${Number(listing.bedroom_no) || 0} bedroom${Number(listing.bedroom_no) === 1 ? "" : "s"}`;
    details.innerHTML = `
      <span><i class="fa-solid fa-bed" aria-hidden="true"></i>${bedrooms}</span>
      <span><i class="fa-solid fa-users" aria-hidden="true"></i>Up to ${Number(listing.occupancy_limit) || 0}</span>
    `;

    const action = document.createElement("span");
    action.className = "public-property-action";
    action.innerHTML =
      'View property details <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>';

    content.append(price, title, location, details, action);
    card.append(imageWrap, content);
    return card;
  }

  function renderListings(listings, total) {
    listingsGrid.innerHTML = "";
    listingsMessage.classList.add("hidden");

    const count = Number(total) || 0;
    listingsSummary.textContent =
      count === 1
        ? "1 verified and currently available property."
        : `${count} verified and currently available properties.`;

    if (!Array.isArray(listings) || listings.length === 0) {
      listingsMessage.innerHTML = `
        <i class="fa-solid fa-house-circle-xmark" aria-hidden="true"></i>
        <strong>No available properties right now</strong>
        <span>This landlord's occupied or unavailable listings are not shown publicly.</span>
      `;
      listingsMessage.classList.remove("hidden");
      return;
    }

    listings.forEach((listing) => {
      listingsGrid.appendChild(createPropertyCard(listing));
    });
  }

  async function initialize() {
    const landlordId = getLandlordId();

    if (!landlordId) {
      showProfileMessage("The landlord link is invalid.");
      listingsSummary.textContent = "No properties to display.";
      return;
    }

    try {
      const [profileResult, listingsResult] = await Promise.all([
        getJson(
          `${API_ROOT}/landlord/get-one.php?id=${encodeURIComponent(landlordId)}`,
        ),
        getJson(
          `${API_ROOT}/listings/get-all.php?landlord_id=${encodeURIComponent(landlordId)}&limit=48`,
        ),
      ]);

      const landlord = profileResult.data.landlord;
      const ratingSummary = profileResult.data.rating_summary || {};
      const reviews = profileResult.data.reviews || [];

      renderProfile(landlord, ratingSummary);
      renderAbout(landlord);
      renderReviews(ratingSummary, reviews);
      renderListings(
        listingsResult.data?.listings || [],
        listingsResult.data?.total || 0,
      );
    } catch (error) {
      showProfileMessage(error.message || "Unable to load this landlord.");
      listingsSummary.textContent = "Unable to load verified properties.";
    }
  }

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activateTab(button.dataset.profileTab);
    });
  });

  initialize();
})();
