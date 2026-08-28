(() => {
  const API_ROOT = "/SilipMunti/backend";
  const endpoints = {
    getAll: `${API_ROOT}/notifications/get-all.php`,
    markRead: `${API_ROOT}/notifications/mark-read.php`,
    currentUser: `${API_ROOT}/auth/user.php`,
  };

  const list = document.querySelector("#notifications-list");
  const tabs = document.querySelector("#notification-tabs");
  const typeSelect = document.querySelector("#notification-type");
  const refreshButton = document.querySelector("#refresh-notifications");
  const notificationCount = document.querySelector("#notification-count");
  const tabUnreadCount = document.querySelector("#tab-unread-count");
  const pageMessage = document.querySelector("#notification-page-message");
  const profilePicture = document.querySelector("#navbar-profile-picture");

  if (!list || !tabs || !typeSelect || !refreshButton) {
    return;
  }

  let currentStatus = "all";
  let currentType = "";
  let loading = false;

  async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      ...options,
    });

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      throw new Error("The server returned an invalid response.");
    }

    const result = await response.json();

    if (response.status === 401) {
      window.location.href = "../auth/login.html";
      throw new Error("You must log in first.");
    }

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to process the request.");
    }

    return result;
  }

  function escapeHtml(value) {
    const element = document.createElement("div");
    element.textContent = String(value ?? "");
    return element.innerHTML;
  }

  function getIcon(type) {
    const icons = {
      message_alert: "fa-solid fa-message",
      document_status: "fa-solid fa-file-shield",
      listing_status: "fa-solid fa-house-circle-check",
    };

    return icons[type] || "fa-solid fa-bell";
  }

  function getDestination(notification) {
    if (notification.target_url) {
      return notification.target_url.replace(
        "/SilipMunti/frontend/messages.html",
        "/SilipMunti/frontend/pages/messages/index.html",
      );
    }

    if (notification.notification_type === "document_status") {
      return "/SilipMunti/frontend/pages/landlord/verification.html";
    }

    if (notification.notification_type === "listing_status") {
      return "/SilipMunti/frontend/pages/landlord/listings.html";
    }

    if (
      notification.notification_type === "message_alert" &&
      notification.inquiry_id
    ) {
      return `/SilipMunti/frontend/pages/messages/index.html?inquiry_id=${Number(notification.inquiry_id)}`;
    }

    return "";
  }

  function formatDate(value) {
    if (!value) {
      return "";
    }

    const date = new Date(String(value).replace(" ", "T"));

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function updateUnreadCount(value) {
    const count = Number(value) || 0;
    const display = count > 99 ? "99+" : String(count);

    if (notificationCount) {
      notificationCount.textContent = display;
      notificationCount.classList.toggle("hidden", count === 0);
    }

    if (tabUnreadCount) {
      tabUnreadCount.textContent = display;
      tabUnreadCount.classList.toggle("hidden", count === 0);
    }
  }

  function showMessage(message) {
    pageMessage.textContent = message;
    pageMessage.classList.remove("hidden");
  }

  function hideMessage() {
    pageMessage.textContent = "";
    pageMessage.classList.add("hidden");
  }

  function renderState(icon, title, message, loadingState = false) {
    list.innerHTML = `
      <div class="notification-state">
        ${
          loadingState
            ? '<span class="notification-loader"></span>'
            : `<span class="notification-state-icon"><i class="${icon}"></i></span>`
        }
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(message)}</p>
      </div>
    `;
  }

  function renderNotifications(notifications) {
    if (!notifications.length) {
      renderState(
        "fa-regular fa-bell",
        "No notifications found",
        currentStatus === "unread"
          ? "You have no unread notifications."
          : "Your latest account updates will appear here.",
      );
      return;
    }

    list.innerHTML = notifications
      .map((notification) => {
        const type = escapeHtml(notification.notification_type);
        const destination = getDestination(notification);

        return `
          <button
            type="button"
            class="notification-card ${notification.is_read ? "" : "unread"}"
            data-notification-id="${Number(notification.id)}"
            data-destination="${escapeHtml(destination)}"
          >
            <span class="notification-card-icon ${type}">
              <i class="${getIcon(notification.notification_type)}"></i>
            </span>
            <span class="notification-card-content">
              <strong>${escapeHtml(notification.message)}</strong>
              <time>${escapeHtml(formatDate(notification.created_at))}</time>
            </span>
            <span class="notification-card-action">
              ${notification.is_read ? "" : '<span class="unread-dot"></span>'}
              <i class="fa-solid fa-chevron-right"></i>
            </span>
          </button>
        `;
      })
      .join("");
  }

  async function loadCurrentUser() {
    try {
      const result = await apiRequest(endpoints.currentUser);
      const user = result.data.user;

      if (user.profile_picture && profilePicture) {
        profilePicture.src = `/SilipMunti/backend/${user.profile_picture}`;
      }
    } catch (error) {
      return;
    }
  }

  async function loadNotifications() {
    if (loading) {
      return;
    }

    loading = true;
    hideMessage();
    refreshButton.classList.add("loading");
    refreshButton.disabled = true;
    renderState("", "Loading notifications", "Please wait a moment.", true);

    const parameters = new URLSearchParams({ status: currentStatus });

    if (currentType) {
      parameters.set("type", currentType);
    }

    try {
      const result = await apiRequest(
        `${endpoints.getAll}?${parameters.toString()}`,
      );
      updateUnreadCount(result.data.unread_count);
      renderNotifications(result.data.notifications || []);
    } catch (error) {
      showMessage(error.message);
      renderState(
        "fa-solid fa-triangle-exclamation",
        "Unable to load notifications",
        "Check your connection, login session, and backend endpoint, then try again.",
      );
    } finally {
      loading = false;
      refreshButton.classList.remove("loading");
      refreshButton.disabled = false;
    }
  }

  async function openNotification(card) {
    const notificationId = Number(card.dataset.notificationId);
    const destination = card.dataset.destination;

    if (!notificationId) {
      return;
    }

    if (card.classList.contains("unread")) {
      try {
        await apiRequest(endpoints.markRead, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ notification_id: notificationId }),
        });
      } catch (error) {
        showMessage(error.message);
        return;
      }
    }

    if (destination) {
      window.location.href = destination;
      return;
    }

    await loadNotifications();
  }

  tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-status]");

    if (!button || button.dataset.status === currentStatus) {
      return;
    }

    currentStatus = button.dataset.status;
    tabs.querySelectorAll("[data-status]").forEach((tab) => {
      tab.classList.toggle("active", tab === button);
    });
    loadNotifications();
  });

  typeSelect.addEventListener("change", () => {
    currentType = typeSelect.value;
    loadNotifications();
  });

  refreshButton.addEventListener("click", loadNotifications);

  list.addEventListener("click", (event) => {
    const card = event.target.closest("[data-notification-id]");

    if (card) {
      openNotification(card);
    }
  });

  loadCurrentUser();
  loadNotifications();
})();
