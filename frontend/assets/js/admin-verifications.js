(function () {
  const API_ROOT = `${window.SilipMuntiPaths.base}/backend`;
  const FRONTEND_ROOT = `${window.SilipMuntiPaths.base}/frontend`;

  const endpoints = {
    getDocuments: `${API_ROOT}/admin/get-landlord-verification-overview.php`,
  };

  const landlordList = document.querySelector("#landlord-verification-list");
  const adminMessage = document.querySelector("#admin-message");
  const refreshButton = document.querySelector("#refresh-button");
  const statusFilter = document.querySelector("#status-filter");
  const topbarSearch = document.querySelector("#topbar-search");
  const pagination = document.querySelector("#verifications-pagination");

  const PAGE_SIZE = 10;

  let documents = [];
  let landlords = [];
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

  function formatDate(value) {
    if (!value) return "No submission yet";

    const date = new Date(String(value).replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function getLandlordGroups() {
    // The API returns all registered landlords, even those without documents.
    return landlords.map((landlord) => ({
      landlord_id: landlord.id,
      landlord_name:
        `${landlord.first_name || ""} ${landlord.last_name || ""}`.trim() ||
        "Unknown landlord",
      landlord_email: landlord.email || "No email",
      documents: documents.filter(
        (doc) => String(doc.landlord_id) === String(landlord.id),
      ),
    }));
  }

  function getGroupMeta(group) {
    // The government-issued ID is the ONLY mandatory identity document.
    // Evaluate the latest valid_id submission, not historical rejected files.
    const idDocs = group.documents
      .filter((doc) => doc.document_type === "valid_id")
      .sort((a, b) => {
        const dateCompare = String(b.created_at || "").localeCompare(
          String(a.created_at || ""),
        );
        return dateCompare || Number(b.id || 0) - Number(a.id || 0);
      });
    const latest = idDocs[0];
    const currentStatus = latest?.verification_status || "not_submitted";

    const statuses = {
      not_submitted: {
        label: "Not Submitted",
        className: "not-submitted",
        code: "not_submitted",
      },
      pending: {
        label: "Pending Review",
        className: "pending",
        code: "pending",
      },
      approved: { label: "Verified", className: "approved", code: "approved" },
      rejected: {
        label: "Needs Resubmission",
        className: "rejected",
        code: "rejected",
      },
    };
    const status = statuses[currentStatus] || statuses.not_submitted;
    return {
      ...status,
      approved: currentStatus === "approved" ? 1 : 0,
      latestDate: latest?.created_at || null,
      hasSubmittedId: Boolean(latest),
    };
  }

  function applyStatusFilter(groups) {
    const status = statusFilter.value;
    if (!status) return groups;
    return groups.filter((group) => getGroupMeta(group).code === status);
  }

  function updateSummary() {
    const groups = getLandlordGroups();
    const counts = { not_submitted: 0, pending: 0, approved: 0, rejected: 0 };
    groups.forEach((group) => {
      counts[getGroupMeta(group).code] += 1;
    });
    setText("#total-landlords", groups.length);
    setText("#not-submitted-landlords", counts.not_submitted);
    setText("#pending-documents", counts.pending);
    setText("#approved-documents", counts.approved);
    setText("#rejected-documents", counts.rejected);
    window.SilipMuntiAdminShell?.setPendingCount(counts.pending);
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
          <button type="button" class="admin-page-button${active ? " active" : ""}"
            data-page="${page}" aria-label="Go to page ${page}"
            ${active ? 'aria-current="page"' : ""}>${page}</button>
        `;
      })
      .join("");

    pagination.innerHTML = `
      <span class="admin-pagination-info">
        Showing <strong>${start}–${end}</strong> of
        <strong>${totalItems}</strong> ${totalItems === 1 ? "landlord" : "landlords"}
      </span>
      <div class="admin-pagination-controls">
        <button type="button" class="admin-page-button previous"
          data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""}>
          <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
          <span>Previous</span>
        </button>
        ${pageButtons}
        <button type="button" class="admin-page-button next"
          data-page="${currentPage + 1}" ${currentPage === totalPages ? "disabled" : ""}>
          <span>Next</span>
          <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
        </button>
      </div>
    `;
    pagination.classList.remove("hidden");
  }

  function renderLandlords() {
    updateSummary();

    const groups = applyStatusFilter(getLandlordGroups());
    const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
    currentPage = Math.min(Math.max(1, currentPage), totalPages);
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const pageGroups = groups.slice(startIndex, startIndex + PAGE_SIZE);
    renderPagination(groups.length);

    setText(
      "#result-text",
      `Showing ${groups.length} landlord${groups.length === 1 ? "" : "s"} in the verification queue.`,
    );

    if (groups.length < 1) {
      landlordList.innerHTML = `
        <div class="admin-card-message">No landlord verification records found.</div>
      `;
      return;
    }

    landlordList.innerHTML = `
      <div class="admin-table-wrapper">
        <table class="admin-table admin-verification-table">
          <thead>
            <tr>
              <th>Landlord</th>
              <th>Progress</th>
              <th>Status</th>
              <th>Latest Submission</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${pageGroups
              .map((group) => {
                const meta = getGroupMeta(group);
                const initial = String(group.landlord_name || "L").charAt(0);
                const detailUrl = `${FRONTEND_ROOT}/pages/admin/verification-detail.html?landlord_id=${encodeURIComponent(group.landlord_id)}`;

                return `
          <tr class="admin-clickable-row" data-href="${detailUrl}">
            <td>
              <div class="admin-landlord-profile">
                <div class="admin-landlord-avatar">${escapeHtml(initial)}</div>
                <div>
                  <strong>${escapeHtml(group.landlord_name)}</strong>
                  <span>${escapeHtml(group.landlord_email)}</span>
                </div>
              </div>
            </td>
            <td>
              <div class="admin-progress-cell">
                <strong>${meta.approved}/1</strong>
                <span>required ID approved</span>
              </div>
            </td>
            <td>
              <span class="admin-status ${meta.className}">${meta.label}</span>
            </td>
            <td>
              <strong class="admin-date-cell">${escapeHtml(formatDate(meta.latestDate))}</strong>
            </td>
            <td>
              ${
                meta.hasSubmittedId
                  ? `<a class="admin-open-link" href="${detailUrl}">
                Review
                <i class="fa-solid fa-arrow-right"></i>
              </a>`
                  : '<span class="admin-date-cell">Awaiting ID submission</span>'
              }
            </td>
          </tr>
        `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function getQueryString() {
    const params = new URLSearchParams();

    if (topbarSearch.value.trim()) {
      params.set("search", topbarSearch.value.trim());
    }

    const queryString = params.toString();
    return queryString ? `?${queryString}` : "";
  }

  async function loadDocuments() {
    hideMessage();
    refreshButton.disabled = true;
    pagination?.classList.add("hidden");
    landlordList.innerHTML = `
      <div class="admin-card-message">Loading landlord verification queue...</div>
    `;

    try {
      const response = await fetch(
        `${endpoints.getDocuments}${getQueryString()}`,
        {
          credentials: "include",
          cache: "no-store",
        },
      );
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Unable to load verification records.",
        );
      }

      // Both arrays are required: registered landlords are the base list,
      // including accounts that have not uploaded a Valid ID yet.
      landlords = Array.isArray(result.data?.landlords)
        ? result.data.landlords
        : [];
      documents = Array.isArray(result.data?.documents)
        ? result.data.documents
        : [];

      renderLandlords();
    } catch (error) {
      landlords = [];
      documents = [];
      pagination?.classList.add("hidden");
      updateSummary();
      landlordList.innerHTML = `
        <div class="admin-card-message">Unable to load verification records.</div>
      `;
      showMessage(error.message || "Unable to connect to the server.", "error");
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

    window.SilipMuntiAdminShell?.setAdminProfile(user);

    return user;
  }

  function setupEvents() {
    refreshButton.addEventListener("click", loadDocuments);
    statusFilter.addEventListener("change", () => {
      currentPage = 1;
      renderLandlords();
    });

    topbarSearch.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      currentPage = 1;
      searchTimer = window.setTimeout(loadDocuments, 350);
    });

    pagination?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-page]");
      if (!button || button.disabled) return;

      const requestedPage = Number(button.dataset.page);
      const totalItems = applyStatusFilter(getLandlordGroups()).length;
      const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
      if (!Number.isInteger(requestedPage)) return;

      currentPage = Math.min(Math.max(1, requestedPage), totalPages);
      renderLandlords();
    });

    landlordList.addEventListener("click", (event) => {
      const row = event.target.closest(".admin-clickable-row");
      const link = event.target.closest("a");

      if (!row || link) return;

      window.location.href = row.dataset.href;
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
