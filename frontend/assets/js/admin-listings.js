(function () {
  const API_ROOT = "/SilipMunti/backend";
  const FRONTEND_ROOT = "/SilipMunti/frontend";

  const endpoints = {
    getListings: `${API_ROOT}/admin/get-all-listings.php`,
    deleteListing: `${API_ROOT}/admin/delete-listing.php`,
    restoreListing: `${API_ROOT}/admin/restore-listing.php`,
  };

  const tableBody = document.querySelector("#listings-table-body");
  const adminMessage = document.querySelector("#admin-message");
  const refreshButton = document.querySelector("#refresh-button");
  const topbarSearch = document.querySelector("#topbar-search");
  const recordStatusFilter = document.querySelector("#record-status-filter");
  const availabilityFilter = document.querySelector("#availability-filter");
  const barangayFilter = document.querySelector("#barangay-filter");
  const deleteModal = document.querySelector("#delete-modal");
  const deleteModalTitle = document.querySelector("#delete-modal-title");
  const deleteConfirm = document.querySelector("#delete-confirm");

  let listings = [];
  let deleteTarget = null;
  let searchTimer = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  }

  function hideMessage() {
    adminMessage.textContent = "";
    adminMessage.className = "admin-message hidden";
  }

  function showMessage(message, type = "error") {
    adminMessage.textContent = message;
    adminMessage.className = `admin-message ${type}`;
  }

  function normalizeListing(listing) {
    const firstName =
      listing.first_name ||
      listing.landlord_first_name ||
      listing.owner_first_name ||
      "";
    const lastName =
      listing.last_name ||
      listing.landlord_last_name ||
      listing.owner_last_name ||
      "";
    const landlordName =
      listing.landlord_name ||
      [firstName, lastName].filter(Boolean).join(" ") ||
      "Unknown landlord";

    return {
      id: listing.id ?? listing.listing_id,
      title: listing.title || "Untitled listing",
      price: Number(listing.price || 0),
      address: listing.address || "",
      barangay: listing.barangay || "",
      city: listing.city || "Muntinlupa",
      rentalType:
        listing.rental_type_name ||
        listing.rental_type ||
        listing.type_name ||
        "Rental",
      availability: listing.availability_status || "available",
      verification: listing.verification_status || "verified",
      landlordName,
      landlordEmail:
        listing.landlord_email ||
        listing.owner_email ||
        listing.user_email ||
        listing.email ||
        "",
      createdAt: listing.created_at || listing.posted_at || "",
      deletedAt: listing.deleted_at || null,
    };
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(Number(value || 0));
  }

  function formatDate(value) {
    if (!value) return "Not available";

    const date = new Date(String(value).replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function updateSummary() {
    const total = listings.length;
    const deleted = listings.filter((listing) => listing.deletedAt).length;
    const active = total - deleted;
    const available = listings.filter(
      (listing) => !listing.deletedAt && listing.availability === "available",
    ).length;

    setText("#total-listings", total);
    setText("#active-listings", active);
    setText("#available-listings", available);
    setText("#deleted-listings", deleted);
    setText(
      "#result-text",
      `Showing ${total} listing${total === 1 ? "" : "s"} for monitoring.`,
    );
  }

  function renderListings() {
    updateSummary();

    if (listings.length < 1) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" class="admin-table-message">No listings found.</td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = listings
      .map((listing) => {
        const isDeleted = Boolean(listing.deletedAt);
        const statusClass = isDeleted ? "rejected" : listing.availability;
        const statusText = isDeleted ? "Removed" : listing.availability;
        const publicUrl = `${FRONTEND_ROOT}/pages/properties/details.html?id=${encodeURIComponent(listing.id)}`;

        return `
          <tr class="${isDeleted ? "admin-row-muted" : ""}">
            <td>
              <div class="admin-listing-cell">
                <strong>${escapeHtml(listing.title)}</strong>
                <span>${escapeHtml(listing.rentalType)}</span>
              </div>
            </td>
            <td>
              <div class="admin-user-cell">
                <strong>${escapeHtml(listing.landlordName)}</strong>
                <span>${escapeHtml(listing.landlordEmail)}</span>
              </div>
            </td>
            <td>
              <div class="admin-listing-cell">
                <strong>${escapeHtml(listing.barangay || "No barangay")}</strong>
                <span>${escapeHtml(listing.city)}</span>
              </div>
            </td>
            <td>
              <strong class="admin-price-cell">${escapeHtml(formatMoney(listing.price))}</strong>
            </td>
            <td>
              <span class="admin-status ${escapeHtml(statusClass)}">${escapeHtml(statusText)}</span>
            </td>
            <td>
              <strong class="admin-date-cell">${escapeHtml(formatDate(listing.createdAt))}</strong>
            </td>
            <td>
              <div class="admin-row-actions">
                <a
                  href="${escapeHtml(publicUrl)}"
                  target="_blank"
                  class="admin-icon-button"
                  title="View listing"
                >
                  <i class="fa-solid fa-eye"></i>
                </a>
                ${
                  isDeleted
                    ? `<button
                        type="button"
                        class="admin-icon-button restore-listing-button approve-button"
                        data-listing-id="${escapeHtml(listing.id)}"
                        title="Restore listing"
                      >
                        <i class="fa-solid fa-rotate-left"></i>
                      </button>`
                    : `<button
                        type="button"
                        class="admin-icon-button delete-listing-button reject-button"
                        data-listing-id="${escapeHtml(listing.id)}"
                        title="Remove listing"
                      >
                        <i class="fa-solid fa-trash-can"></i>
                      </button>`
                }
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function getQueryString() {
    const params = new URLSearchParams();

    if (recordStatusFilter.value) {
      params.set("record_status", recordStatusFilter.value);
    }

    if (availabilityFilter.value) {
      params.set("availability_status", availabilityFilter.value);
    }

    if (barangayFilter.value) {
      params.set("barangay", barangayFilter.value);
    }

    if (topbarSearch.value.trim()) {
      params.set("search", topbarSearch.value.trim());
    }

    const queryString = params.toString();
    return queryString ? `?${queryString}` : "";
  }

  async function loadListings() {
    hideMessage();
    refreshButton.disabled = true;
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="admin-table-message">Loading listings...</td>
      </tr>
    `;

    try {
      const response = await fetch(
        `${endpoints.getListings}${getQueryString()}`,
        {
          credentials: "include",
          cache: "no-store",
        },
      );
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to load listings.");
      }

      const rawListings =
        result.data?.listings ??
        result.data?.properties ??
        result.listings ??
        [];

      listings = Array.isArray(rawListings)
        ? rawListings.map(normalizeListing)
        : [];

      renderListings();
    } catch (error) {
      listings = [];
      updateSummary();
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" class="admin-table-message">
            Unable to load listings.
          </td>
        </tr>
      `;
      showMessage(error.message || "Unable to connect to the server.", "error");
    } finally {
      refreshButton.disabled = false;
    }
  }

  async function sendListingAction(endpoint, listingId) {
    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        listing_id: Number(listingId),
        id: Number(listingId),
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to update listing.");
    }

    return result;
  }

  function openDeleteModal(listingId) {
    deleteTarget = listings.find(
      (listing) => Number(listing.id) === Number(listingId),
    );

    if (!deleteTarget) return;

    deleteModalTitle.textContent = `Remove "${deleteTarget.title}"?`;
    deleteModal.classList.remove("hidden");
  }

  function closeDeleteModal() {
    deleteTarget = null;
    deleteModal.classList.add("hidden");
  }

  async function loadCurrentAdmin() {
    const user = await window.SilipMuntiSession?.getCurrentUser();

    if (!user) {
      window.location.href = `${FRONTEND_ROOT}/pages/auth/login.html`;
      return null;
    }

    if (user.role !== "admin") {
      window.location.href = `${FRONTEND_ROOT}/index.html`;
      return null;
    }

    const fullName = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
    const displayName = fullName || "Admin";
    const profileUrl = user.profile_picture
      ? user.profile_picture.startsWith("/")
        ? user.profile_picture
        : `${API_ROOT}/${user.profile_picture}`
      : `${FRONTEND_ROOT}/assets/images/default-profile.png`;

    document.querySelector("#admin-name").textContent = displayName;
    document.querySelector("#admin-profile-picture").src = profileUrl;

    return user;
  }

  function setupEvents() {
    refreshButton.addEventListener("click", loadListings);

    [recordStatusFilter, availabilityFilter, barangayFilter].forEach(
      (filter) => {
        filter.addEventListener("change", loadListings);
      },
    );

    topbarSearch.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(loadListings, 350);
    });

    document.addEventListener("click", async (event) => {
      const deleteButton = event.target.closest(".delete-listing-button");
      const restoreButton = event.target.closest(".restore-listing-button");
      const modalClose = event.target.closest(
        "#delete-modal-close, #delete-cancel",
      );

      if (deleteButton) {
        openDeleteModal(deleteButton.dataset.listingId);
        return;
      }

      if (restoreButton) {
        restoreButton.disabled = true;

        try {
          await sendListingAction(
            endpoints.restoreListing,
            restoreButton.dataset.listingId,
          );
          showMessage("Listing restored successfully.", "success");
          await loadListings();
        } catch (error) {
          showMessage(error.message, "error");
          restoreButton.disabled = false;
        }
        return;
      }

      if (modalClose || event.target === deleteModal) {
        closeDeleteModal();
      }
    });

    deleteConfirm.addEventListener("click", async () => {
      if (!deleteTarget) return;

      deleteConfirm.disabled = true;

      try {
        await sendListingAction(endpoints.deleteListing, deleteTarget.id);
        closeDeleteModal();
        showMessage("Listing removed from public browsing.", "success");
        await loadListings();
      } catch (error) {
        showMessage(error.message, "error");
      } finally {
        deleteConfirm.disabled = false;
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeDeleteModal();
    });
  }

  async function initialize() {
    const admin = await loadCurrentAdmin();
    if (!admin) return;

    setupEvents();
    await loadListings();
  }

  initialize();
})();
