class LandlordSidebar extends HTMLElement {
  connectedCallback() {
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
            <span class="sidebar-count" id="sidebar-listing-count">0</span>
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
            <span class="sidebar-count hidden" id="sidebar-message-count">0</span>
          </a>

          <a
            href="/SilipMunti/frontend/pages/landlord/inquiries.html"
            class="sidebar-link${isActive("inquiries")}"
          >
            <i class="fa-solid fa-clipboard-question"></i>
            <span>Inquiries</span>
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
      new CustomEvent("landlord-sidebar-ready", {
        bubbles: true,
      }),
    );

    window.SilipMuntiLandlordShell?.initialize();
  }
}

if (!customElements.get("landlord-sidebar")) {
  customElements.define("landlord-sidebar", LandlordSidebar);
}

const SilipMuntiLandlordShell = (() => {
  let initialized = false;

  function closeSidebar() {
    document.body.classList.remove("sidebar-open");
    document.querySelector("#dashboard-sidebar")?.classList.remove("open");
  }

  function openSidebar() {
    document.body.classList.add("sidebar-open");
    document.querySelector("#dashboard-sidebar")?.classList.add("open");
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
      window.alert("Logout service is unavailable. Please refresh the page.");
      return;
    }

    await sessionManager.logoutUser();
  }

  function initialize() {
    if (initialized) return;
    initialized = true;

    document.addEventListener("click", (event) => {
      const target = event.target;

      if (target.closest("#sidebar-toggle")) {
        event.preventDefault();
        openSidebar();
        return;
      }

      if (target.closest("#sidebar-close")) {
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

      const sidebar = document.querySelector("#dashboard-sidebar");
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

      if (
        document.body.classList.contains("sidebar-open") &&
        !sidebar?.contains(target)
      ) {
        closeSidebar();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeProfileDropdown();
        closeSidebar();
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 960) closeSidebar();
    });
  }

  function setCount(selector, value) {
    const element = document.querySelector(selector);
    if (!element) return;

    const count = Math.max(0, Number(value) || 0);
    element.textContent = count > 99 ? "99+" : String(count);
    element.classList.toggle("hidden", count < 1);
  }

  return {
    initialize,
    closeSidebar,
    closeProfileDropdown,
    setListingCount: (value) => setCount("#sidebar-listing-count", value),
    setMessageCount: (value) => setCount("#sidebar-message-count", value),
  };
})();

window.SilipMuntiLandlordShell = SilipMuntiLandlordShell;
SilipMuntiLandlordShell.initialize();
