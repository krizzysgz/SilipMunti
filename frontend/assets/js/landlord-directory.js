(() => {
  "use strict";

  const API_ENDPOINT = "/SilipMunti/backend/landlord/get-verified.php";
  const FRONTEND_ROOT = "/SilipMunti/frontend";
  const DEFAULT_PROFILE = `${FRONTEND_ROOT}/assets/images/default-profile.svg`;
  const PAGE_LIMIT = 12;

  const filterForm = document.querySelector("#landlord-filter-form");
  const searchInput = document.querySelector("#landlord-search");
  const locationSelect = document.querySelector("#landlord-location");
  const sortSelect = document.querySelector("#landlord-sort");
  const resetButton = document.querySelector("#landlord-filter-reset");
  const grid = document.querySelector("#landlord-directory-grid");
  const message = document.querySelector("#landlord-directory-message");
  const summary = document.querySelector("#landlord-result-summary");
  const pagination = document.querySelector("#landlord-pagination");
  const landlordCount = document.querySelector("#directory-landlord-count");
  const listingCount = document.querySelector("#directory-listing-count");

  let currentPage = 1;
  let loading = false;

  function getProfileUrl(value) {
    if (!value) return DEFAULT_PROFILE;
    if (/^https?:\/\//i.test(value) || String(value).startsWith("/")) {
      return value;
    }
    return `/SilipMunti/backend/${String(value).replace(/^\/+/, "")}`;
  }

  function formatMemberSince(value) {
    if (!value) return "";
    const date = new Date(String(value).replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat("en-PH", {
      month: "short",
      year: "numeric",
    }).format(date);
  }

  function animateNumber(element, target) {
    if (!element) return;

    const finalValue = Math.max(0, Number(target) || 0);
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reduceMotion) {
      element.textContent = String(finalValue).padStart(2, "0");
      return;
    }

    const duration = 700;
    const startTime = performance.now();

    const update = (currentTime) => {
      const progress = Math.min(1, (currentTime - startTime) / duration);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const currentValue = Math.round(finalValue * easedProgress);
      element.textContent = String(currentValue).padStart(2, "0");

      if (progress < 1) window.requestAnimationFrame(update);
    };

    window.requestAnimationFrame(update);
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
      throw new Error(result?.message || "Unable to load verified landlords.");
    }

    return result;
  }

  function setLoading(isLoading) {
    loading = isLoading;
    filterForm.querySelectorAll("input, select, button").forEach((control) => {
      control.disabled = isLoading;
    });

    if (!isLoading) return;

    message.classList.add("hidden");
    pagination.classList.add("hidden");
    grid.classList.add("loading");
    grid.innerHTML = `
      <div class="directory-card-skeleton"></div>
      <div class="directory-card-skeleton"></div>
      <div class="directory-card-skeleton"></div>
      <div class="directory-card-skeleton"></div>
    `;
  }

  function createStat(iconClass, text) {
    const stat = document.createElement("span");
    const icon = document.createElement("i");
    icon.className = iconClass;
    icon.setAttribute("aria-hidden", "true");
    stat.append(icon, document.createTextNode(text));
    return stat;
  }

  function createLandlordCard(landlord, index) {
    const count = Number(landlord.active_listing_count) || 0;
    const rating = Number(landlord.average_rating) || 0;
    const reviews = Number(landlord.total_reviews) || 0;
    const isFullyVerified = landlord.verification_level === "fully_verified";
    const card = document.createElement("a");
    card.className = "directory-landlord-card";
    card.style.setProperty("--reveal-delay", `${Math.min(index, 7) * 70}ms`);
    card.href = `${FRONTEND_ROOT}/pages/landlord/details.html?id=${encodeURIComponent(landlord.id)}`;
    card.setAttribute(
      "aria-label",
      `View ${landlord.name || "verified landlord"}'s profile`,
    );

    const cover = document.createElement("div");
    cover.className = "directory-card-cover";

    const avatar = document.createElement("img");
    avatar.className = "directory-card-avatar";
    avatar.src = getProfileUrl(landlord.profile_picture_url);
    avatar.alt = landlord.name || "Verified landlord";
    avatar.loading = "lazy";
    avatar.addEventListener(
      "error",
      () => {
        avatar.src = DEFAULT_PROFILE;
      },
      { once: true },
    );

    const badge = document.createElement("span");
    badge.className = `directory-verified-badge${isFullyVerified ? " fully-verified" : ""}`;
    badge.innerHTML = isFullyVerified
      ? '<i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Fully verified'
      : '<i class="fa-solid fa-circle-check" aria-hidden="true"></i> Verified';

    const content = document.createElement("div");
    content.className = "directory-card-content";

    const name = document.createElement("h2");
    name.textContent = landlord.name || "Verified Landlord";

    const stats = document.createElement("div");
    stats.className = "directory-card-stats";
    stats.appendChild(
      createStat(
        "fa-solid fa-building",
        `${count} ${count === 1 ? "property" : "properties"}`,
      ),
    );

    if (reviews > 0) {
      stats.appendChild(
        createStat(
          "fa-solid fa-star",
          `${rating.toFixed(1)} · ${reviews} ${reviews === 1 ? "review" : "reviews"}`,
        ),
      );
    }

    const location = document.createElement("p");
    location.className = "directory-card-location";
    const locationIcon = document.createElement("i");
    locationIcon.className = "fa-solid fa-location-dot";
    locationIcon.setAttribute("aria-hidden", "true");
    const locationText = document.createElement("span");
    locationText.textContent = landlord.available_areas
      ? `Available rentals in ${landlord.available_areas}`
      : "No available rental locations right now";
    location.append(locationIcon, locationText);

    const action = document.createElement("span");
    action.className = "directory-card-action";
    const memberSince = formatMemberSince(landlord.member_since);
    const actionText = document.createElement("span");
    actionText.textContent = memberSince
      ? `Member since ${memberSince}`
      : "View profile";
    const arrow = document.createElement("span");
    arrow.innerHTML =
      'View profile <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>';
    action.append(actionText, arrow);

    content.append(name, stats, location, action);
    card.append(cover, avatar, badge, content);
    return card;
  }

  function showMessage(text, isError = false) {
    grid.innerHTML = "";
    grid.classList.remove("loading");
    pagination.classList.add("hidden");
    message.innerHTML = "";

    const icon = document.createElement("i");
    icon.className = isError
      ? "fa-solid fa-circle-exclamation"
      : "fa-solid fa-user-shield";
    const title = document.createElement("strong");
    title.textContent = isError
      ? "Unable to load landlords"
      : "No verified landlords found";
    const description = document.createElement("span");
    description.textContent = text;
    message.append(icon, title, description);
    message.classList.remove("hidden");
  }

  function renderLandlords(landlords) {
    grid.innerHTML = "";
    grid.classList.remove("loading");
    message.classList.add("hidden");

    if (!Array.isArray(landlords) || landlords.length === 0) {
      showMessage("Try changing the name, location, or sorting filter.");
      return;
    }

    landlords.forEach((landlord, index) => {
      grid.appendChild(createLandlordCard(landlord, index));
    });

    revealLandlordCards();
  }

  function revealLandlordCards() {
    const cards = grid.querySelectorAll(".directory-landlord-card");
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reduceMotion || !("IntersectionObserver" in window)) {
      cards.forEach((card) => card.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.14 },
    );

    cards.forEach((card) => observer.observe(card));
  }

  function createPageButton(label, page, options = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.disabled = Boolean(options.disabled);
    button.classList.toggle("active", Boolean(options.active));
    if (options.active) button.setAttribute("aria-current", "page");
    button.addEventListener("click", () => {
      if (loading || button.disabled || page === currentPage) return;
      currentPage = page;
      loadLandlords({ scroll: true });
    });
    return button;
  }

  function renderPagination(paginationData = {}) {
    const totalPages = Number(paginationData.total_pages) || 0;
    const page = Number(paginationData.current_page) || 1;
    pagination.innerHTML = "";

    if (totalPages <= 1) {
      pagination.classList.add("hidden");
      return;
    }

    pagination.appendChild(
      createPageButton("Previous", Math.max(1, page - 1), {
        disabled: page <= 1,
      }),
    );

    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + 4);
    for (let number = start; number <= end; number += 1) {
      pagination.appendChild(
        createPageButton(String(number), number, {
          active: number === page,
        }),
      );
    }

    pagination.appendChild(
      createPageButton("Next", Math.min(totalPages, page + 1), {
        disabled: page >= totalPages,
      }),
    );
    pagination.classList.remove("hidden");
  }

  function updateUrl() {
    const parameters = new URLSearchParams();
    const search = searchInput.value.trim();
    const barangay = locationSelect.value;
    const sort = sortSelect.value;

    if (search) parameters.set("search", search);
    if (barangay) parameters.set("barangay", barangay);
    if (sort !== "listings_desc") parameters.set("sort", sort);
    if (currentPage > 1) parameters.set("page", String(currentPage));

    const query = parameters.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
  }

  async function loadLandlords({ scroll = false } = {}) {
    setLoading(true);

    const parameters = new URLSearchParams({
      page: String(currentPage),
      limit: String(PAGE_LIMIT),
      sort: sortSelect.value,
    });
    const search = searchInput.value.trim();
    const barangay = locationSelect.value;
    if (search) parameters.set("search", search);
    if (barangay) parameters.set("barangay", barangay);

    try {
      const result = await getJson(`${API_ENDPOINT}?${parameters}`);
      const landlords = result.data?.verified_landlords || [];
      const paginationData = result.data?.pagination || {};
      const directorySummary = result.data?.summary || {};
      const total = Number(paginationData.total_items) || 0;
      currentPage = Number(paginationData.current_page) || 1;

      renderLandlords(landlords);
      renderPagination(paginationData);
      summary.textContent =
        total === 1
          ? "1 verified landlord found."
          : `${total} verified landlords found.`;
      animateNumber(
        landlordCount,
        directorySummary.verified_landlords ?? total,
      );
      animateNumber(listingCount, directorySummary.active_listings ?? 0);
      updateUrl();

      if (scroll) {
        document.querySelector(".landlord-directory-heading")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    } catch (error) {
      summary.textContent = "Verified landlord directory unavailable.";
      showMessage(error.message || "Please try again later.", true);
    } finally {
      setLoading(false);
    }
  }

  function loadInitialFilters() {
    const parameters = new URLSearchParams(window.location.search);
    searchInput.value = parameters.get("search") || "";
    locationSelect.value = parameters.get("barangay") || "";

    const requestedSort = parameters.get("sort") || "listings_desc";
    if (
      [...sortSelect.options].some((option) => option.value === requestedSort)
    ) {
      sortSelect.value = requestedSort;
    }

    const requestedPage = parameters.get("page") || "1";
    currentPage = /^\d+$/.test(requestedPage)
      ? Math.max(1, Number(requestedPage))
      : 1;
  }

  filterForm.addEventListener("submit", (event) => {
    event.preventDefault();
    currentPage = 1;
    loadLandlords();
  });

  resetButton.addEventListener("click", () => {
    filterForm.reset();
    currentPage = 1;
    loadLandlords();
  });

  loadInitialFilters();
  loadLandlords();
})();
