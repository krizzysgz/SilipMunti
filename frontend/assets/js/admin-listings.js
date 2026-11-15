(function () {
  const API_ROOT = "/SilipMunti/backend";
  const FRONTEND_ROOT = "/SilipMunti/frontend";

  const endpoints = {
    getListings: `${API_ROOT}/admin/get-all-listings.php`,
    deleteListing: `${API_ROOT}/admin/delete-listing.php`,
    restoreListing: `${API_ROOT}/admin/restore-listing.php`,
    reviewListing: `${API_ROOT}/admin/review-listing.php`,
    proofs: `${API_ROOT}/admin/property-proofs.php`,
    viewProof: `${API_ROOT}/admin/view-property-proof.php`,
  };

  const tableBody = document.querySelector("#listings-table-body");
  const adminMessage = document.querySelector("#admin-message");
  const refreshButton = document.querySelector("#refresh-button");
  const topbarSearch = document.querySelector("#topbar-search");
  const recordStatusFilter = document.querySelector("#record-status-filter");
  const availabilityFilter = document.querySelector("#availability-filter");
  const approvalStatusFilter = document.querySelector(
    "#approval-status-filter",
  );
  const barangayFilter = document.querySelector("#barangay-filter");
  const deleteModal = document.querySelector("#delete-modal");
  const deleteModalTitle = document.querySelector("#delete-modal-title");
  const deleteConfirm = document.querySelector("#delete-confirm");
  const pagination = document.querySelector("#listings-pagination");

  const tabAll = document.querySelector("#listings-tab-all");
  const tabPending = document.querySelector("#listings-tab-pending");
  const listingsView = document.querySelector("#listings-view");
  const pendingCount = document.querySelector("#pending-listings-count");
  const previewModal = document.querySelector("#listing-preview-modal");
  const previewFeedback = document.querySelector("#listing-preview-feedback");
  const previewReasonWrap = document.querySelector(
    "#listing-preview-rejection",
  );
  const previewReason = document.querySelector(
    "#listing-preview-rejection-reason",
  );
  const previewApprove = document.querySelector("#listing-preview-approve");
  const previewReject = document.querySelector("#listing-preview-reject");
  let previewListing = null;
  let lastPreviewTrigger = null;
  let previewBusy = false;
  let loadedProofs = [];
  let proofTarget = null;
  let proofBusy = false;
  const PAGE_SIZE = 10;

  let listings = [];
  let deleteTarget = null;
  let searchTimer = null;
  let currentPage = 1;

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
      verification: listing.verification_status || "pending",
      landlordName,
      landlordEmail:
        listing.landlord_email ||
        listing.owner_email ||
        listing.user_email ||
        listing.email ||
        "",
      createdAt: listing.created_at || listing.posted_at || "",
      deletedAt: listing.deleted_at || null,
      description: listing.description || "",
      images: Array.isArray(listing.images) ? listing.images : [],
      bedroomNo: listing.bedroom_no,
      size: listing.listing_size,
      occupancy: listing.occupancy_limit,
      landlordPhone: listing.landlord_phone || "",
      amenities: Array.isArray(listing.amenities) ? listing.amenities : [],
      nearby: Array.isArray(listing.nearby_establishments)
        ? listing.nearby_establishments
        : [],
      transport: Array.isArray(listing.transport_routes)
        ? listing.transport_routes
        : [],
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
          return '<span class="admin-page-ellipsis" aria-hidden="true">…</span>';
        }

        const active = page === currentPage;
        return `
          <button
            type="button"
            class="admin-page-button${active ? " active" : ""}"
            data-page="${page}"
            aria-label="Go to page ${page}"
            ${active ? 'aria-current="page"' : ""}
          >${page}</button>
        `;
      })
      .join("");

    pagination.innerHTML = `
      <span class="admin-pagination-info">
        Showing <strong>${start}–${end}</strong> of
        <strong>${totalItems}</strong> ${totalItems === 1 ? "listing" : "listings"}
      </span>
      <div class="admin-pagination-controls">
        <button
          type="button"
          class="admin-page-button previous"
          data-page="${currentPage - 1}"
          ${currentPage === 1 ? "disabled" : ""}
        >
          <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
          <span>Previous</span>
        </button>
        ${pageButtons}
        <button
          type="button"
          class="admin-page-button next"
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
    const totalPages = Math.max(1, Math.ceil(listings.length / PAGE_SIZE));
    currentPage = Math.min(Math.max(1, currentPage), totalPages);
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const pageListings = listings.slice(startIndex, startIndex + PAGE_SIZE);
    renderPagination(listings.length);

    if (listings.length < 1) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" class="admin-table-message">No listings found.</td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = pageListings
      .map((listing) => {
        const isDeleted = Boolean(listing.deletedAt);
        const statusClass = isDeleted ? "rejected" : listing.availability;
        const statusText = isDeleted ? "Removed" : listing.availability;
        const publicUrl = `${FRONTEND_ROOT}/pages/properties/details.html?id=${encodeURIComponent(listing.id)}`;
        const approvalLabels = {
          pending: "Pending Review",
          verified: "Verified",
          rejected: "Rejected",
        };
        const approvalClass =
          { pending: "pending", verified: "approved", rejected: "rejected" }[
            listing.verification
          ] || "not-submitted";
        const approvalText = approvalLabels[listing.verification] || "Unknown";

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
              <span class="admin-status ${escapeHtml(approvalClass)}">${escapeHtml(approvalText)}</span>
            </td>
            <td>
              <strong class="admin-date-cell">${escapeHtml(formatDate(listing.createdAt))}</strong>
            </td>
            <td>
              <div class="admin-row-actions">
                <button type="button" class="admin-icon-button listing-preview-button" data-listing-id="${escapeHtml(listing.id)}" title="Preview property & review" aria-label="Preview ${escapeHtml(listing.title)}"><i class="fa-solid fa-eye"></i></button>
                ${!isDeleted && listing.verification === "verified" ? `<a href="${escapeHtml(publicUrl)}" target="_blank" rel="noopener noreferrer" class="admin-icon-button" title="View public listing" aria-label="Open public listing"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ""}
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

    if (approvalStatusFilter?.value) {
      params.set("verification_status", approvalStatusFilter.value);
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
    pagination?.classList.add("hidden");
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" class="admin-table-message">Loading listings...</td>
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

      if (pendingCount)
        pendingCount.textContent = String(
          listings.filter((x) => x.verification === "pending" && !x.deletedAt)
            .length,
        );
      renderListings();
    } catch (error) {
      listings = [];
      pagination?.classList.add("hidden");
      updateSummary();
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" class="admin-table-message">
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
    const response = await window.SilipMuntiSession.secureFetch(endpoint, {
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

  async function reviewListing(listingId, action, rejectionReason = "") {
    const response = await window.SilipMuntiSession.secureFetch(
      endpoints.reviewListing,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          listing_id: Number(listingId),
          action,
          rejection_reason: rejectionReason,
        }),
      },
    );
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to review listing.");
    }
    return result;
  }

  function previewText(selector, text) {
    const element = document.querySelector(selector);
    if (element) element.textContent = text ?? "";
  }

  function renderPreviewTags(selector, values) {
    const container = document.querySelector(selector);
    if (!container) return;
    const labels = (Array.isArray(values) ? values : [])
      .map((v) =>
        typeof v === "string" ? v : v?.name || v?.label || v?.description || "",
      )
      .map((v) => String(v).trim())
      .filter(Boolean);
    container.innerHTML = labels.length
      ? labels
          .map(
            (value) =>
              `<span class="listing-preview-tag">${escapeHtml(value)}</span>`,
          )
          .join("")
      : '<span class="listing-preview-empty">Not provided</span>';
  }

  function closePreview() {
    if (previewBusy) return;
    previewModal.classList.add("hidden");
    document.querySelector("#review-proof-reason")?.classList.add("hidden");
    proofTarget = null;
    previewListing = null;
    previewReason.value = "";
    previewReject.textContent = "Reject listing";
    previewReasonWrap.classList.add("hidden");
    previewFeedback.classList.add("hidden");
    document.body.classList.remove("listing-preview-open");
    lastPreviewTrigger?.focus();
  }

  function proofStatusLabel(status) {
    return (
      {
        pending: "Pending review",
        approved: "Property proof verified",
        rejected: "Needs correction",
      }[status] || "Unknown"
    );
  }

  function proofTypeLabel(type) {
    return (
      {
        authorization: "Authorization to rent",
        title: "Ownership document",
        tct: "Land title (TCT)",
        cct: "Condominium title (CCT)",
        spa: "Special power of attorney",
      }[String(type || "").toLowerCase()] ||
      String(type || "Supporting document").replaceAll("_", " ")
    );
  }

  function setProofFeedback(message, error = true) {
    const target = document.querySelector("#review-proof-feedback");
    if (!target) return;
    target.textContent = message;
    target.classList.toggle("hidden", !message);
    target.classList.toggle("success", !error);
  }

  async function loadProofsForPreview(listingId) {
    const content = document.querySelector("#review-proof-content");
    const status = document.querySelector("#review-proof-status");
    const wanted = String(listingId);
    if (content) content.textContent = "Loading submitted documents…";
    if (status) status.textContent = "Checking…";
    setProofFeedback("");
    document.querySelector("#review-proof-reason")?.classList.add("hidden");
    proofTarget = null;
    try {
      const response = await fetch(endpoints.proofs, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok || !json.success)
        throw new Error(json.message || "Unable to load supporting documents.");
      if (!previewListing || String(previewListing.id) !== wanted) return;
      loadedProofs = (
        Array.isArray(json.data?.documents) ? json.data.documents : []
      ).filter((proof) => String(proof.listing_id) === wanted);
      renderProofsForPreview();
    } catch (error) {
      if (!previewListing || String(previewListing.id) !== wanted) return;
      if (content)
        content.textContent =
          "Unable to load proof documents. Check your connection, then close and reopen Preview.";
      if (status) status.textContent = "Unavailable";
      setProofFeedback(error.message || "Unable to load supporting documents.");
    }
  }

  function renderProofsForPreview() {
    const content = document.querySelector("#review-proof-content");
    const status = document.querySelector("#review-proof-status");
    if (!content || !status) return;
    if (loadedProofs.length === 0) {
      status.textContent = "Not submitted";
      status.className = "review-proof-status empty";
      content.innerHTML =
        '<div class="review-proof-empty"><i class="fa-regular fa-folder-open" aria-hidden="true"></i><div><strong>No document submitted</strong><p>This is optional. You can still approve the property listing after reviewing its details and photos.</p></div></div>';
      return;
    }
    const hasApproved = loadedProofs.some(
      (d) => d.verification_status === "approved",
    );
    const hasPending = loadedProofs.some(
      (d) => d.verification_status === "pending",
    );
    status.textContent = hasApproved
      ? "Verified proof"
      : hasPending
        ? "Needs review"
        : "Needs correction";
    status.className = `review-proof-status ${hasApproved ? "approved" : hasPending ? "pending" : "rejected"}`;
    content.innerHTML = loadedProofs
      .map((proof) => {
        const id = Number(proof.id);
        const state = String(proof.verification_status || "pending");
        const url = `${endpoints.viewProof}?id=${encodeURIComponent(id)}`;
        const buttons =
          state === "pending"
            ? `<div class="review-proof-actions">
        <button type="button" class="review-proof-approve" data-proof-id="${id}" data-proof-action="approved"><i class="fa-solid fa-check" aria-hidden="true"></i> Approve proof</button>
        <button type="button" class="review-proof-reject" data-proof-id="${id}" data-proof-action="rejected"><i class="fa-solid fa-xmark" aria-hidden="true"></i> Reject proof</button></div>`
            : "";
        return `<div class="review-proof-item"><div class="review-proof-icon"><i class="fa-regular fa-file-lines" aria-hidden="true"></i></div>
      <div class="review-proof-item-main"><strong>${escapeHtml(proofTypeLabel(proof.document_type))}</strong><span>${escapeHtml(proof.original_filename || "Submitted document")} · ${escapeHtml(formatDate(proof.created_at))}</span>
      <div class="review-proof-row"><span class="review-proof-pill ${escapeHtml(state)}">${escapeHtml(proofStatusLabel(state))}</span>
      <a class="review-proof-view" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> Open private document</a></div>
      ${state === "rejected" && proof.rejection_reason ? `<small class="review-proof-rejected-reason">Reason: ${escapeHtml(proof.rejection_reason)}</small>` : ""}${buttons}</div></div>`;
      })
      .join("");
  }

  async function submitProofReview(documentId, action) {
    if (proofBusy || !previewListing) return;
    const item = loadedProofs.find((p) => Number(p.id) === Number(documentId));
    if (!item || item.verification_status !== "pending") return;
    const wrap = document.querySelector("#review-proof-reason");
    const input = document.querySelector("#review-proof-reason-input");
    if (
      action === "rejected" &&
      (!proofTarget || Number(proofTarget) !== Number(documentId))
    ) {
      proofTarget = documentId;
      wrap?.classList.remove("hidden");
      input.value = "";
      input?.focus();
      return;
    }
    const reason = action === "rejected" ? input.value.trim() : "";
    if (action === "rejected" && !reason) {
      setProofFeedback("Please explain why the document was rejected.");
      input?.focus();
      return;
    }
    if (action === "approved") {
      const confirmed = await window.SilipModal.confirm({
        title: "Approve supporting document?",
        message:
          "This document will be marked approved and the property will receive the Property Verified badge. This does not publish the property listing.",
        confirmText: "Approve document",
        cancelText: "Cancel",
      });
      if (!confirmed) return;
    }
    proofBusy = true;
    setProofFeedback("");
    document
      .querySelectorAll("#review-proof-content button, #review-proof-confirm")
      .forEach((b) => {
        b.disabled = true;
      });
    try {
      const response = await window.SilipMuntiSession.secureFetch(
        endpoints.proofs,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            document_id: Number(documentId),
            status: action,
            reason,
          }),
        },
      );
      const json = await response.json();
      if (!response.ok || !json.success)
        throw new Error(json.message || "Unable to review document.");
      proofTarget = null;
      wrap?.classList.add("hidden");
      await loadProofsForPreview(previewListing.id);
      setProofFeedback(
        action === "approved"
          ? "Document approved for Property Verified."
          : "Document rejected. Reason saved.",
        false,
      );
    } catch (error) {
      setProofFeedback(error.message || "Unable to review document.");
    } finally {
      proofBusy = false;
      document
        .querySelectorAll("#review-proof-content button, #review-proof-confirm")
        .forEach((b) => {
          b.disabled = false;
        });
    }
  }

  function openPreview(id, trigger) {
    const item = listings.find((listing) => String(listing.id) === String(id));
    if (!item) return;
    previewListing = item;
    lastPreviewTrigger = trigger;
    previewReasonWrap.classList.add("hidden");
    previewReason.value = "";
    previewReject.textContent = "Reject listing";
    previewFeedback.classList.add("hidden");
    previewBusy = false;
    previewText("#listing-preview-title", item.title);
    previewText(
      "#listing-preview-subtitle",
      `${item.rentalType} • ${item.barangay}, ${item.city} • ${formatDate(item.createdAt)}`,
    );
    previewText(
      "#listing-preview-description",
      item.description.trim() || "No description provided.",
    );
    const gallery = document.querySelector("#listing-preview-gallery");
    const photos = item.images.filter(
      (image) =>
        typeof image.image_url === "string" &&
        /^https?:\/\//i.test(image.image_url),
    );
    gallery.innerHTML = photos.length
      ? photos
          .map(
            (photo, i) =>
              `<img src="${escapeHtml(photo.image_url)}" alt="Property photo ${i + 1}" loading="lazy" />`,
          )
          .join("")
      : '<div class="listing-preview-no-image"><i class="fa-regular fa-image"></i> No uploaded photos</div>';
    const status =
      { pending: "Pending Review", verified: "Verified", rejected: "Rejected" }[
        item.verification
      ] || "Unknown";
    document.querySelector("#listing-preview-summary").innerHTML =
      `<strong>${escapeHtml(formatMoney(item.price))} <small>/ month</small></strong><span class="admin-status ${escapeHtml(item.verification === "verified" ? "approved" : item.verification)}">${escapeHtml(status)}</span>`;
    const details = [
      ["Landlord", item.landlordName],
      ["Email", item.landlordEmail || "Not provided"],
      ["Phone", item.landlordPhone || "Not provided"],
      [
        "Address",
        [item.address, item.barangay, item.city].filter(Boolean).join(", "),
      ],
      ["Bedrooms", item.bedroomNo ?? "Not provided"],
      ["Occupancy", item.occupancy ?? "Not provided"],
      ["Floor area", item.size == null ? "Not provided" : `${item.size} m²`],
      ["Availability", item.availability],
    ];
    document.querySelector("#listing-preview-details").innerHTML = details
      .map(
        ([k, v]) =>
          `<div><small>${escapeHtml(k)}</small><strong>${escapeHtml(v)}</strong></div>`,
      )
      .join("");
    renderPreviewTags("#listing-preview-amenities", item.amenities);
    renderPreviewTags("#listing-preview-nearby", item.nearby);
    renderPreviewTags("#listing-preview-transport", item.transport);
    const canReview = !item.deletedAt && item.verification === "pending";
    previewApprove.classList.toggle("hidden", !canReview);
    previewReject.classList.toggle("hidden", !canReview);
    previewModal.classList.remove("hidden");
    document.body.classList.add("listing-preview-open");
    document.querySelector("#listing-preview-close").focus();
    void loadProofsForPreview(item.id);
  }

  async function submitPreviewReview(action) {
    if (
      !previewListing ||
      previewBusy ||
      previewListing.verification !== "pending"
    )
      return;
    const isApproval = action === "approved";
    if (!isApproval && previewReasonWrap.classList.contains("hidden")) {
      previewReasonWrap.classList.remove("hidden");
      previewReject.textContent = "Confirm rejection";
      previewReason.focus();
      return;
    }
    const reason = previewReason.value.trim();
    if (!isApproval && !reason) {
      previewFeedback.textContent = "Please provide a rejection reason.";
      previewFeedback.classList.remove("hidden");
      previewReason.focus();
      return;
    }
    if (isApproval) {
      const confirmed = await window.SilipModal.confirm({
        title: "Approve and publish property?",
        message: `Publish "${previewListing.title}" to the public Homepage and Properties page? Supporting document verification is a separate decision.`,
        confirmText: "Approve & publish",
        cancelText: "Cancel",
      });
      if (!confirmed) return;
    }
    previewBusy = true;
    previewApprove.disabled = true;
    previewReject.disabled = true;
    previewFeedback.classList.add("hidden");
    const id = previewListing.id;
    try {
      await reviewListing(id, action, reason);
      previewBusy = false;
      closePreview();
      await loadListings();
      showMessage(
        isApproval
          ? "Listing approved and published."
          : "Listing rejected. Landlord notified.",
        "success",
      );
    } catch (error) {
      previewFeedback.textContent =
        error.message || "Unable to review listing.";
      previewFeedback.classList.remove("hidden");
    } finally {
      previewBusy = false;
      previewApprove.disabled = false;
      previewReject.disabled = false;
      previewReject.textContent = "Reject listing";
    }
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

    window.SilipMuntiAdminShell?.setAdminProfile(user);

    return user;
  }

  function setupEvents() {
    // A single property review screen handles listings and optional proof documents.
    const setActiveTab = (tab) => {
      const isPending = tab === "pending";
      [
        [tabAll, !isPending],
        [tabPending, isPending],
      ].forEach(([button, active]) => {
        button?.classList.toggle("active", active);
        button?.setAttribute("aria-selected", String(active));
      });
      setText(
        "#result-text",
        isPending
          ? "Review properties before they become public. Open Preview to review any optional documents too."
          : "All properties. Open Preview to review listing details and any submitted documents.",
      );
    };
    const switchTab = (tab) => {
      setActiveTab(tab);
      approvalStatusFilter.value = tab === "pending" ? "pending" : "all";
      recordStatusFilter.value = "active";
      currentPage = 1;
      loadListings();
    };
    tabAll?.addEventListener("click", () => switchTab("all"));
    tabPending?.addEventListener("click", () => switchTab("pending"));
    document
      .querySelector("#review-proof-content")
      ?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-proof-action]");
        if (!button) return;
        void submitProofReview(
          Number(button.dataset.proofId),
          button.dataset.proofAction,
        );
      });
    document
      .querySelector("#review-proof-confirm")
      ?.addEventListener("click", () => {
        if (proofTarget) void submitProofReview(proofTarget, "rejected");
      });
    document
      .querySelector("#review-proof-cancel")
      ?.addEventListener("click", () => {
        proofTarget = null;
        document.querySelector("#review-proof-reason")?.classList.add("hidden");
        setProofFeedback("");
      });
    previewApprove?.addEventListener("click", () =>
      submitPreviewReview("approved"),
    );
    previewReject?.addEventListener("click", () =>
      submitPreviewReview("rejected"),
    );
    document
      .querySelector("#listing-preview-close")
      ?.addEventListener("click", closePreview);
    document
      .querySelector("#listing-preview-cancel")
      ?.addEventListener("click", closePreview);
    previewModal?.addEventListener("click", (event) => {
      if (event.target === previewModal) closePreview();
    });
    refreshButton.addEventListener("click", loadListings);

    [
      recordStatusFilter,
      approvalStatusFilter,
      availabilityFilter,
      barangayFilter,
    ]
      .filter(Boolean)
      .forEach((filter) => {
        filter.addEventListener("change", () => {
          currentPage = 1;
          const pending =
            approvalStatusFilter.value === "pending" &&
            recordStatusFilter.value === "active";
          setActiveTab(pending ? "pending" : "all");
          loadListings();
        });
      });

    topbarSearch.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      currentPage = 1;
      searchTimer = window.setTimeout(loadListings, 350);
    });

    pagination?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-page]");
      if (!button || button.disabled) return;

      const requestedPage = Number(button.dataset.page);
      const totalPages = Math.max(1, Math.ceil(listings.length / PAGE_SIZE));
      if (!Number.isInteger(requestedPage)) return;

      currentPage = Math.min(Math.max(1, requestedPage), totalPages);
      renderListings();
    });

    document.addEventListener("click", async (event) => {
      const previewButton = event.target.closest(".listing-preview-button");
      if (previewButton) {
        openPreview(previewButton.dataset.listingId, previewButton);
        return;
      }
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
      if (event.key === "Escape") {
        if (!previewModal.classList.contains("hidden")) closePreview();
        else closeDeleteModal();
      }
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
