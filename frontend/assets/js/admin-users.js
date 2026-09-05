(function () {
  const API_ROOT = "/SilipMunti/backend";
  const FRONTEND_ROOT = "/SilipMunti/frontend";

  const endpoints = {
    getUsers: `${API_ROOT}/admin/get-users.php`,
    deleteUser: `${API_ROOT}/admin/delete-user.php`,
    restoreUser: `${API_ROOT}/admin/restore-user.php`,
  };

  const tableBody = document.querySelector("#users-table-body");
  const adminMessage = document.querySelector("#admin-message");
  const refreshButton = document.querySelector("#refresh-button");
  const topbarSearch = document.querySelector("#topbar-search");
  const roleFilter = document.querySelector("#role-filter");
  const recordStatusFilter = document.querySelector("#record-status-filter");
  const deleteModal = document.querySelector("#delete-modal");
  const deleteModalTitle = document.querySelector("#delete-modal-title");
  const deleteConfirm = document.querySelector("#delete-confirm");
  const pagination = document.querySelector("#users-pagination");

  const PAGE_SIZE = 10;

  let users = [];
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

  function normalizeUser(user) {
    const fullName =
      user.full_name ||
      user.name ||
      [user.first_name, user.last_name].filter(Boolean).join(" ") ||
      "Unknown user";

    return {
      id: user.id ?? user.user_id,
      fullName,
      email: user.email || "",
      phone: user.phone_number || user.phone || "Not provided",
      role: user.role || "user",
      profilePicture: user.profile_picture || "",
      createdAt: user.created_at || "",
      deletedAt: user.deleted_at || null,
    };
  }

  function getProfileUrl(user) {
    if (!user.profilePicture) {
      return `${FRONTEND_ROOT}/assets/images/default-profile.svg`;
    }

    return user.profilePicture.startsWith("/")
      ? user.profilePicture
      : `${API_ROOT}/${user.profilePicture}`;
  }

  function updateSummary() {
    setText("#total-users", users.length);
    setText(
      "#renter-users",
      users.filter((user) => user.role === "renter").length,
    );
    setText(
      "#landlord-users",
      users.filter((user) => user.role === "landlord").length,
    );
    setText(
      "#admin-users",
      users.filter((user) => user.role === "admin").length,
    );
    setText(
      "#result-text",
      `Showing ${users.length} user${users.length === 1 ? "" : "s"}.`,
    );
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
        <strong>${totalItems}</strong> ${totalItems === 1 ? "user" : "users"}
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

  function renderUsers() {
    updateSummary();
    const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
    currentPage = Math.min(Math.max(1, currentPage), totalPages);
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const pageUsers = users.slice(startIndex, startIndex + PAGE_SIZE);
    renderPagination(users.length);

    if (users.length < 1) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="admin-table-message">No users found.</td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = pageUsers
      .map((user) => {
        const isDeleted = Boolean(user.deletedAt);

        return `
          <tr class="${isDeleted ? "admin-row-muted" : ""}">
            <td>
              <div class="admin-user-row">
                <img src="${escapeHtml(getProfileUrl(user))}" alt="${escapeHtml(user.fullName)}" />
                <div class="admin-user-cell">
                  <strong>${escapeHtml(user.fullName)}</strong>
                  <span>${escapeHtml(user.email)}</span>
                </div>
              </div>
            </td>
            <td>
              <span class="admin-status ${escapeHtml(user.role)}">${escapeHtml(user.role)}</span>
            </td>
            <td>${escapeHtml(user.phone)}</td>
            <td>
              <strong class="admin-date-cell">${escapeHtml(formatDate(user.createdAt))}</strong>
            </td>
            <td>
              <span class="admin-status ${isDeleted ? "rejected" : "approved"}">
                ${isDeleted ? "Deleted" : "Active"}
              </span>
            </td>
            <td>
              <div class="admin-row-actions">
                ${
                  isDeleted
                    ? `<button
                        type="button"
                        class="admin-icon-button restore-user-button approve-button"
                        data-user-id="${escapeHtml(user.id)}"
                        title="Restore user"
                      >
                        <i class="fa-solid fa-rotate-left"></i>
                      </button>`
                    : `<button
                        type="button"
                        class="admin-icon-button delete-user-button reject-button"
                        data-user-id="${escapeHtml(user.id)}"
                        title="Delete user"
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

    if (roleFilter.value) {
      params.set("role", roleFilter.value);
    }

    if (recordStatusFilter.value) {
      params.set("record_status", recordStatusFilter.value);
    }

    if (topbarSearch.value.trim()) {
      params.set("search", topbarSearch.value.trim());
    }

    const queryString = params.toString();
    return queryString ? `?${queryString}` : "";
  }

  async function loadUsers() {
    hideMessage();
    refreshButton.disabled = true;
    pagination?.classList.add("hidden");
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" class="admin-table-message">Loading users...</td>
      </tr>
    `;

    try {
      const response = await fetch(`${endpoints.getUsers}${getQueryString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to load users.");
      }

      const rawUsers =
        result.data?.users ??
        result.data?.records ??
        result.users ??
        result.data ??
        [];

      users = Array.isArray(rawUsers) ? rawUsers.map(normalizeUser) : [];
      renderUsers();
    } catch (error) {
      users = [];
      pagination?.classList.add("hidden");
      updateSummary();
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="admin-table-message">Unable to load users.</td>
        </tr>
      `;
      showMessage(error.message || "Unable to connect to the server.", "error");
    } finally {
      refreshButton.disabled = false;
    }
  }

  async function sendUserAction(endpoint, userId) {
    const response = await window.SilipMuntiSession.secureFetch(endpoint, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: Number(userId),
        id: Number(userId),
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to update user.");
    }

    return result;
  }

  function openDeleteModal(userId) {
    deleteTarget = users.find((user) => Number(user.id) === Number(userId));
    if (!deleteTarget) return;

    deleteModalTitle.textContent = `Delete ${deleteTarget.fullName}?`;
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
    refreshButton.addEventListener("click", loadUsers);
    roleFilter.addEventListener("change", () => {
      currentPage = 1;
      loadUsers();
    });
    recordStatusFilter.addEventListener("change", () => {
      currentPage = 1;
      loadUsers();
    });

    topbarSearch.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      currentPage = 1;
      searchTimer = window.setTimeout(loadUsers, 350);
    });

    pagination?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-page]");
      if (!button || button.disabled) return;

      const requestedPage = Number(button.dataset.page);
      const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
      if (!Number.isInteger(requestedPage)) return;

      currentPage = Math.min(Math.max(1, requestedPage), totalPages);
      renderUsers();
    });

    document.addEventListener("click", async (event) => {
      const deleteButton = event.target.closest(".delete-user-button");
      const restoreButton = event.target.closest(".restore-user-button");
      const modalClose = event.target.closest(
        "#delete-modal-close, #delete-cancel",
      );

      if (deleteButton) {
        openDeleteModal(deleteButton.dataset.userId);
        return;
      }

      if (restoreButton) {
        restoreButton.disabled = true;

        try {
          await sendUserAction(
            endpoints.restoreUser,
            restoreButton.dataset.userId,
          );
          showMessage("User restored successfully.", "success");
          await loadUsers();
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
        await sendUserAction(endpoints.deleteUser, deleteTarget.id);
        closeDeleteModal();
        showMessage("User deleted successfully.", "success");
        await loadUsers();
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
    await loadUsers();
  }

  initialize();
})();
