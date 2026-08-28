class AdminSidebar extends HTMLElement {
  connectedCallback() {
    const activePage = this.getAttribute("active-page") || "";

    const isActive = (page) =>
      activePage === page ? ' active" aria-current="page' : "";

    this.innerHTML = `
      <aside class="admin-sidebar" id="admin-sidebar">
        <div class="admin-sidebar-header">
          <a href="/SilipMunti/frontend/index.html" class="admin-logo">
            <img
              src="/SilipMunti/frontend/assets/images/SilipMunti.png"
              alt="SilipMunti logo"
            />
          </a>

          <button
            type="button"
            class="admin-sidebar-close"
            id="admin-sidebar-close"
            aria-label="Close sidebar"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <nav class="admin-navigation" aria-label="Admin navigation">
          <span class="admin-nav-label">GENERAL</span>

          <a
            href="/SilipMunti/frontend/pages/admin/dashboard.html"
            class="admin-nav-link${isActive("dashboard")}"
          >
            <i class="fa-solid fa-table-columns"></i>
            <span>Dashboard</span>
          </a>

          <a
            href="/SilipMunti/frontend/pages/admin/verifications.html"
            class="admin-nav-link${isActive("verifications")}"
          >
            <i class="fa-solid fa-file-shield"></i>
            <span>Verifications</span>
            <span class="admin-count hidden" id="pending-count">0</span>
          </a>

          <a
            href="/SilipMunti/frontend/pages/admin/listings.html"
            class="admin-nav-link${isActive("listings")}"
          >
            <i class="fa-solid fa-building"></i>
            <span>Listings</span>
          </a>

          <a
            href="/SilipMunti/frontend/pages/admin/users.html"
            class="admin-nav-link${isActive("users")}"
          >
            <i class="fa-solid fa-users"></i>
            <span>Users</span>
          </a>

          <a
            href="/SilipMunti/frontend/pages/admin/rental-types.html"
            class="admin-nav-link${isActive("rental-types")}"
          >
            <i class="fa-solid fa-tags"></i>
            <span>Rental Types</span>
          </a>

          <span class="admin-nav-label account-label">ACCOUNT</span>

          <a
            href="/SilipMunti/frontend/pages/profile/index.html"
            class="admin-nav-link${isActive("profile")}"
          >
            <i class="fa-solid fa-user"></i>
            <span>Profile</span>
          </a>

          <button
            type="button"
            class="admin-nav-link logout-link"
            id="logout-button"
          >
            <i class="fa-solid fa-right-from-bracket"></i>
            <span>Logout</span>
          </button>
        </nav>

        <div class="admin-sidebar-footer">
          <a href="/SilipMunti/frontend/index.html">
            <i class="fa-solid fa-arrow-left"></i>
            <span>Back to Website</span>
          </a>
        </div>
      </aside>
    `;

    this.dispatchEvent(
      new CustomEvent("admin-sidebar-ready", {
        bubbles: true,
      }),
    );

    window.SilipMuntiAdminShell?.initialize();
  }
}

if (!customElements.get("admin-sidebar")) {
  customElements.define("admin-sidebar", AdminSidebar);
}

const SilipMuntiAdminShell = (() => {
  let initialized = false;

  function closeSidebar() {
    document.body.classList.remove("admin-sidebar-open");
  }

  function openSidebar() {
    document.body.classList.add("admin-sidebar-open");
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

      if (target.closest("#admin-sidebar-toggle")) {
        event.preventDefault();
        openSidebar();
        return;
      }

      if (target.closest("#admin-sidebar-close")) {
        event.preventDefault();
        closeSidebar();
        return;
      }

      if (target.closest("#logout-button")) {
        event.preventDefault();
        logout();
        return;
      }

      const sidebar = document.querySelector("#admin-sidebar");

      if (
        document.body.classList.contains("admin-sidebar-open") &&
        !sidebar?.contains(target)
      ) {
        closeSidebar();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeSidebar();
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 960) {
        closeSidebar();
      }
    });
  }

  function setPendingCount(value) {
    const element = document.querySelector("#pending-count");

    if (!element) return;

    const count = Math.max(0, Number(value) || 0);

    element.textContent = count > 99 ? "99+" : String(count);
    element.classList.toggle("hidden", count < 1);
  }

  return {
    initialize,
    closeSidebar,
    setPendingCount,
  };
})();

window.SilipMuntiAdminShell = SilipMuntiAdminShell;
