(function () {
  const API_ROOT = "/SilipMunti/backend";
  const FRONTEND_ROOT = "/SilipMunti/frontend";

  const endpoints = {
    getDocuments: `${API_ROOT}/admin/get-all-documents.php`,
  };

  const landlordList = document.querySelector("#landlord-verification-list");
  const adminMessage = document.querySelector("#admin-message");
  const refreshButton = document.querySelector("#refresh-button");
  const statusFilter = document.querySelector("#status-filter");
  const topbarSearch = document.querySelector("#topbar-search");

  let documents = [];
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
    const groups = new Map();

    documents.forEach((document) => {
      const id = String(document.landlord_id);

      if (!groups.has(id)) {
        groups.set(id, {
          landlord_id: document.landlord_id,
          landlord_name: document.landlord_name || "Unknown landlord",
          landlord_email: document.landlord_email || "No email",
          documents: [],
        });
      }

      groups.get(id).documents.push(document);
    });

    return Array.from(groups.values());
  }

  function getGroupMeta(group) {
    const requiredTypes = ["valid_id", "barangay_clearance", "land_title"];
    const approved = requiredTypes.filter((type) =>
      group.documents.some(
        (document) =>
          document.document_type === type &&
          document.verification_status === "approved",
      ),
    ).length;
    const pending = group.documents.filter(
      (document) => document.verification_status === "pending",
    ).length;
    const rejected = group.documents.filter(
      (document) => document.verification_status === "rejected",
    ).length;
    const latestDate = group.documents
      .map((document) => document.created_at)
      .filter(Boolean)
      .sort()
      .at(-1);

    if (rejected > 0) {
      return {
        approved,
        pending,
        rejected,
        latestDate,
        label: "Needs resubmission",
        className: "rejected",
      };
    }

    if (pending > 0) {
      return {
        approved,
        pending,
        rejected,
        latestDate,
        label: "For review",
        className: "pending",
      };
    }

    if (approved === 3) {
      return {
        approved,
        pending,
        rejected,
        latestDate,
        label: "Verified",
        className: "approved",
      };
    }

    return {
      approved,
      pending,
      rejected,
      latestDate,
      label: "Incomplete",
      className: "not-submitted",
    };
  }

  function applyStatusFilter(groups) {
    const status = statusFilter.value;
    if (!status) return groups;

    return groups.filter((group) => {
      const meta = getGroupMeta(group);

      if (status === "pending") return meta.pending > 0;
      if (status === "approved")
        return meta.approved === 3 && meta.pending === 0 && meta.rejected === 0;
      if (status === "rejected") return meta.rejected > 0;
      if (status === "incomplete") return meta.approved < 3;

      return true;
    });
  }

  function updateSummary() {
    const groups = getLandlordGroups();
    const pending = documents.filter(
      (document) => document.verification_status === "pending",
    ).length;
    const approvedLandlords = groups.filter((group) => {
      const meta = getGroupMeta(group);
      return meta.approved === 3 && meta.pending === 0 && meta.rejected === 0;
    }).length;
    const needsAction = groups.filter((group) => {
      const meta = getGroupMeta(group);
      return meta.pending > 0 || meta.rejected > 0 || meta.approved < 3;
    }).length;

    setText("#total-landlords", groups.length);
    setText("#pending-documents", pending);
    setText("#approved-documents", approvedLandlords);
    setText("#rejected-documents", needsAction);

    window.SilipMuntiAdminShell?.setPendingCount(pending);
  }

  function renderLandlords() {
    updateSummary();

    const groups = applyStatusFilter(getLandlordGroups());

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
            ${groups
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
                <strong>${meta.approved}/3</strong>
                <span>approved documents</span>
              </div>
            </td>
            <td>
              <span class="admin-status ${meta.className}">${meta.label}</span>
            </td>
            <td>
              <strong class="admin-date-cell">${escapeHtml(formatDate(meta.latestDate))}</strong>
            </td>
            <td>
              <a class="admin-open-link" href="${detailUrl}">
                Review
                <i class="fa-solid fa-arrow-right"></i>
              </a>
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

      documents = Array.isArray(result.data?.documents)
        ? result.data.documents
        : [];

      renderLandlords();
    } catch (error) {
      documents = [];
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
    refreshButton.addEventListener("click", loadDocuments);
    statusFilter.addEventListener("change", renderLandlords);

    topbarSearch.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(loadDocuments, 350);
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
