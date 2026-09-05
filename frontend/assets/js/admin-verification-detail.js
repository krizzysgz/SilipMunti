(function () {
  const API_ROOT = "/SilipMunti/backend";
  const FRONTEND_ROOT = "/SilipMunti/frontend";
  const REQUIRED_TYPES = ["valid_id", "barangay_clearance", "land_title"];

  const endpoints = {
    getDocuments: `${API_ROOT}/admin/get-all-documents.php`,
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
      valid_id: "Valid ID",
      barangay_clearance: "Barangay Clearance",
      land_title: "Land Title",
    };

    return labels[type] || "Document";
  }

  function formatDate(value) {
    if (!value) return "Not submitted";

    const date = new Date(String(value).replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
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

  function getLatestDocumentByType(type) {
    return (
      documents.find((document) => document.document_type === type) || null
    );
  }

  function getMeta() {
    const approved = REQUIRED_TYPES.filter((type) => {
      const document = getLatestDocumentByType(type);
      return document?.verification_status === "approved";
    }).length;
    const pending = documents.filter(
      (document) => document.verification_status === "pending",
    ).length;
    const rejected = documents.filter(
      (document) => document.verification_status === "rejected",
    ).length;
    const missing = REQUIRED_TYPES.filter(
      (type) => !getLatestDocumentByType(type),
    ).length;
    const issues = rejected + missing;

    if (rejected > 0) {
      return {
        approved,
        pending,
        issues,
        label: "Needs resubmission",
        className: "rejected",
      };
    }

    if (pending > 0) {
      return {
        approved,
        pending,
        issues,
        label: "For review",
        className: "pending",
      };
    }

    if (approved === 3) {
      return {
        approved,
        pending,
        issues,
        label: "Verified",
        className: "approved",
      };
    }

    return {
      approved,
      pending,
      issues,
      label: "Incomplete",
      className: "not-submitted",
    };
  }

  function renderHeader() {
    if (!landlord) return;

    const meta = getMeta();
    const initial = String(landlord.landlord_name || "L").charAt(0);

    setText("#landlord-name", landlord.landlord_name);
    setText("#landlord-email", landlord.landlord_email);
    setText("#hero-landlord-name", landlord.landlord_name);
    setText("#hero-landlord-email", landlord.landlord_email);
    setText("#landlord-avatar", initial);
    setText("#approved-progress", `${meta.approved}/3`);
    setText("#pending-progress", meta.pending);
    setText("#issue-progress", meta.issues);

    const status = document.querySelector("#landlord-status");
    status.textContent = meta.label;
    status.className = `admin-status ${meta.className}`;
  }

  function createDocumentCard(type) {
    const document = getLatestDocumentByType(type);

    if (!document) {
      return `
        <article class="admin-document-detail-card missing">
          <div class="admin-document-detail-icon">
            <i class="fa-solid fa-file-circle-question"></i>
          </div>
          <div>
            <h3>${escapeHtml(formatDocumentType(type))}</h3>
            <p>This document has not been submitted yet.</p>
          </div>
          <span class="admin-status not-submitted">Missing</span>
        </article>
      `;
    }

    const isPending = document.verification_status === "pending";
    const viewUrl =
      document.view_url ||
      `${API_ROOT}/admin/view-document.php?id=${encodeURIComponent(document.id)}`;
    const reviewActions = isPending
      ? `
          <button
            type="button"
            class="admin-review-button approve-button"
            data-document-id="${escapeHtml(document.id)}"
          >
            <i class="fa-solid fa-check"></i>
            <span>Approve</span>
          </button>
          <button
            type="button"
            class="admin-review-button reject-button"
            data-document-id="${escapeHtml(document.id)}"
          >
            <i class="fa-solid fa-xmark"></i>
            <span>Reject</span>
          </button>
        `
      : "";

    return `
      <article class="admin-document-detail-card">
        <div class="admin-document-detail-header">
          <div class="admin-document-detail-icon">
            <i class="fa-solid fa-file-shield"></i>
          </div>
          <span class="admin-status ${escapeHtml(document.verification_status)}">
            ${escapeHtml(document.verification_status)}
          </span>
        </div>

        <div>
          <h3>${escapeHtml(formatDocumentType(document.document_type))}</h3>
          <p>Submitted ${escapeHtml(formatDate(document.created_at))}</p>
          <p>Reviewed by ${escapeHtml(document.reviewer_name || "Not reviewed yet")}</p>
          ${
            document.rejection_reason
              ? `<em>${escapeHtml(document.rejection_reason)}</em>`
              : ""
          }
        </div>

        <div class="admin-document-detail-actions">
          <a href="${escapeHtml(viewUrl)}" target="_blank" class="admin-review-button view-button">
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
    documentGrid.innerHTML = REQUIRED_TYPES.map(createDocumentCard).join("");
  }

  async function reviewDocument(documentId, action, reason = "") {
    hideMessage();

    const response = await window.SilipMuntiSession.secureFetch(
      endpoints.reviewDocument,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
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

    showMessage(result.message || "Document review completed.", "success");
    await loadDocuments();
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

  async function loadDocuments() {
    if (!landlordId) {
      showMessage("Missing landlord ID.");
      return;
    }

    hideMessage();
    refreshButton.disabled = true;
    documentGrid.innerHTML = `<div class="admin-card-message">Loading documents...</div>`;

    try {
      const response = await fetch(endpoints.getDocuments, {
        credentials: "include",
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to load documents.");
      }

      documents = (
        Array.isArray(result.data?.documents) ? result.data.documents : []
      ).filter(
        (document) => String(document.landlord_id) === String(landlordId),
      );

      if (documents.length < 1) {
        showMessage("No verification record found for this landlord.");
        documentGrid.innerHTML = `<div class="admin-card-message">No documents found.</div>`;
        return;
      }

      landlord = {
        landlord_id: documents[0].landlord_id,
        landlord_name: documents[0].landlord_name || "Unknown landlord",
        landlord_email: documents[0].landlord_email || "No email",
      };

      renderDocuments();
    } catch (error) {
      showMessage(error.message || "Unable to connect to the server.", "error");
      documentGrid.innerHTML = `<div class="admin-card-message">Unable to load documents.</div>`;
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

    const fullName = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
    const displayName = fullName || "Admin";
    const profileUrl = user.profile_picture
      ? user.profile_picture.startsWith("/")
        ? user.profile_picture
        : `${API_ROOT}/${user.profile_picture}`
      : `${FRONTEND_ROOT}/assets/images/default-profile.svg`;

    document.querySelector("#admin-name").textContent = displayName;
    document.querySelector("#admin-profile-picture").src = profileUrl;

    return user;
  }

  function setupEvents() {
    refreshButton.addEventListener("click", loadDocuments);

    document.addEventListener("click", async (event) => {
      const approveButton = event.target.closest(".approve-button");
      const rejectButton = event.target.closest(".reject-button");
      const modalClose = event.target.closest(
        "#reject-modal-close, #reject-cancel",
      );

      if (approveButton) {
        approveButton.disabled = true;

        try {
          await reviewDocument(approveButton.dataset.documentId, "approved");
        } catch (error) {
          showMessage(error.message, "error");
          approveButton.disabled = false;
        }
      }

      if (rejectButton) {
        openRejectModal(rejectButton.dataset.documentId);
      }

      if (modalClose || event.target === rejectModal) {
        closeRejectModal();
      }
    });

    rejectConfirm.addEventListener("click", async () => {
      const reason = rejectionReason.value.trim();

      if (!rejectTarget) return;

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
      if (event.key === "Escape") closeRejectModal();
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
