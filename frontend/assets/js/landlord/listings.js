(() => {
  const GET_LISTINGS_API = "/SilipMunti/backend/landlord/get-listings.php";

  const DELETE_LISTING_API = "/SilipMunti/backend/landlord/delete-listing.php";

  const FRONTEND_PATH = "/SilipMunti/frontend";

  const listingsGrid = document.querySelector("#landlord-listings-grid");

  const loadingState = document.querySelector("#listings-loading-state");

  const emptyState = document.querySelector("#listings-empty-state");

  const emptyMessage = document.querySelector("#listings-empty-message");

  const errorState = document.querySelector("#listings-error-state");

  const errorMessage = document.querySelector("#listings-error-message");

  const retryButton = document.querySelector("#retry-listings-button");

  const listingSearch = document.querySelector("#listing-search");

  const topbarSearch = document.querySelector("#topbar-search");

  const verificationFilter = document.querySelector("#verification-filter");

  const availabilityFilter = document.querySelector("#availability-filter");

  const totalListingsElement = document.querySelector("#total-listings");

  const verifiedListingsElement = document.querySelector("#verified-listings");

  const pendingListingsElement = document.querySelector("#pending-listings");

  const rejectedListingsElement = document.querySelector("#rejected-listings");

  const sidebarListingCount = document.querySelector("#sidebar-listing-count");

  const resultText = document.querySelector("#listings-result-text");

  const deleteModal = document.querySelector("#listing-delete-modal");

  const deleteListingTitle = document.querySelector("#delete-listing-title");

  const cancelDeleteButton = document.querySelector("#cancel-delete-button");

  const confirmDeleteButton = document.querySelector("#confirm-delete-button");

  const dashboardMessage = document.querySelector("#dashboard-message");

  const sidebar = document.querySelector("#dashboard-sidebar");

  const sidebarToggle = document.querySelector("#sidebar-toggle");

  const sidebarClose = document.querySelector("#sidebar-close");

  const profileButton = document.querySelector("#topbar-profile-button");

  const profileDropdown = document.querySelector("#topbar-profile-dropdown");

  const logoutButton = document.querySelector("#logout-button");

  const topbarLogoutButton = document.querySelector("#topbar-logout-button");

  const notificationButton = document.querySelector("#notification-button");
  const pagination = document.querySelector("#landlord-listings-pagination");

  const PAGE_SIZE = 6;

  let landlordListings = [];
  let listingToDelete = null;
  let currentPage = 1;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatPrice(value) {
    const price = Number(value);

    if (!Number.isFinite(price)) {
      return "₱0";
    }

    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  }

  function capitalize(value) {
    const text = String(value ?? "")
      .trim()
      .toLowerCase();

    if (text === "") {
      return "Unknown";
    }

    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function normalizeVerificationStatus(status) {
    const normalizedStatus = String(status ?? "")
      .trim()
      .toLowerCase();

    if (normalizedStatus === "approved" || normalizedStatus === "verified") {
      return "verified";
    }

    if (normalizedStatus === "rejected") {
      return "rejected";
    }

    return "pending";
  }

  function getImageUrl(listing) {
    const image = listing.images?.[0]?.image_url;

    if (!image) {
      return null;
    }

    if (
      image.startsWith("http://") ||
      image.startsWith("https://") ||
      image.startsWith("/")
    ) {
      return image;
    }

    return `/SilipMunti/backend/${image}`;
  }

  function getProfilePictureUrl(profilePicture) {
    if (!profilePicture) {
      return `${FRONTEND_PATH}/assets/images/default-profile.svg`;
    }

    if (
      profilePicture.startsWith("http://") ||
      profilePicture.startsWith("https://") ||
      profilePicture.startsWith("/")
    ) {
      return profilePicture;
    }

    return `/SilipMunti/backend/${profilePicture}`;
  }

  function showMessage(message, type = "success") {
    if (!dashboardMessage) {
      return;
    }

    dashboardMessage.textContent = message;
    dashboardMessage.className = `dashboard-message ${type}`;

    window.setTimeout(() => {
      dashboardMessage.classList.add("hidden");
    }, 3500);
  }

  function showLoadingState() {
    loadingState?.classList.remove("hidden");
    listingsGrid?.classList.add("hidden");
    emptyState?.classList.add("hidden");
    errorState?.classList.add("hidden");
    pagination?.classList.add("hidden");
  }

  function showListingsState() {
    loadingState?.classList.add("hidden");
    listingsGrid?.classList.remove("hidden");
    emptyState?.classList.add("hidden");
    errorState?.classList.add("hidden");
  }

  function showEmptyState(message) {
    loadingState?.classList.add("hidden");
    listingsGrid?.classList.add("hidden");
    errorState?.classList.add("hidden");
    emptyState?.classList.remove("hidden");
    pagination?.classList.add("hidden");

    if (emptyMessage) {
      emptyMessage.textContent = message;
    }
  }

  function showErrorState(message) {
    loadingState?.classList.add("hidden");
    listingsGrid?.classList.add("hidden");
    emptyState?.classList.add("hidden");
    errorState?.classList.remove("hidden");
    pagination?.classList.add("hidden");

    if (errorMessage) {
      errorMessage.textContent = message;
    }
  }

  function updateSummary(listings) {
    const total = listings.length;

    const verified = listings.filter(
      (listing) =>
        normalizeVerificationStatus(listing.verification_status) === "verified",
    ).length;

    const pending = listings.filter(
      (listing) =>
        normalizeVerificationStatus(listing.verification_status) === "pending",
    ).length;

    const rejected = listings.filter(
      (listing) =>
        normalizeVerificationStatus(listing.verification_status) === "rejected",
    ).length;

    if (totalListingsElement) {
      totalListingsElement.textContent = total;
    }

    if (verifiedListingsElement) {
      verifiedListingsElement.textContent = verified;
    }

    if (pendingListingsElement) {
      pendingListingsElement.textContent = pending;
    }

    if (rejectedListingsElement) {
      rejectedListingsElement.textContent = rejected;
    }

    if (sidebarListingCount) {
      window.SilipMuntiLandlordShell?.setListingCount(total);
    }
  }

  function getPaginationPages(totalPages) {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const pages = [1];
    let start = Math.max(2, currentPage - 1);
    let end = Math.min(totalPages - 1, currentPage + 1);

    if (currentPage <= 4) end = 5;
    if (currentPage >= totalPages - 3) start = totalPages - 4;
    if (start > 2) pages.push("ellipsis-start");
    for (let page = start; page <= end; page += 1) pages.push(page);
    if (end < totalPages - 1) pages.push("ellipsis-end");
    pages.push(totalPages);
    return pages;
  }

  function renderPagination(totalItems) {
    if (!pagination) return;

    if (totalItems < 1) {
      pagination.classList.add("hidden");
      pagination.innerHTML = "";
      return;
    }

    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    currentPage = Math.min(Math.max(1, currentPage), totalPages);
    const start = (currentPage - 1) * PAGE_SIZE + 1;
    const end = Math.min(currentPage * PAGE_SIZE, totalItems);
    const pageButtons = getPaginationPages(totalPages)
      .map((page) => {
        if (typeof page !== "number") {
          return '<span class="landlord-page-ellipsis" aria-hidden="true">…</span>';
        }

        const active = page === currentPage;
        return `
          <button
            type="button"
            class="landlord-page-button${active ? " active" : ""}"
            data-page="${page}"
            aria-label="Go to page ${page}"
            ${active ? 'aria-current="page"' : ""}
          >${page}</button>
        `;
      })
      .join("");

    pagination.innerHTML = `
      <span class="landlord-pagination-info">
        Showing <strong>${start}–${end}</strong> of
        <strong>${totalItems}</strong> ${totalItems === 1 ? "property" : "properties"}
      </span>
      <div class="landlord-pagination-controls">
        <button
          type="button"
          class="landlord-page-button previous"
          data-page="${currentPage - 1}"
          ${currentPage === 1 ? "disabled" : ""}
        >
          <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
          <span>Previous</span>
        </button>
        ${pageButtons}
        <button
          type="button"
          class="landlord-page-button next"
          data-page="${currentPage + 1}"
          ${currentPage === totalPages ? "disabled" : ""}
        >
          <span>Next</span>
          <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
        </button>
      </div>
    `;
    pagination.classList.remove("hidden");
  }

  function createListingCard(listing) {
    const listingId = Number(listing.id);
    const imageUrl = getImageUrl(listing);

    const verificationStatus = normalizeVerificationStatus(
      listing.verification_status,
    );

    const availabilityStatus = String(
      listing.availability_status ?? "unavailable",
    ).toLowerCase();

    const imageCount = Array.isArray(listing.images)
      ? listing.images.length
      : 0;

    const bedroomNumber =
      listing.bedroom_no === null || listing.bedroom_no === ""
        ? "Not specified"
        : `${Number(listing.bedroom_no)} ${
            Number(listing.bedroom_no) === 1 ? "Bedroom" : "Bedrooms"
          }`;

    const occupancyLimit =
      listing.occupancy_limit === null || listing.occupancy_limit === ""
        ? "Not specified"
        : `Up to ${Number(listing.occupancy_limit)}`;

    const location = [listing.barangay, listing.city]
      .filter(Boolean)
      .join(", ");

    const imageContent = imageUrl
      ? `
        <img
          src="${escapeHtml(imageUrl)}"
          alt="${escapeHtml(listing.title)}"
          loading="lazy"
        />
      `
      : `
        <div class="listing-image-placeholder">
          <i class="fa-regular fa-image"></i>
        </div>
      `;

    return `
      <article
        class="landlord-listing-card"
        data-listing-id="${listingId}"
      >
        <div class="landlord-listing-image">
          ${imageContent}

          <span
            class="listing-card-status ${verificationStatus}"
          >
            <i class="fa-solid ${
              verificationStatus === "verified"
                ? "fa-circle-check"
                : verificationStatus === "rejected"
                  ? "fa-circle-xmark"
                  : "fa-clock"
            }"></i>

            ${capitalize(verificationStatus)}
          </span>

          <span class="listing-card-image-count">
            <i class="fa-regular fa-images"></i>
            ${imageCount}
          </span>
        </div>

        <div class="listing-card-body">
          <div class="listing-card-topline">
            <span class="listing-card-type">
              <i class="fa-solid fa-building"></i>
              ${escapeHtml(listing.rental_type || "Rental")}
            </span>

            <span class="listing-card-price">
              ${formatPrice(listing.price)}
              <small>/ month</small>
            </span>
          </div>

          <h3 class="listing-card-title">
            ${escapeHtml(listing.title)}
          </h3>

          <p class="listing-card-location">
            <i class="fa-solid fa-location-dot"></i>

            <span>
              ${escapeHtml(location || listing.address || "Location not specified")}
            </span>
          </p>

          <div class="listing-card-details">
            <span class="listing-card-detail">
              <i class="fa-solid fa-bed"></i>
              ${escapeHtml(bedroomNumber)}
            </span>

            <span class="listing-card-detail">
              <i class="fa-solid fa-users"></i>
              ${escapeHtml(occupancyLimit)}
            </span>

            <span
              class="listing-availability ${escapeHtml(availabilityStatus)}"
            >
              <i class="fa-solid ${
                availabilityStatus === "available"
                  ? "fa-circle-check"
                  : "fa-circle-minus"
              }"></i>

              ${escapeHtml(capitalize(availabilityStatus))}
            </span>
          </div>
        </div>

        <div class="listing-card-actions">
          <a
            href="${FRONTEND_PATH}/pages/properties/details.html?id=${listingId}"
            class="listing-action-button"
            aria-label="View ${escapeHtml(listing.title)}"
          >
            <i class="fa-regular fa-eye"></i>
            <span>View</span>
          </a>

          <a
            href="${FRONTEND_PATH}/pages/landlord/edit-listing.html?id=${listingId}"
            class="listing-action-button primary-action"
            aria-label="Edit ${escapeHtml(listing.title)}"
          >
            <i class="fa-solid fa-pen"></i>
            <span>Edit</span>
          </a>

          <button
            type="button"
            class="listing-action-button delete-action"
            data-action="delete"
            data-listing-id="${listingId}"
            aria-label="Delete ${escapeHtml(listing.title)}"
          >
            <i class="fa-regular fa-trash-can"></i>
          </button>
        </div>
      </article>
    `;
  }

  function getFilteredListings() {
    const searchValue = String(
      listingSearch?.value ?? topbarSearch?.value ?? "",
    )
      .trim()
      .toLowerCase();

    const verificationValue = verificationFilter?.value ?? "all";

    const availabilityValue = availabilityFilter?.value ?? "all";

    return landlordListings.filter((listing) => {
      const searchableText = [
        listing.title,
        listing.description,
        listing.address,
        listing.city,
        listing.barangay,
        listing.rental_type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const verificationStatus = normalizeVerificationStatus(
        listing.verification_status,
      );

      const availabilityStatus = String(
        listing.availability_status ?? "",
      ).toLowerCase();

      const matchesSearch =
        searchValue === "" || searchableText.includes(searchValue);

      const matchesVerification =
        verificationValue === "all" || verificationStatus === verificationValue;

      const matchesAvailability =
        availabilityValue === "all" || availabilityStatus === availabilityValue;

      return matchesSearch && matchesVerification && matchesAvailability;
    });
  }

  function renderListings() {
    const filteredListings = getFilteredListings();
    const totalPages = Math.max(
      1,
      Math.ceil(filteredListings.length / PAGE_SIZE),
    );
    currentPage = Math.min(Math.max(1, currentPage), totalPages);
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const pageListings = filteredListings.slice(
      startIndex,
      startIndex + PAGE_SIZE,
    );

    if (resultText) {
      const total = filteredListings.length;

      resultText.textContent =
        total === 1 ? "1 property found" : `${total} properties found`;
    }

    if (landlordListings.length === 0) {
      showEmptyState("You have not added any rental property yet.");
      return;
    }

    if (filteredListings.length === 0) {
      showEmptyState("No properties matched your search or selected filters.");
      return;
    }

    if (!listingsGrid) {
      return;
    }

    listingsGrid.innerHTML = pageListings.map(createListingCard).join("");

    showListingsState();
    renderPagination(filteredListings.length);
  }

  async function loadCurrentLandlord() {
    const session = window.SilipMuntiSession;

    if (!session?.getCurrentUser) {
      window.location.href = `${FRONTEND_PATH}/pages/auth/login.html`;
      return null;
    }

    const user = await session.getCurrentUser();

    if (!user) {
      window.location.href = `${FRONTEND_PATH}/pages/auth/login.html`;
      return null;
    }

    if (user.role !== "landlord") {
      window.location.href =
        session.getDashboardUrl?.(user.role) ?? `${FRONTEND_PATH}/index.html`;

      return null;
    }

    const fullName = [user.first_name, user.last_name]
      .filter(Boolean)
      .join(" ");

    const topbarName = document.querySelector("#landlord-topbar-name");

    const dropdownName = document.querySelector("#dropdown-landlord-name");

    if (topbarName) {
      topbarName.textContent = fullName || "Landlord";
    }

    if (dropdownName) {
      dropdownName.textContent = fullName || "Landlord";
    }

    window.SilipMuntiLandlordShell?.setLandlordProfile(user);

    return user;
  }

  async function loadListings() {
    showLoadingState();

    try {
      const response = await fetch(GET_LISTINGS_API, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const result = await response.json();

      if (response.status === 401) {
        window.location.href = `${FRONTEND_PATH}/pages/auth/login.html`;
        return;
      }

      if (response.status === 403) {
        window.location.href = `${FRONTEND_PATH}/index.html`;
        return;
      }

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to retrieve your listings.");
      }

      landlordListings = Array.isArray(result.data?.listings)
        ? result.data.listings
        : [];

      updateSummary(landlordListings);
      renderListings();
    } catch (error) {
      showErrorState(error.message || "Unable to connect to the server.");
    }
  }

  function openDeleteModal(listingId) {
    const listing = landlordListings.find(
      (item) => Number(item.id) === Number(listingId),
    );

    if (!listing) {
      return;
    }

    listingToDelete = listing;

    if (deleteListingTitle) {
      deleteListingTitle.textContent = listing.title;
    }

    deleteModal?.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function closeDeleteModal() {
    listingToDelete = null;
    deleteModal?.classList.add("hidden");
    document.body.style.overflow = "";
  }

  async function deleteListing() {
    if (!listingToDelete) {
      return;
    }

    const listingId = Number(listingToDelete.id);

    confirmDeleteButton.disabled = true;
    confirmDeleteButton.innerHTML = `
      <i class="fa-solid fa-spinner fa-spin"></i>
      <span>Deleting...</span>
    `;

    try {
      const response = await window.SilipMuntiSession.secureFetch(
        DELETE_LISTING_API,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            listing_id: listingId,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to delete property.");
      }

      landlordListings = landlordListings.filter(
        (listing) => Number(listing.id) !== listingId,
      );

      closeDeleteModal();
      updateSummary(landlordListings);
      renderListings();

      showMessage(
        result.message || "Property deleted successfully.",
        "success",
      );
    } catch (error) {
      showMessage(error.message || "Unable to delete property.", "error");
    } finally {
      confirmDeleteButton.disabled = false;
      confirmDeleteButton.innerHTML = `
        <i class="fa-solid fa-trash-can"></i>
        <span>Delete Property</span>
      `;
    }
  }

  function initializeFilters() {
    listingSearch?.addEventListener("input", () => {
      currentPage = 1;
      renderListings();
    });

    verificationFilter?.addEventListener("change", () => {
      currentPage = 1;
      renderListings();
    });

    availabilityFilter?.addEventListener("change", () => {
      currentPage = 1;
      renderListings();
    });

    topbarSearch?.addEventListener("input", () => {
      if (listingSearch) {
        listingSearch.value = topbarSearch.value;
      }

      currentPage = 1;
      renderListings();
    });

    pagination?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-page]");
      if (!button || button.disabled) return;

      const requestedPage = Number(button.dataset.page);
      const totalPages = Math.max(
        1,
        Math.ceil(getFilteredListings().length / PAGE_SIZE),
      );
      if (!Number.isInteger(requestedPage)) return;

      currentPage = Math.min(Math.max(1, requestedPage), totalPages);
      renderListings();
      document
        .querySelector(".listings-management-card")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function initializeListingActions() {
    listingsGrid?.addEventListener("click", (event) => {
      const deleteButton = event.target.closest('[data-action="delete"]');

      if (!deleteButton) {
        return;
      }

      openDeleteModal(deleteButton.dataset.listingId);
    });

    cancelDeleteButton?.addEventListener("click", closeDeleteModal);

    confirmDeleteButton?.addEventListener("click", deleteListing);

    deleteModal?.addEventListener("click", (event) => {
      if (event.target === deleteModal) {
        closeDeleteModal();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" &&
        !deleteModal?.classList.contains("hidden")
      ) {
        closeDeleteModal();
      }
    });

    retryButton?.addEventListener("click", loadListings);
  }

  async function initializePage() {
    initializeFilters();
    initializeListingActions();

    const landlord = await loadCurrentLandlord();

    if (!landlord) {
      return;
    }

    await loadListings();
  }

  document.addEventListener("DOMContentLoaded", initializePage);
})();
