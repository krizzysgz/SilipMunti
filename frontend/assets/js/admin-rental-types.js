(function () {
  const API_ROOT = "/SilipMunti/backend";
  const FRONTEND_ROOT = "/SilipMunti/frontend";

  const endpoints = {
    getTypes: `${API_ROOT}/rental-types/get-all.php`,
    createType: `${API_ROOT}/admin/create-rental-type.php`,
    updateType: `${API_ROOT}/admin/update-rental-type.php`,
    deleteType: `${API_ROOT}/admin/delete-rental-type.php`,
  };

  const tableBody = document.querySelector("#rental-types-table-body");
  const adminMessage = document.querySelector("#admin-message");
  const refreshButton = document.querySelector("#refresh-button");
  const topbarSearch = document.querySelector("#topbar-search");
  const recordStatusFilter = document.querySelector("#record-status-filter");
  const formModal = document.querySelector("#rental-type-modal");
  const form = document.querySelector("#rental-type-form");
  const formTitle = document.querySelector("#rental-type-modal-title");
  const modalEyebrow = document.querySelector("#modal-eyebrow");
  const formSubmit = document.querySelector("#rental-type-submit");
  const deleteModal = document.querySelector("#delete-modal");
  const deleteModalTitle = document.querySelector("#delete-modal-title");
  const deleteConfirm = document.querySelector("#delete-confirm");
  const pagination = document.querySelector("#rental-types-pagination");

  const PAGE_SIZE = 10;

  let rentalTypes = [];
  let editingType = null;
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

  function normalizeType(type) {
    return {
      id: type.id ?? type.rental_type_id,
      name: type.name || type.type_name || "Untitled type",
      description: type.description || "",
      createdAt: type.created_at || "",
      deletedAt: type.deleted_at || null,
    };
  }

  function getVisibleTypes() {
    const search = topbarSearch.value.trim().toLowerCase();
    const status = recordStatusFilter.value;

    return rentalTypes.filter((type) => {
      const matchesSearch =
        !search ||
        type.name.toLowerCase().includes(search) ||
        type.description.toLowerCase().includes(search);
      const matchesStatus =
        status === "all" ||
        (status === "active" && !type.deletedAt) ||
        (status === "deleted" && type.deletedAt);

      return matchesSearch && matchesStatus;
    });
  }

  function updateSummary() {
    const visible = getVisibleTypes();
    const active = rentalTypes.filter((type) => !type.deletedAt).length;
    const deleted = rentalTypes.filter((type) => type.deletedAt).length;

    setText("#total-types", rentalTypes.length);
    setText("#active-types", active);
    setText("#deleted-types", deleted);
    setText(
      "#result-text",
      `Showing ${visible.length} rental type${visible.length === 1 ? "" : "s"}.`,
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
        <strong>${totalItems}</strong> ${totalItems === 1 ? "rental type" : "rental types"}
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

  function renderTypes() {
    const visible = getVisibleTypes();
    updateSummary();
    const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
    currentPage = Math.min(Math.max(1, currentPage), totalPages);
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const pageTypes = visible.slice(startIndex, startIndex + PAGE_SIZE);
    renderPagination(visible.length);

    if (visible.length < 1) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="admin-table-message">No rental types found.</td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = pageTypes
      .map((type) => {
        const isDeleted = Boolean(type.deletedAt);

        return `
          <tr class="${isDeleted ? "admin-row-muted" : ""}">
            <td>
              <div class="admin-listing-cell">
                <strong>${escapeHtml(type.name)}</strong>
                <span>ID #${escapeHtml(type.id)}</span>
              </div>
            </td>
            <td>
              <span class="admin-muted">${escapeHtml(type.description || "No description")}</span>
            </td>
            <td>
              <strong class="admin-date-cell">${escapeHtml(formatDate(type.createdAt))}</strong>
            </td>
            <td>
              <span class="admin-status ${isDeleted ? "rejected" : "approved"}">
                ${isDeleted ? "Deleted" : "Active"}
              </span>
            </td>
            <td>
              <div class="admin-row-actions">
                <button
                  type="button"
                  class="admin-icon-button edit-type-button"
                  data-type-id="${escapeHtml(type.id)}"
                  title="Edit rental type"
                  ${isDeleted ? "disabled" : ""}
                >
                  <i class="fa-solid fa-pen"></i>
                </button>
                ${
                  isDeleted
                    ? ""
                    : `<button
                        type="button"
                        class="admin-icon-button delete-type-button reject-button"
                        data-type-id="${escapeHtml(type.id)}"
                        title="Delete rental type"
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

    const queryString = params.toString();
    return queryString ? `?${queryString}` : "";
  }

  async function loadTypes() {
    hideMessage();
    refreshButton.disabled = true;
    pagination?.classList.add("hidden");
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" class="admin-table-message">Loading rental types...</td>
      </tr>
    `;

    try {
      const response = await fetch(`${endpoints.getTypes}${getQueryString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to load rental types.");
      }

      const rawTypes =
        result.data?.rental_types ??
        result.data?.types ??
        result.rental_types ??
        result.data ??
        [];

      rentalTypes = Array.isArray(rawTypes) ? rawTypes.map(normalizeType) : [];
      renderTypes();
    } catch (error) {
      rentalTypes = [];
      pagination?.classList.add("hidden");
      updateSummary();
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="admin-table-message">Unable to load rental types.</td>
        </tr>
      `;
      showMessage(error.message || "Unable to connect to the server.", "error");
    } finally {
      refreshButton.disabled = false;
    }
  }

  function openCreateModal() {
    editingType = null;
    form.reset();
    modalEyebrow.textContent = "Create category";
    formTitle.textContent = "Add rental type";
    formSubmit.textContent = "Create rental type";
    formModal.classList.remove("hidden");
    form.elements.name.focus();
  }

  function openEditModal(typeId) {
    editingType = rentalTypes.find(
      (type) => Number(type.id) === Number(typeId),
    );
    if (!editingType) return;

    form.elements.name.value = editingType.name;
    form.elements.description.value = editingType.description;
    modalEyebrow.textContent = "Edit category";
    formTitle.textContent = "Edit rental type";
    formSubmit.textContent = "Save changes";
    formModal.classList.remove("hidden");
    form.elements.name.focus();
  }

  function closeFormModal() {
    editingType = null;
    form.reset();
    formModal.classList.add("hidden");
  }

  function openDeleteModal(typeId) {
    deleteTarget = rentalTypes.find(
      (type) => Number(type.id) === Number(typeId),
    );
    if (!deleteTarget) return;

    deleteModalTitle.textContent = `Delete "${deleteTarget.name}"?`;
    deleteModal.classList.remove("hidden");
  }

  function closeDeleteModal() {
    deleteTarget = null;
    deleteModal.classList.add("hidden");
  }

  function getPayload() {
    return {
      rental_type_id: editingType ? Number(editingType.id) : undefined,
      id: editingType ? Number(editingType.id) : undefined,
      name: form.elements.name.value.trim(),
      description: form.elements.description.value.trim(),
    };
  }

  async function sendJson(endpoint, payload) {
    const response = await window.SilipMuntiSession.secureFetch(endpoint, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      const details = result.errors
        ? Object.values(result.errors).filter(Boolean).join(" ")
        : "";
      throw new Error(
        details || result.message || "Unable to save rental type.",
      );
    }

    return result;
  }

  async function saveRentalType() {
    const payload = getPayload();
    const endpoint = editingType ? endpoints.updateType : endpoints.createType;

    await sendJson(endpoint, payload);
    showMessage(
      editingType
        ? "Rental type updated successfully."
        : "Rental type created successfully.",
      "success",
    );
    closeFormModal();
    await loadTypes();
  }

  async function deleteRentalType() {
    if (!deleteTarget) return;

    await sendJson(endpoints.deleteType, {
      rental_type_id: Number(deleteTarget.id),
      id: Number(deleteTarget.id),
    });
    showMessage("Rental type deleted successfully.", "success");
    closeDeleteModal();
    await loadTypes();
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
    document
      .querySelector("#open-create-modal")
      .addEventListener("click", openCreateModal);
    document
      .querySelector("#rental-type-modal-close")
      .addEventListener("click", closeFormModal);
    document
      .querySelector("#rental-type-cancel")
      .addEventListener("click", closeFormModal);
    document
      .querySelector("#delete-modal-close")
      .addEventListener("click", closeDeleteModal);
    document
      .querySelector("#delete-cancel")
      .addEventListener("click", closeDeleteModal);
    refreshButton.addEventListener("click", loadTypes);
    recordStatusFilter.addEventListener("change", () => {
      currentPage = 1;
      loadTypes();
    });

    topbarSearch.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      currentPage = 1;
      searchTimer = window.setTimeout(renderTypes, 250);
    });

    pagination?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-page]");
      if (!button || button.disabled) return;

      const requestedPage = Number(button.dataset.page);
      const totalPages = Math.max(
        1,
        Math.ceil(getVisibleTypes().length / PAGE_SIZE),
      );
      if (!Number.isInteger(requestedPage)) return;

      currentPage = Math.min(Math.max(1, requestedPage), totalPages);
      renderTypes();
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      formSubmit.disabled = true;

      try {
        await saveRentalType();
      } catch (error) {
        showMessage(error.message, "error");
      } finally {
        formSubmit.disabled = false;
      }
    });

    tableBody.addEventListener("click", (event) => {
      const editButton = event.target.closest(".edit-type-button");
      const deleteButton = event.target.closest(".delete-type-button");

      if (editButton && !editButton.disabled) {
        openEditModal(editButton.dataset.typeId);
      }

      if (deleteButton) {
        openDeleteModal(deleteButton.dataset.typeId);
      }
    });

    deleteConfirm.addEventListener("click", async () => {
      deleteConfirm.disabled = true;

      try {
        await deleteRentalType();
      } catch (error) {
        showMessage(error.message, "error");
      } finally {
        deleteConfirm.disabled = false;
      }
    });

    document.addEventListener("click", (event) => {
      if (event.target === formModal) closeFormModal();
      if (event.target === deleteModal) closeDeleteModal();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeFormModal();
        closeDeleteModal();
      }
    });
  }

  async function initialize() {
    const admin = await loadCurrentAdmin();
    if (!admin) return;

    setupEvents();
    await loadTypes();
  }

  initialize();
})();
