(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const settingsAPI = `${window.SilipMuntiPaths.base}/backend/admin/system-settings.php`;
  const backupsAPI = `${window.SilipMuntiPaths.base}/backend/admin/system-backups.php`;
  let state = null,
    pending = null,
    working = false,
    returnFocus = null;
  const dialog = $("system-confirm");
  const size = (bytes) => `${(Number(bytes) / 1024 / 1024).toFixed(2)} MB`;
  function notice(message, error = false) {
    $("settings-message").textContent = message;
    $("settings-message").classList.toggle("is-error", error);
  }
  async function request(url, data) {
    const response = await window.SilipMuntiSession.secureFetch(
      url,
      data
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          }
        : {},
    );
    let result;
    try {
      result = await response.json();
    } catch (_) {
      throw new Error(
        "The server returned an unexpected response. Refresh the status before retrying.",
      );
    }
    if (!response.ok || !result.success)
      throw new Error(result.message || "The request could not be completed.");
    return result;
  }
  function action(title, description, url, data, restore = false) {
    if (working || !state) return;
    returnFocus = document.activeElement;
    pending = { url, data, restore };
    $("confirm-title").textContent = title;
    $("confirm-description").textContent = description;
    $("confirm-password").value = "";
    $("restore-confirm").value = "";
    $("confirm-error").textContent = "";
    $("restore-confirm-row").hidden = !restore;
    $("restore-confirm").required = restore;
    dialog.showModal();
    $("confirm-password").focus();
  }
  function renderBackups(backups) {
    const history = $("backup-history");
    history.replaceChildren();
    if (!backups.length) {
      history.textContent = "No full backups have been created yet.";
      return;
    }
    backups.forEach((backup) => {
      const row = document.createElement("div");
      row.className = "sm-backup-row";
      const info = document.createElement("div"),
        title = document.createElement("strong"),
        meta = document.createElement("small");
      title.textContent = backup.label;
      meta.textContent = `${new Date(backup.created_at).toLocaleString()} · ${size(backup.bytes)} · ${backup.files} files`;
      info.append(title, meta);
      const actions = document.createElement("div");
      actions.className = "sm-actions";
      const download = document.createElement("a");
      download.className = "sm-button sm-secondary";
      download.textContent = "Download";
      download.href = `${backupsAPI}?download=${encodeURIComponent(backup.id)}`;
      const restore = document.createElement("button");
      restore.type = "button";
      restore.className = "sm-button sm-secondary";
      restore.textContent = "Restore";
      restore.disabled = !state.maintenance.enabled || !state.backup.ready;
      restore.title = state.maintenance.enabled
        ? "Restore this full backup"
        : "Enable maintenance before restoring";
      restore.addEventListener("click", () =>
        action(
          "Restore full backup",
          "This replaces the current database, pictures, and private documents. A safety snapshot will be created first. Maintenance will remain ON.",
          backupsAPI,
          { action: "restore", id: backup.id },
          true,
        ),
      );
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "sm-button sm-secondary";
      remove.textContent = "Delete";
      remove.addEventListener("click", () =>
        action(
          "Delete backup",
          "This permanently deletes this backup archive. Existing website data will not be changed.",
          backupsAPI,
          { action: "delete", id: backup.id },
        ),
      );
      actions.append(download, restore, remove);
      row.append(info, actions);
      history.append(row);
    });
  }
  async function load(successMessage) {
    try {
      const result = await request(settingsAPI);
      state = result.data;
      const enabled = state.maintenance.enabled;
      $("maintenance-status").textContent = enabled
        ? "MAINTENANCE ON"
        : "SYSTEM ACTIVE: Normal operation";
      $("maintenance-status").classList.toggle("is-maintenance", enabled);
      $("maintenance-message").value = state.maintenance.message;
      $("maintenance-message").disabled = false;
      $("toggle-maintenance").textContent = enabled
        ? "Disable Maintenance Mode"
        : "Enable Maintenance Mode";
      $("toggle-maintenance").disabled = false;
      $("toggle-maintenance").classList.toggle("sm-danger", !enabled);
      $("save-maintenance").disabled = false;
      $("database-status").textContent = state.database.connected
        ? "Connected"
        : "Unavailable";
      $("database-tables").textContent = state.database.tables;
      $("database-size").textContent = size(state.database.bytes);
      $("backup-readiness").textContent = state.backup.ready
        ? "Ready for full backup and restore."
        : state.backup.issues.join(" ");
      $("create-backup").disabled = !state.backup.ready;
      renderBackups(state.backups);
      notice(successMessage || "System settings loaded.");
    } catch (error) {
      notice(error.message, true);
    }
  }
  document.querySelectorAll("[data-section]").forEach((button) =>
    button.addEventListener("click", () => {
      if (working) return;
      document
        .querySelectorAll("[data-section]")
        .forEach((item) => item.removeAttribute("aria-current"));
      button.setAttribute("aria-current", "page");
      ["maintenance", "database", "backups"].forEach((name) => {
        $(`section-${name}`).hidden = name !== button.dataset.section;
      });
    }),
  );
  $("toggle-maintenance").addEventListener("click", () =>
    action(
      "Change maintenance mode",
      state.maintenance.enabled
        ? "Allow normal public access again?"
        : "Visitors, renters, and landlords will be blocked until you disable maintenance.",
      settingsAPI,
      {
        enabled: !state.maintenance.enabled,
        message: $("maintenance-message").value,
      },
    ),
  );
  $("save-maintenance").addEventListener("click", () =>
    action(
      "Save maintenance message",
      "Update the message displayed during maintenance.",
      settingsAPI,
      {
        enabled: state.maintenance.enabled,
        message: $("maintenance-message").value,
      },
    ),
  );
  $("create-backup").addEventListener("click", () =>
    action(
      "Create full backup",
      "Database, pictures, and private documents will be backed up. Requests pause briefly while the snapshot is created. Keep this page open.",
      backupsAPI,
      { action: "create" },
    ),
  );
  $("refresh-settings").addEventListener("click", () => {
    if (!working) load();
  });
  $("cancel-confirm").addEventListener("click", () => {
    if (!working) dialog.close();
  });
  dialog.addEventListener("cancel", (event) => {
    if (working) event.preventDefault();
  });
  dialog.addEventListener("close", () => {
    $("confirm-password").value = "";
    pending = null;
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  });
  $("system-confirm-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (working || !pending) return;
    if (pending.restore && $("restore-confirm").value !== "RESTORE") {
      $("confirm-error").textContent = "Type RESTORE exactly to continue.";
      return;
    }
    working = true;
    $("submit-confirm").disabled = true;
    $("cancel-confirm").disabled = true;
    $("confirm-error").textContent =
      "Working… Keep this page open until the operation finishes.";
    try {
      const result = await request(pending.url, {
        ...pending.data,
        password: $("confirm-password").value,
        confirmation: $("restore-confirm").value,
      });
      dialog.close();
      await load(result.message);
    } catch (error) {
      $("confirm-error").textContent = error.message;
    } finally {
      working = false;
      $("submit-confirm").disabled = false;
      $("cancel-confirm").disabled = false;
      $("confirm-password").value = "";
    }
  });
  (async () => {
    try {
      const user = await window.SilipMuntiSession.getCurrentUser();
      if (!user) {
        location.replace(
          `${window.SilipMuntiPaths.base}/frontend/pages/auth/login.html`,
        );
        return;
      }
      if (user.role !== "admin") {
        notice("Administrator access is required.", true);
        return;
      }
      $("admin-name").textContent =
        `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Admin";
      await load();
    } catch (_) {
      notice(
        "Unable to load your session. Refresh the page to try again.",
        true,
      );
    }
  })();
})();
