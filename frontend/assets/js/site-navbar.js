class SiteNavbar extends HTMLElement {
  connectedCallback() {
    const activePage = this.getAttribute("active-page") || "";
    const isActive = (page) =>
      activePage === page ? ' class="active" aria-current="page"' : "";

    this.innerHTML = `
      <header class="site-header">
        <nav class="navbar">
          <a href="/SilipMunti/frontend/index.html" class="navbar-logo">
            <img
              src="/SilipMunti/frontend/assets/images/SilipMunti.png"
              alt="SilipMunti logo"
            />
          </a>

          <button
            type="button"
            class="mobile-menu-button"
            id="mobile-menu-button"
            aria-label="Open navigation menu"
          >
            <i class="fa-solid fa-bars"></i>
          </button>

          <div class="navbar-content" id="navbar-content">
            <ul class="navbar-links">
              <li>
                <a href="/SilipMunti/frontend/index.html"${isActive("home")}>
                  Home
                </a>
              </li>
              <li>
                <a
                  href="/SilipMunti/frontend/pages/properties/index.html"${isActive("properties")}
                >
                  Properties
                </a>
              </li>
              <li>
                <a href="/SilipMunti/frontend/pages/about/index.html"${isActive("about")}>
                  About
                </a>
              </li>
              <li>
                <a href="/SilipMunti/frontend/pages/landlord/index.html"${isActive("landlords")}>
                  Landlord
                </a>
              </li>
            </ul>

            <div class="guest-actions" id="guest-actions">
              <a
                href="/SilipMunti/frontend/pages/auth/login.html"
                class="navbar-button sign-in-button"
              >
                Sign In
              </a>
              <a
                href="/SilipMunti/frontend/pages/auth/register.html"
                class="navbar-button sign-up-button"
              >
                Sign Up
              </a>
            </div>

            <div class="user-actions hidden" id="user-actions">
              <button
                type="button"
                class="notification-button"
                id="notification-button"
                aria-label="Open notifications"
                aria-expanded="false"
              >
                <i class="fa-solid fa-bell"></i>
                <span class="notification-count hidden" id="notification-count">
                  0
                </span>
              </button>

              <div class="profile-menu">
                <button
                  type="button"
                  class="profile-menu-button"
                  id="profile-menu-button"
                  aria-label="Open profile menu"
                  aria-expanded="false"
                >
                  <img
                    id="navbar-profile-picture"
                    src="/SilipMunti/frontend/assets/images/default-profile.svg"
                    alt="Profile picture"
                  />
                </button>

                <div class="profile-dropdown hidden" id="profile-dropdown">
                  <div class="profile-summary">
                    <img
                      id="dropdown-profile-picture"
                      src="/SilipMunti/frontend/assets/images/default-profile.svg"
                      alt="Profile"
                    />
                    <div>
                      <strong id="dropdown-user-name">User</strong>
                      <span id="dropdown-user-role">Renter</span>
                    </div>
                  </div>

                  <a
                    href="/SilipMunti/frontend/pages/profile/index.html"
                    class="dropdown-link"
                  >
                    <i class="fa-solid fa-user"></i>
                    Profile
                  </a>

                  <a
                    href="/SilipMunti/frontend/pages/messages/index.html"
                    class="dropdown-link${activePage === "messages" ? " active" : ""}"
                  >
                    <i class="fa-solid fa-comments"></i>
                    Messages
                  </a>

                  <div class="renter-menu hidden" id="renter-menu">
                    <a
                      href="/SilipMunti/frontend/pages/renter/favorites.html"
                      class="dropdown-link${activePage === "favorites" ? " active" : ""}"
                    >
                      <i class="fa-solid fa-heart"></i>
                      My Favorites
                    </a>
                    <a
                      href="/SilipMunti/frontend/pages/reviews/index.html?type=platform"
                      class="dropdown-link${activePage === "reviews" ? " active" : ""}"
                    >
                      <i class="fa-solid fa-pen-to-square"></i>
                      Reviews & Feedback
                    </a>
                  </div>

                  <div class="landlord-menu hidden" id="landlord-menu">
                    <a
                      href="/SilipMunti/frontend/pages/landlord/dashboard.html"
                      class="dropdown-link"
                    >
                      <i class="fa-solid fa-chart-line"></i>
                      Landlord Dashboard
                    </a>
                    <a
                      href="/SilipMunti/frontend/pages/landlord/listings.html"
                      class="dropdown-link"
                    >
                      <i class="fa-solid fa-building"></i>
                      My Listings
                    </a>
                    <a
                      href="/SilipMunti/frontend/pages/landlord/create-listing.html"
                      class="dropdown-link"
                    >
                      <i class="fa-solid fa-circle-plus"></i>
                      Add Property
                    </a>
                    <a
                      href="/SilipMunti/frontend/pages/landlord/verification.html"
                      class="dropdown-link"
                    >
                      <i class="fa-solid fa-file-shield"></i>
                      Verification
                    </a>
                  </div>

                  <div class="admin-menu hidden" id="admin-menu">
                    <a
                      href="/SilipMunti/frontend/pages/admin/dashboard.html"
                      class="dropdown-link"
                    >
                      <i class="fa-solid fa-gauge-high"></i>
                      Admin Dashboard
                    </a>
                  </div>

                  <button
                    type="button"
                    class="dropdown-link logout-button"
                    id="logout-button"
                  >
                    <i class="fa-solid fa-right-from-bracket"></i>
                    Logout
                  </button>
                </div>
              </div>
            </div>
          </div>
        </nav>
      </header>
    `;

    window.SilipMuntiSiteNavbar?.initialize();
  }
}

if (!customElements.get("site-navbar")) {
  customElements.define("site-navbar", SiteNavbar);
}

const SilipMuntiSiteNavbar = (() => {
  let initialized = false;
  let currentUser = null;

  const API_ROOT = "/SilipMunti/backend";
  const FRONTEND_ROOT = "/SilipMunti/frontend";
  const endpoints = {
    notifications: `${API_ROOT}/notifications/get-all.php?status=unread`,
  };

  function getDashboardUrl(role) {
    const urls = {
      admin: `${FRONTEND_ROOT}/pages/admin/dashboard.html`,
      landlord: `${FRONTEND_ROOT}/pages/landlord/dashboard.html`,
      renter: `${FRONTEND_ROOT}/index.html`,
    };

    return urls[role] || `${FRONTEND_ROOT}/index.html`;
  }

  function getProfileUrl(profilePicture) {
    if (!profilePicture) {
      return `${FRONTEND_ROOT}/assets/images/default-profile.svg`;
    }

    if (
      /^https?:\/\//i.test(profilePicture) ||
      profilePicture.startsWith("/")
    ) {
      return profilePicture;
    }

    return `${API_ROOT}/${profilePicture}`;
  }

  function setImageFallback(image) {
    if (!image) return;

    image.addEventListener("error", () => {
      image.onerror = null;
      image.src = `${FRONTEND_ROOT}/assets/images/default-profile.svg`;
    });
  }

  function showRoleMenus(role) {
    document
      .querySelector("#renter-menu")
      ?.classList.toggle("hidden", role !== "renter");
    document
      .querySelector("#landlord-menu")
      ?.classList.toggle("hidden", role !== "landlord");
    document
      .querySelector("#admin-menu")
      ?.classList.toggle("hidden", role !== "admin");
  }

  function closeProfileDropdown() {
    document.querySelector("#profile-dropdown")?.classList.add("hidden");
    document
      .querySelector("#profile-menu-button")
      ?.setAttribute("aria-expanded", "false");
  }

  function toggleProfileDropdown() {
    const button = document.querySelector("#profile-menu-button");
    const dropdown = document.querySelector("#profile-dropdown");

    if (!button || !dropdown) return;

    const isHidden = dropdown.classList.toggle("hidden");
    button.setAttribute("aria-expanded", String(!isHidden));
  }

  function closeMobileMenu() {
    document.querySelector("#navbar-content")?.classList.remove("open");
    document
      .querySelector("#mobile-menu-button")
      ?.setAttribute("aria-expanded", "false");
  }

  function toggleMobileMenu() {
    const button = document.querySelector("#mobile-menu-button");
    const content = document.querySelector("#navbar-content");

    if (!button || !content) return;

    content.classList.toggle("open");
    button.setAttribute(
      "aria-expanded",
      String(content.classList.contains("open")),
    );
  }

  async function hydrateUser() {
    try {
      currentUser = await window.SilipMuntiSession?.getCurrentUser();
    } catch (error) {
      currentUser = null;
    }

    const guestActions = document.querySelector("#guest-actions");
    const userActions = document.querySelector("#user-actions");

    if (!currentUser) {
      guestActions?.classList.remove("hidden");
      userActions?.classList.add("hidden");
      return;
    }

    guestActions?.classList.add("hidden");
    userActions?.classList.remove("hidden");

    const fullName =
      `${currentUser.first_name ?? ""} ${currentUser.last_name ?? ""}`.trim() ||
      "User";
    const role = currentUser.role || "user";
    const profileUrl = getProfileUrl(currentUser.profile_picture);
    const navbarPicture = document.querySelector("#navbar-profile-picture");
    const dropdownPicture = document.querySelector("#dropdown-profile-picture");

    document.querySelector("#dropdown-user-name").textContent = fullName;
    document.querySelector("#dropdown-user-role").textContent = role;

    if (navbarPicture) navbarPicture.src = profileUrl;
    if (dropdownPicture) dropdownPicture.src = profileUrl;

    setImageFallback(navbarPicture);
    setImageFallback(dropdownPicture);
    showRoleMenus(role);
  }

  async function loadNotificationCount() {
    const countElement = document.querySelector("#notification-count");

    if (!countElement || !currentUser) return;

    try {
      const response = await fetch(endpoints.notifications, {
        credentials: "include",
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to load notifications.");
      }

      const count = Number(result.data?.unread_count || 0);

      countElement.textContent = count > 99 ? "99+" : String(count);
      countElement.classList.toggle("hidden", count < 1);
    } catch (error) {
      countElement.classList.add("hidden");
    }
  }

  async function logout() {
    if (!window.SilipMuntiSession?.logoutUser) {
      alert("Logout service is unavailable. Please refresh the page.");
      return;
    }

    await window.SilipMuntiSession.logoutUser();
  }

  function setupEvents() {
    document.addEventListener("click", (event) => {
      const target = event.target;

      if (target.closest("#mobile-menu-button")) {
        event.preventDefault();
        toggleMobileMenu();
        return;
      }

      if (target.closest("#profile-menu-button")) {
        event.preventDefault();
        event.stopPropagation();
        toggleProfileDropdown();
        return;
      }

      if (target.closest("#logout-button")) {
        event.preventDefault();
        logout();
        return;
      }

      if (target.closest("#notification-button")) {
        event.preventDefault();
        closeMobileMenu();
        closeProfileDropdown();
        return;
      }

      if (!target.closest(".profile-menu")) {
        closeProfileDropdown();
      }

      if (
        !target.closest("#navbar-content") &&
        !target.closest("#mobile-menu-button")
      ) {
        closeMobileMenu();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeProfileDropdown();
        closeMobileMenu();
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 900) {
        closeMobileMenu();
      }
    });
  }

  async function initialize() {
    if (initialized) return;
    initialized = true;

    setupEvents();
    await hydrateUser();
    await loadNotificationCount();
  }

  return {
    initialize,
    getDashboardUrl,
  };
})();

window.SilipMuntiSiteNavbar = SilipMuntiSiteNavbar;

if (document.querySelector("site-navbar")) {
  window.SilipMuntiSiteNavbar.initialize();
}
