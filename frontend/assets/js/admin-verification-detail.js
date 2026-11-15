(function () {
  "use strict";

  const API_ROOT = "/SilipMunti/backend";
  const FRONTEND_ROOT = "/SilipMunti/frontend";

  const REQUIRED_TYPES = ["valid_id"];
  const OPTIONAL_TYPES = ["barangay_clearance"];
  const DISPLAY_TYPES = [...REQUIRED_TYPES, ...OPTIONAL_TYPES];

  const endpoints = {
    getDocuments: `${API_ROOT}/admin/get-all-documents.php`,
    getUsers: `${API_ROOT}/admin/get-users.php`,
    reviewDocument: `${API_ROOT}/admin/review-document.php`,
  };

  const params = new URLSearchParams(window.location.search);
  const landlordId = params.get("landlord_id");

  const documentGrid = document.querySelector("#document-detail-grid");
  const adminMessage = document.querySelector("#admin-message");
  const refreshButton = document.querySelector("#refresh-button");

  const rejectModal = document.querySelector("#reject-modal");
  const rejectModalTitle = document.querySelector("#reject-modal-title");
  const rejectionReason = document.querySelector("#rejection-reason");
  const rejectConfirm = document.querySelector("#reject-confirm");

  let documents = [];
  let landlord = null;
  let rejectTarget = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDocumentType(type) {
    const labels = {
      valid_id: "Valid Government-Issued ID",
      barangay_clearance: "Barangay Clearance",
    };

    return labels[type] || "Document";
  }

  function formatDate(value) {
    if (!value) return "Not submitted";

    const date = new Date(String(value).replace(" ", "T"));

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function setText(selector, value) {
    const element = document.querySelector(selector);

    if (element) {
      element.textContent = value;
    }
  }

  function hideMessage() {
    if (!adminMessage) return;

    adminMessage.textContent = "";
    adminMessage.className = "admin-message hidden";
  }

  function showMessage(message, type = "error") {
    if (!adminMessage) return;

    adminMessage.textContent = message;
    adminMessage.className = `admin-message ${type}`;
  }

  function isOptionalType(type) {
    return OPTIONAL_TYPES.includes(type);
  }

  function getLatestDocumentByType(type) {
    return (
      documents.find((document) => document.document_type === type) || null
    );
  }

  function getMeta() {
    const validId = getLatestDocumentByType("valid_id");

    const idStatus = validId?.verification_status || null;

    const approved = idStatus === "approved" ? 1 : 0;
    const pending = idStatus === "pending" ? 1 : 0;
    const rejected = idStatus === "rejected" ? 1 : 0;

    const issues = !validId || rejected ? 1 : 0;

    let label = "Not Submitted";
    let className = "not-submitted";

    if (idStatus === "rejected") {
      label = "Needs Resubmission";
      className = "rejected";
    } else if (idStatus === "pending") {
      label = "Pending Review";
      className = "pending";
    } else if (idStatus === "approved") {
      label = "Verified";
      className = "approved";
    }

    return {
      approved,
      pending,
      rejected,
      issues,
      label,
      className,
    };
  }

  function renderHeader() {
    if (!landlord) return;

    const meta = getMeta();

    const landlordName = landlord.landlord_name || "Unknown landlord";

    const landlordEmail = landlord.landlord_email || "No email";

    const initial = landlordName.charAt(0).toUpperCase();

    setText("#landlord-name", landlordName);
    setText("#landlord-email", landlordEmail);

    setText("#hero-landlord-name", landlordName);
    setText("#hero-landlord-email", landlordEmail);
    setText("#landlord-avatar", initial);

    setText("#approved-progress", `${meta.approved}/1`);
    setText("#pending-progress", meta.pending);
    setText("#issue-progress", meta.issues);

    const status = document.querySelector("#landlord-status");

    if (status) {
      status.textContent = meta.label;
      status.className = `admin-status ${meta.className}`;
    }
  }

  function createDocumentCard(type) {
    const record = getLatestDocumentByType(type);
    const optional = isOptionalType(type);
    const documentLabel = formatDocumentType(type);

    if (!record) {
      return `
        <article class="admin-document-detail-card missing">
          <div class="admin-document-detail-icon">
            <i class="fa-solid fa-file-circle-question"></i>
          </div>

          <div>
            <h3>${escapeHtml(documentLabel)}</h3>

            <p>
              ${
                optional
                  ? "Optional document has not been submitted."
                  : "Required Valid ID has not been submitted yet."
              }
            </p>
          </div>

          <span class="admin-status not-submitted">
            ${optional ? "Optional" : "Not Submitted"}
          </span>
        </article>
      `;
    }

    const isPending = record.verification_status === "pending";

    const statusLabel =
      {
        pending: "Pending Review",
        approved: "Approved",
        rejected: "Rejected",
      }[record.verification_status] || "Unknown";

    const statusClass = ["pending", "approved", "rejected"].includes(
      record.verification_status,
    )
      ? record.verification_status
      : "not-submitted";

    const viewUrl =
      record.view_url ||
      `${API_ROOT}/admin/view-document.php?id=${encodeURIComponent(record.id)}`;

    const reviewActions = isPending
      ? `
        <button
          type="button"
          class="admin-review-button approve-button"
          data-document-id="${escapeHtml(record.id)}"
        >
          <i class="fa-solid fa-check"></i>
          <span>Approve</span>
        </button>

        <button
          type="button"
          class="admin-review-button reject-button"
          data-document-id="${escapeHtml(record.id)}"
        >
          <i class="fa-solid fa-xmark"></i>
          <span>Reject</span>
        </button>
      `
      : "";

    const rejectionDisplay = record.rejection_reason
      ? `
        <em>${escapeHtml(record.rejection_reason)}</em>
      `
      : "";

    return `
      <article class="admin-document-detail-card">
        <div class="admin-document-detail-header">
          <div class="admin-document-detail-icon">
            <i class="fa-solid fa-file-shield"></i>
          </div>

          <span class="admin-status ${statusClass}">
            ${escapeHtml(statusLabel)}
          </span>
        </div>

        <div>
          <h3>${escapeHtml(documentLabel)}</h3>

          <p>
            ${optional ? "Optional document" : "Required document"}
          </p>
          ${
            type === "valid_id"
              ? `<p><strong>Landlord selected ID type:</strong> ${escapeHtml(
                  {
                    national_id: "National ID / PhilID / ePhilID",
                    drivers_license: "LTO Driver's License",
                    passport: "Philippine Passport",
                    prc_id: "PRC Professional ID",
                    umid: "UMID",
                    postal_id: "Postal ID",
                  }[record.id_type] || "Not recorded (older submission)",
                )}</p>
          <p><strong>Admin check:</strong> Compare this selection with the original document. Reject with reason "ID Type Mismatch" if they differ. OCR is advisory only.</p>`
              : ""
          }

          <p>
            Submitted ${escapeHtml(formatDate(record.created_at))}
          </p>

          <p>
            Reviewed by
            ${escapeHtml(record.reviewer_name || "Not reviewed yet")}
          </p>

          ${rejectionDisplay}
        </div>

        <div class="admin-document-detail-actions">
          <a
            href="${escapeHtml(viewUrl)}"
            target="_blank"
            rel="noopener noreferrer"
            class="admin-review-button view-button"
          >
            <i class="fa-solid fa-eye"></i>
            <span>View Document</span>
          </a>

          ${reviewActions}
        </div>
      </article>
    `;
  }

  function renderDocuments() {
    renderHeader();

    if (!documentGrid) return;

    documentGrid.innerHTML = DISPLAY_TYPES.map(createDocumentCard).join("");
  }

  async function reviewDocument(documentId, action, reason = "") {
    hideMessage();

    if (
      !window.SilipMuntiSession ||
      typeof window.SilipMuntiSession.secureFetch !== "function"
    ) {
      throw new Error(
        "Secure session helper is unavailable. Refresh the page.",
      );
    }

    const response = await window.SilipMuntiSession.secureFetch(
      endpoints.reviewDocument,
      {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          document_id: Number(documentId),
          action,
          rejection_reason: reason,
        }),
      },
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to complete document review.");
    }

    await loadDocuments();

    showMessage(result.message || "Document review completed.", "success");
  }

  function openRejectModal(documentId) {
    rejectTarget = documents.find(
      (document) => Number(document.id) === Number(documentId),
    );

    if (!rejectTarget) return;

    rejectModalTitle.textContent = `Reject ${formatDocumentType(
      rejectTarget.document_type,
    )}?`;

    rejectionReason.value = "";

    rejectModal.classList.remove("hidden");
    rejectionReason.focus();
  }

  function closeRejectModal() {
    rejectTarget = null;

    rejectModal.classList.add("hidden");
    rejectionReason.value = "";
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    let result;

    try {
      result = await response.json();
    } catch (error) {
      throw new Error("The server returned an invalid JSON response.");
    }

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to retrieve data.");
    }

    return result.data || {};
  }

  async function loadDocuments() {
    if (!landlordId || !/^\d+$/.test(landlordId)) {
      showMessage("Missing or invalid landlord ID.");
      return;
    }

    hideMessage();
    refreshButton.disabled = true;

    documentGrid.innerHTML = `
      <div class="admin-card-message">
        Loading verification details...
      </div>
    `;

    try {
      const [usersData, documentsData] = await Promise.all([
        fetchJson(`${endpoints.getUsers}?role=landlord&status=active`),
        fetchJson(endpoints.getDocuments),
      ]);

      const users = Array.isArray(usersData.users) ? usersData.users : [];

      const selectedLandlord = users.find(
        (user) =>
          String(user.id) === String(landlordId) && user.role === "landlord",
      );

      if (!selectedLandlord) {
        throw new Error("Landlord account not found.");
      }

      const fullName = [selectedLandlord.first_name, selectedLandlord.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();

      landlord = {
        landlord_id: selectedLandlord.id,
        landlord_name: fullName || "Unknown landlord",
        landlord_email: selectedLandlord.email || "No email",
      };

      const allDocuments = Array.isArray(documentsData.documents)
        ? documentsData.documents
        : [];

      documents = allDocuments
        .filter(
          (record) =>
            String(record.landlord_id) === String(landlordId) &&
            DISPLAY_TYPES.includes(record.document_type) &&
            !record.deleted_at,
        )
        .sort((a, b) => {
          const dateA = new Date(
            String(a.created_at || "").replace(" ", "T"),
          ).getTime();

          const dateB = new Date(
            String(b.created_at || "").replace(" ", "T"),
          ).getTime();

          return (
            (Number.isFinite(dateB) ? dateB : 0) -
              (Number.isFinite(dateA) ? dateA : 0) ||
            Number(b.id) - Number(a.id)
          );
        });

      renderDocuments();
    } catch (error) {
      landlord = null;
      documents = [];

      showMessage(
        error.message || "Unable to load verification details.",
        "error",
      );

      documentGrid.innerHTML = `
        <div class="admin-card-message">
          Unable to load verification details.
        </div>
      `;
    } finally {
      refreshButton.disabled = false;
    }
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

    const fullName = [user.first_name, user.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();

    const displayName = fullName || "Admin";

    setText("#admin-name", displayName);

    const initials =
      [
        String(user.first_name || "").charAt(0),
        String(user.last_name || "").charAt(0),
      ]
        .join("")
        .toUpperCase() || "A";

    setText("#admin-profile-initials", initials);

    const profilePicture = document.querySelector("#admin-profile-picture");

    const initialsElement = document.querySelector("#admin-profile-initials");

    if (profilePicture && user.profile_picture) {
      const profileUrl = user.profile_picture.startsWith("/")
        ? user.profile_picture
        : `${API_ROOT}/${user.profile_picture}`;

      profilePicture.onerror = () => {
        profilePicture.hidden = true;

        if (initialsElement) {
          initialsElement.hidden = false;
        }
      };

      profilePicture.src = profileUrl;
      profilePicture.hidden = false;

      if (initialsElement) {
        initialsElement.hidden = true;
      }
    }

    return user;
  }

  function setupEvents() {
    refreshButton.addEventListener("click", loadDocuments);

    documentGrid.addEventListener("click", async (event) => {
      const approveButton = event.target.closest(".approve-button");

      const rejectButton = event.target.closest(".reject-button");

      if (approveButton) {
        approveButton.disabled = true;

        try {
          await reviewDocument(approveButton.dataset.documentId, "approved");
        } catch (error) {
          showMessage(error.message, "error");
          approveButton.disabled = false;
        }

        return;
      }

      if (rejectButton) {
        openRejectModal(rejectButton.dataset.documentId);
      }
    });

    document
      .querySelector("#reject-modal-close")
      .addEventListener("click", closeRejectModal);

    document
      .querySelector("#reject-cancel")
      .addEventListener("click", closeRejectModal);

    rejectModal.addEventListener("click", (event) => {
      if (event.target === rejectModal) {
        closeRejectModal();
      }
    });

    rejectConfirm.addEventListener("click", async () => {
      if (!rejectTarget) return;

      const reason = rejectionReason.value.trim();

      if (!reason) {
        showMessage("Rejection reason is required.", "error");

        rejectionReason.focus();
        return;
      }

      rejectConfirm.disabled = true;

      try {
        await reviewDocument(rejectTarget.id, "rejected", reason);

        closeRejectModal();
      } catch (error) {
        showMessage(error.message, "error");
      } finally {
        rejectConfirm.disabled = false;
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !rejectModal.classList.contains("hidden")) {
        closeRejectModal();
      }
    });
  }

  async function initialize() {
    const admin = await loadCurrentAdmin();

    if (!admin) return;

    setupEvents();

    await loadDocuments();
  }

  initialize();
})();
