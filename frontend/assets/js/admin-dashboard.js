(function () {
  const API_ROOT = "/SilipMunti/backend";
  const FRONTEND_ROOT = "/SilipMunti/frontend";

  const endpoints = {
    documents: `${API_ROOT}/admin/get-all-documents.php`,
    listings: `${API_ROOT}/admin/get-all-listings.php`,
    users: `${API_ROOT}/admin/get-users.php`,
  };

  const messageBox = document.querySelector("#admin-message");
  const recentDocumentsBody = document.querySelector("#recent-documents-body");
  const topbarSearch = document.querySelector("#topbar-search");

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showMessage(message, type = "error") {
    if (!messageBox) return;

    messageBox.textContent = message;
    messageBox.className = `admin-message ${type}`;
  }

  function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
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

  function formatDocumentType(type) {
    const labels = {
      valid_id: "Valid ID",
      barangay_clearance: "Barangay Clearance",
      land_title: "Land Title",
    };

    return labels[type] || "Document";
  }

  function hydrateAdmin(user) {
    const fullName = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
    const displayName = fullName || "Admin";
    const profileUrl = user.profile_picture
      ? user.profile_picture.startsWith("/")
        ? user.profile_picture
        : `${API_ROOT}/${user.profile_picture}`
      : `${FRONTEND_ROOT}/assets/images/default-profile.png`;

    setText("#admin-name", displayName);
    setText("#admin-heading-name", displayName.split(" ")[0] || "Admin");

    const picture = document.querySelector("#admin-profile-picture");
    if (picture) picture.src = profileUrl;
  }

  async function requireAdmin() {
    const user = await window.SilipMuntiSession?.getCurrentUser();

    if (!user) {
      window.location.href = `${FRONTEND_ROOT}/pages/auth/login.html`;
      return null;
    }

    if (user.role !== "admin") {
      window.location.href = `${FRONTEND_ROOT}/index.html`;
      return null;
    }

    hydrateAdmin(user);
    return user;
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      credentials: "include",
      cache: "no-store",
    });
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to load admin data.");
    }

    return result;
  }

  function extractArray(result, keys) {
    for (const key of keys) {
      const value = result.data?.[key];
      if (Array.isArray(value)) return value;
    }

    if (Array.isArray(result.data)) return result.data;
    return [];
  }

  function renderRecentDocuments(documents) {
    if (!recentDocumentsBody) return;

    const recent = documents.slice(0, 5);

    if (recent.length < 1) {
      recentDocumentsBody.innerHTML = `
        <tr>
          <td colspan="4" class="admin-table-message">
            No recent verification requests.
          </td>
        </tr>
      `;
      return;
    }

    recentDocumentsBody.innerHTML = recent
      .map(
        (document) => `
          <tr>
            <td>
              <div class="admin-user-cell">
                <strong>${escapeHtml(document.landlord_name)}</strong>
                <span>${escapeHtml(document.landlord_email)}</span>
              </div>
            </td>
            <td>${escapeHtml(formatDocumentType(document.document_type))}</td>
            <td>
              <span class="admin-status ${escapeHtml(document.verification_status)}">
                ${escapeHtml(document.verification_status)}
              </span>
            </td>
            <td>${escapeHtml(formatDate(document.created_at))}</td>
          </tr>
        `,
      )
      .join("");
  }

  async function loadDocuments() {
    const result = await fetchJson(endpoints.documents);
    const documents = extractArray(result, ["documents"]);

    const pending = documents.filter(
      (document) => document.verification_status === "pending",
    ).length;
    const approved = documents.filter(
      (document) => document.verification_status === "approved",
    ).length;
    const rejected = documents.filter(
      (document) => document.verification_status === "rejected",
    ).length;

    setText("#total-documents", documents.length);
    setText("#pending-documents", pending);

    window.SilipMuntiAdminShell?.setPendingCount(pending);

    renderRecentDocuments(documents);

    return { documents, pending, approved, rejected };
  }

  async function loadListings() {
    try {
      const result = await fetchJson(endpoints.listings);
      const listings = extractArray(result, ["listings"]);
      setText("#total-listings", listings.length);
    } catch (error) {
      setText("#total-listings", "0");
    }
  }

  async function loadUsers() {
    try {
      const result = await fetchJson(endpoints.users);
      const users = extractArray(result, ["users"]);
      setText("#total-users", users.length);
    } catch (error) {
      setText("#total-users", "0");
    }
  }

  function setupSearch() {
    topbarSearch?.addEventListener("input", () => {
      const keyword = topbarSearch.value.trim().toLowerCase();

      document.querySelectorAll(".admin-action-card").forEach((card) => {
        const searchable = card.dataset.searchText || card.textContent || "";
        card.classList.toggle(
          "hidden",
          keyword !== "" && !searchable.toLowerCase().includes(keyword),
        );
      });
    });
  }

  async function initialize() {
    const admin = await requireAdmin();
    if (!admin) return;

    setupSearch();

    try {
      await Promise.all([loadDocuments(), loadListings(), loadUsers()]);
    } catch (error) {
      showMessage(error.message || "Unable to load dashboard data.", "error");
    }
  }

  initialize();
})();
