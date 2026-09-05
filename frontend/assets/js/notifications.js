(() => {
  const API_ROOT = "/SilipMunti/backend";
  const endpoints = {
    getAll: `${API_ROOT}/notifications/get-all.php`,
    markRead: `${API_ROOT}/notifications/mark-read.php`,
  };

  const button = document.querySelector("#notification-button");
  const count = document.querySelector("#notification-count");

  if (!button || !count) {
    return;
  }

  let notifications = [];
  let activeFilter = "all";
  let loading = false;
  let refreshInterval = null;

  const panel = document.createElement("section");
  panel.id = "notification-dropdown";
  panel.className = "notification-dropdown";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Notifications");
  panel.innerHTML = `
    <header class="notification-dropdown-header">
      <div>
        <span>SilipMunti</span>
        <h2>Notifications</h2>
      </div>
      <button id="notification-refresh" type="button" aria-label="Refresh notifications" title="Refresh notifications">
        <i class="fa-solid fa-rotate-right"></i>
      </button>
    </header>
    <div id="notification-filters" class="notification-filters">
      <button class="active" type="button" data-filter="all">All</button>
      <button type="button" data-filter="unread">Unread</button>
    </div>
    <div id="notification-list" class="notification-list"></div>
  `;

  button.parentElement.appendChild(panel);

  const list = panel.querySelector("#notification-list");
  const filters = panel.querySelector("#notification-filters");
  const refreshButton = panel.querySelector("#notification-refresh");

  async function apiRequest(url, options = {}) {
    const response = await window.SilipMuntiSession.secureFetch(url, {
      credentials: "include",
      cache: "no-store",
      ...options,
    });

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      throw new Error("The server returned an invalid response.");
    }

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to load notifications.");
    }

    return result;
  }

  function escapeHtml(value) {
    const element = document.createElement("div");
    element.textContent = String(value ?? "");
    return element.innerHTML;
  }

  function getIcon(type) {
    if (type === "message_alert") {
      return "fa-solid fa-message";
    }

    if (type === "document_status") {
      return "fa-solid fa-file-shield";
    }

    if (type === "listing_status") {
      return "fa-solid fa-house-circle-check";
    }

    return "fa-solid fa-bell";
  }

  function formatTime(value) {
    if (!value) {
      return "";
    }

    const date = new Date(String(value).replace(" ", "T"));

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    const difference = Date.now() - date.getTime();
    const minutes = Math.floor(difference / 60000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;

    return date.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
    });
  }

  function updateCount(unreadCount) {
    const total = Number(unreadCount) || 0;
    count.textContent = total > 99 ? "99+" : String(total);
    count.classList.toggle("hidden", total === 0);
    button.classList.toggle("has-unread", total > 0);
  }

  function renderNotifications() {
    const filtered = notifications.filter((notification) => {
      return activeFilter === "all" || !notification.is_read;
    });

    if (filtered.length === 0) {
      list.innerHTML = `
        <div class="notification-empty">
          <i class="fa-regular fa-bell"></i>
          <strong>No ${activeFilter === "unread" ? "unread " : ""}notifications</strong>
          <p>Your latest account updates will appear here.</p>
        </div>
      `;
      return;
    }

    list.innerHTML = filtered
      .map(
        (notification) => `
          <button
            class="notification-item ${notification.is_read ? "" : "unread"}"
            type="button"
            data-notification-id="${Number(notification.id)}"
          >
            <span class="notification-icon ${escapeHtml(notification.notification_type)}">
              <i class="${getIcon(notification.notification_type)}"></i>
            </span>
            <span class="notification-content">
              <span class="notification-message">${escapeHtml(notification.message)}</span>
              <time>${escapeHtml(formatTime(notification.created_at))}</time>
            </span>
            ${notification.is_read ? "" : '<span class="notification-unread-dot"></span>'}
          </button>
        `,
      )
      .join("");
  }

  async function loadNotifications(silent = false) {
    if (loading) {
      return;
    }

    loading = true;

    if (!silent) {
      list.innerHTML = `
        <div class="notification-loading">
          <span></span>
          <p>Loading notifications...</p>
        </div>
      `;
    }

    try {
      const result = await apiRequest(`${endpoints.getAll}?status=all`);
      notifications = result.data.notifications || [];
      updateCount(result.data.unread_count);
      renderNotifications();
    } catch (error) {
      if (!silent) {
        list.innerHTML = `
          <div class="notification-empty notification-error">
            <i class="fa-solid fa-circle-exclamation"></i>
            <strong>Unable to load notifications</strong>
            <p>${escapeHtml(error.message)}</p>
          </div>
        `;
      }
    } finally {
      loading = false;
    }
  }

  async function openNotification(notificationId) {
    const notification = notifications.find(
      (item) => Number(item.id) === Number(notificationId),
    );

    if (!notification) {
      return;
    }

    if (!notification.is_read) {
      try {
        await apiRequest(endpoints.markRead, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            notification_id: Number(notification.id),
          }),
        });

        notification.is_read = true;
        updateCount(notifications.filter((item) => !item.is_read).length);
        renderNotifications();
      } catch (error) {
        return;
      }
    }

    if (notification.target_url) {
      window.location.href = notification.target_url;
    }
  }

  function togglePanel() {
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    button.classList.toggle("active", willOpen);
    button.setAttribute("aria-expanded", String(willOpen));

    if (willOpen) {
      loadNotifications();
    }
  }

  button.type = "button";
  button.setAttribute("aria-haspopup", "true");
  button.setAttribute("aria-controls", "notification-dropdown");
  button.setAttribute("aria-expanded", "false");
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    togglePanel();
  });

  refreshButton.addEventListener("click", () => loadNotifications());

  filters.addEventListener("click", (event) => {
    const filterButton = event.target.closest("[data-filter]");

    if (!filterButton) {
      return;
    }

    activeFilter = filterButton.dataset.filter;
    filters.querySelectorAll("button").forEach((item) => {
      item.classList.toggle("active", item === filterButton);
    });
    renderNotifications();
  });

  list.addEventListener("click", (event) => {
    const item = event.target.closest("[data-notification-id]");

    if (item) {
      openNotification(item.dataset.notificationId);
    }
  });

  panel.addEventListener("click", (event) => event.stopPropagation());

  document.addEventListener("click", () => {
    panel.hidden = true;
    button.classList.remove("active");
    button.setAttribute("aria-expanded", "false");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      panel.hidden = true;
      button.classList.remove("active");
      button.setAttribute("aria-expanded", "false");
    }
  });

  loadNotifications(true);
  refreshInterval = window.setInterval(() => {
    if (!document.hidden) {
      loadNotifications(true);
    }
  }, 30000);

  window.addEventListener("beforeunload", () => {
    window.clearInterval(refreshInterval);
  });
})();
