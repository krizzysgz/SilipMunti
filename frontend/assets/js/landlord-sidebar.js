class LandlordSidebar extends HTMLElement {
  connectedCallback() {
    if (this.dataset.rendered === "true") return;
    this.dataset.rendered = "true";

    const activePage = this.getAttribute("active-page") || "";
    const isActive = (page) =>
      activePage === page ? ' active" aria-current="page' : "";

    this.innerHTML = `
      <aside class="dashboard-sidebar" id="dashboard-sidebar">
        <div class="sidebar-header">
          <a href="/SilipMunti/frontend/index.html" class="dashboard-logo">
            <img
              src="/SilipMunti/frontend/assets/images/SilipMunti.png"
              alt="SilipMunti logo"
            />
          </a>
          <button
            type="button"
            class="sidebar-close"
            id="sidebar-close"
            aria-label="Close sidebar"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <nav class="sidebar-navigation" aria-label="Landlord navigation">
          <span class="sidebar-label">GENERAL</span>
          <a
            href="/SilipMunti/frontend/pages/landlord/dashboard.html"
            class="sidebar-link${isActive("dashboard")}" 
          >
            <i class="fa-solid fa-table-columns"></i>
            <span>Dashboard</span>
          </a>
          <a
            href="/SilipMunti/frontend/pages/landlord/listings.html"
            class="sidebar-link${isActive("listings")}" 
          >
            <i class="fa-solid fa-building"></i>
            <span>My Properties</span>
            
          </a>
          <a
            href="/SilipMunti/frontend/pages/landlord/create-listing.html"
            class="sidebar-link${isActive("create-listing")}" 
            id="add-property-link"
          >
            <i class="fa-solid fa-square-plus"></i>
            <span>Add Property</span>
          </a>
          <a
            href="/SilipMunti/frontend/pages/landlord/verification.html"
            class="sidebar-link${isActive("verification")}" 
          >
            <i class="fa-solid fa-file-shield"></i>
            <span>Verification</span>
          </a>
          <a
            href="/SilipMunti/frontend/pages/messages/index.html"
            class="sidebar-link${isActive("messages")}" 
          >
            <i class="fa-solid fa-message"></i>
            <span>Messages</span>
            
          </a>
          

          <span class="sidebar-label account-label">ACCOUNT</span>
          <a
            href="/SilipMunti/frontend/pages/profile/index.html"
            class="sidebar-link${isActive("profile")}" 
          >
            <i class="fa-solid fa-user"></i>
            <span>Profile</span>
          </a>
          <button
            type="button"
            class="sidebar-link logout-link"
            id="logout-button"
          >
            <i class="fa-solid fa-right-from-bracket"></i>
            <span>Logout</span>
          </button>
        </nav>

        <div class="sidebar-footer">
          <a href="/SilipMunti/frontend/index.html">
            <i class="fa-solid fa-arrow-left"></i>
            <span>Back to Website</span>
          </a>
        </div>
      </aside>
    `;

    this.dispatchEvent(
      new CustomEvent("landlord-sidebar-ready", { bubbles: true }),
    );
    window.SilipMuntiLandlordShell?.initialize();
  }
}

if (!customElements.get("landlord-sidebar")) {
  customElements.define("landlord-sidebar", LandlordSidebar);
}

const SilipMuntiLandlordShell = (() => {
  const MOBILE_BREAKPOINT = 960;
  const COUNT_CACHE_KEY = "silipmunti_landlord_sidebar_counts";
  const COUNT_CACHE_LIFETIME = 30000;
  const COUNT_REFRESH_INTERVAL = 30000;
  const endpoints = {
    listings: "/SilipMunti/backend/landlord/get-listings.php",
    inquiries: "/SilipMunti/backend/inquiries/get-inquiries.php",
  };
  let initialized = false;
  let refreshPromise = null;
  let refreshTimer = null;

  function getInitials(firstName, lastName) {
    const initials = `${String(firstName ?? "").charAt(0)}${String(
      lastName ?? "",
    ).charAt(0)}`.toUpperCase();
    return initials || "L";
  }

  function resolveProfileUrl(profilePicture) {
    const value = String(profilePicture ?? "").trim();
    if (!value) return null;
    if (/^(https?:|data:|blob:)/i.test(value) || value.startsWith("/")) {
      return value;
    }
    if (value.startsWith("SilipMunti/")) return `/${value}`;
    if (value.startsWith("backend/")) return `/SilipMunti/${value}`;
    return `/SilipMunti/backend/${value.replace(/^\/+/, "")}`;
  }

  function setAvatar(avatarSelector, pictureSelector, initialsSelector, user) {
    const avatar = document.querySelector(avatarSelector);
    const picture = document.querySelector(pictureSelector);
    const initials = document.querySelector(initialsSelector);
    if (!avatar || !picture || !initials) return;

    initials.textContent = getInitials(user.first_name, user.last_name);
    avatar.classList.remove("has-image");
    picture.hidden = true;
    picture.removeAttribute("src");

    const profileUrl = resolveProfileUrl(user.profile_picture);
    if (!profileUrl) return;

    picture.onload = () => {
      picture.hidden = false;
      avatar.classList.add("has-image");
    };
    picture.onerror = () => {
      picture.hidden = true;
      picture.removeAttribute("src");
      avatar.classList.remove("has-image");
    };
    picture.src = profileUrl;
  }

  function setLandlordProfile(user = {}) {
    const fullName = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
    const displayName = fullName || "Landlord";

    document.querySelectorAll("#landlord-topbar-name").forEach((element) => {
      element.textContent = displayName;
    });
    document.querySelectorAll("#dropdown-landlord-name").forEach((element) => {
      element.textContent = displayName;
    });
    document.querySelectorAll("#topbar-user-name").forEach((element) => {
      element.textContent = displayName;
    });

    setAvatar(
      "#topbar-landlord-avatar",
      "#landlord-profile-picture",
      "#landlord-profile-initials",
      user,
    );
    setAvatar(
      "#dropdown-landlord-avatar",
      "#dropdown-landlord-picture",
      "#dropdown-landlord-initials",
      user,
    );

    const legacyPicture = document.querySelector("#topbar-profile-picture");
    if (legacyPicture) {
      const profileUrl = resolveProfileUrl(user.profile_picture);
      const initials = getInitials(user.first_name, user.last_name);
      const fallback = `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="100%" height="100%" rx="48" fill="#eef1ff"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#1734c7" font-family="Arial" font-size="30" font-weight="700">${initials}</text></svg>`,
      )}`;
      legacyPicture.onerror = () => {
        legacyPicture.onerror = null;
        legacyPicture.src = fallback;
      };
      legacyPicture.src = profileUrl || fallback;
    }
  }

  function readCachedCounts() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(COUNT_CACHE_KEY));
      if (!cached || typeof cached !== "object") return null;
      if (Date.now() - Number(cached.savedAt || 0) > COUNT_CACHE_LIFETIME) {
        return null;
      }
      return {
        listings: Math.max(0, Number(cached.listings) || 0),
        messages: Math.max(0, Number(cached.messages) || 0),
      };
    } catch (error) {
      return null;
    }
  }

  function saveCachedCounts(counts) {
    try {
      sessionStorage.setItem(
        COUNT_CACHE_KEY,
        JSON.stringify({ ...counts, savedAt: Date.now() }),
      );
    } catch (error) {
      // The counters still work even when browser storage is unavailable.
    }
  }

  function applyCounts(counts) {
    setCount("#sidebar-listing-count", counts.listings, false);
    setCount("#sidebar-message-count", counts.messages, true);
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      credentials: "include",
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to load sidebar counters.");
    }
    return result;
  }

  async function refreshCounts(options = {}) {
    const { useCache = true } = options;
    if (useCache) {
      const cached = readCachedCounts();
      if (cached) applyCounts(cached);
    }

    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      const [listingsResult, inquiriesResult] = await Promise.allSettled([
        fetchJson(endpoints.listings),
        fetchJson(endpoints.inquiries),
      ]);

      const previous = readCachedCounts() || { listings: 0, messages: 0 };
      const counts = { ...previous };

      if (listingsResult.status === "fulfilled") {
        const listings = listingsResult.value.data?.listings;
        counts.listings = Array.isArray(listings) ? listings.length : 0;
      }

      if (inquiriesResult.status === "fulfilled") {
        const inquiries = inquiriesResult.value.data?.inquiries;
        counts.messages = Array.isArray(inquiries)
          ? inquiries.reduce(
              (total, inquiry) => total + Number(inquiry.unread_count || 0),
              0,
            )
          : Number(inquiriesResult.value.data?.unread_count || 0);
      }

      applyCounts(counts);
      saveCachedCounts(counts);
      return counts;
    })().finally(() => {
      refreshPromise = null;
    });

    return refreshPromise;
  }

  function startCountRefresh() {
    if (refreshTimer) window.clearInterval(refreshTimer);
    refreshTimer = window.setInterval(() => {
      if (!document.hidden) refreshCounts({ useCache: false });
    }, COUNT_REFRESH_INTERVAL);
  }

  function ensureBackdrop() {
    if (document.querySelector("#sidebar-backdrop")) return;
    const sidebar = document.querySelector("#dashboard-sidebar");
    if (!sidebar) return;

    const backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.className = "sidebar-backdrop";
    backdrop.id = "sidebar-backdrop";
    backdrop.setAttribute("aria-label", "Close sidebar");
    sidebar.insertAdjacentElement("afterend", backdrop);
  }

  function closeSidebar() {
    document.body.classList.remove("sidebar-open");
    document.querySelector("#dashboard-sidebar")?.classList.remove("open");
    document
      .querySelector("#sidebar-toggle")
      ?.setAttribute("aria-expanded", "false");
  }

  function openSidebar() {
    ensureBackdrop();
    document.body.classList.add("sidebar-open");
    document.querySelector("#dashboard-sidebar")?.classList.add("open");
    document
      .querySelector("#sidebar-toggle")
      ?.setAttribute("aria-expanded", "true");
    document.querySelector("#sidebar-close")?.focus();
  }

  function closeProfileDropdown() {
    const button = document.querySelector("#topbar-profile-button");
    const dropdown = document.querySelector("#topbar-profile-dropdown");
    dropdown?.classList.add("hidden");
    button?.classList.remove("active");
    button?.setAttribute("aria-expanded", "false");
  }

  function toggleProfileDropdown() {
    const button = document.querySelector("#topbar-profile-button");
    const dropdown = document.querySelector("#topbar-profile-dropdown");
    if (!button || !dropdown) return;

    const willOpen = dropdown.classList.contains("hidden");
    dropdown.classList.toggle("hidden", !willOpen);
    button.classList.toggle("active", willOpen);
    button.setAttribute("aria-expanded", String(willOpen));
  }

  async function logout() {
    const sessionManager = window.SilipMuntiSession;
    if (!sessionManager?.logoutUser) {
      await window.SilipModal.error({
        title: "Logout unavailable",
        message: "Please refresh the page and try again.",
      });
      return;
    }
    await sessionManager.logoutUser();
  }

  function initialize() {
    ensureBackdrop();
    if (initialized) return;
    initialized = true;
    refreshCounts();
    startCountRefresh();

    document.addEventListener("click", (event) => {
      const target = event.target;

      if (target.closest("#sidebar-toggle")) {
        event.preventDefault();
        openSidebar();
        return;
      }
      if (target.closest("#sidebar-close, #sidebar-backdrop")) {
        event.preventDefault();
        closeSidebar();
        return;
      }
      if (target.closest("#topbar-profile-button")) {
        event.preventDefault();
        event.stopPropagation();
        toggleProfileDropdown();
        return;
      }
      if (target.closest("#logout-button, #topbar-logout-button")) {
        event.preventDefault();
        logout();
        return;
      }
      if (target.closest("#notification-button")) {
        event.preventDefault();
        window.location.href =
          "/SilipMunti/frontend/pages/notifications/index.html";
        return;
      }

      if (
        window.innerWidth <= MOBILE_BREAKPOINT &&
        target.closest("#dashboard-sidebar .sidebar-link")
      ) {
        closeSidebar();
      }

      const profileDropdown = document.querySelector(
        "#topbar-profile-dropdown",
      );
      if (
        profileDropdown &&
        !profileDropdown.classList.contains("hidden") &&
        !profileDropdown.contains(target)
      ) {
        closeProfileDropdown();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeProfileDropdown();
        closeSidebar();
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > MOBILE_BREAKPOINT) closeSidebar();
    });

    window.addEventListener("focus", () => {
      refreshCounts({ useCache: false });
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshCounts({ useCache: false });
    });

    window.addEventListener("storage", (event) => {
      if (event.key !== COUNT_CACHE_KEY || !event.newValue) return;
      const cached = readCachedCounts();
      if (cached) applyCounts(cached);
    });

    document.addEventListener("silipmunti:messages-updated", () => {
      refreshCounts({ useCache: false });
    });
  }

  function setCount(selector, value, hideWhenZero = true) {
    const element = document.querySelector(selector);
    if (!element) return;
    const count = Math.max(0, Number(value) || 0);
    element.textContent = count > 99 ? "99+" : String(count);
    element.classList.toggle("hidden", hideWhenZero && count < 1);
  }

  function setSyncedCount(key, value) {
    const counts = readCachedCounts() || { listings: 0, messages: 0 };
    counts[key] = Math.max(0, Number(value) || 0);
    applyCounts(counts);
    saveCachedCounts(counts);
  }

  return {
    initialize,
    closeSidebar,
    closeProfileDropdown,
    setLandlordProfile,
    refreshCounts,
    setListingCount: (value) => setSyncedCount("listings", value),
    setMessageCount: (value) => setSyncedCount("messages", value),
  };
})();

window.SilipMuntiLandlordShell = SilipMuntiLandlordShell;
SilipMuntiLandlordShell.initialize();
