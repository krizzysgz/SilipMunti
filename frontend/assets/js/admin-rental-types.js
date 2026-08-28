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

  let rentalTypes = [];
  let editingType = null;
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

  function renderTypes() {
    const visible = getVisibleTypes();
    updateSummary();

    if (visible.length < 1) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="admin-table-message">No rental types found.</td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = visible
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
    const response = await fetch(endpoint, {
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
    recordStatusFilter.addEventListener("change", loadTypes);

    topbarSearch.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(renderTypes, 250);
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
