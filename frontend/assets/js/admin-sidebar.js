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

          <a
            href="/SilipMunti/frontend/pages/admin/reports.html"
            class="admin-nav-link${isActive("reports")}"
          >
            <i class="fa-solid fa-chart-column"></i>
            <span>Reports</span>
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
  let pendingCountRequest = null;
  const pendingCountEndpoint =
    "/SilipMunti/backend/admin/get-pending-verification-count.php";

  function getToggleButton() {
    return document.querySelector("#admin-sidebar-toggle");
  }

  function getSidebar() {
    return document.querySelector("#admin-sidebar");
  }

  function ensureBackdrop() {
    let backdrop = document.querySelector("#admin-sidebar-backdrop");

    if (backdrop) return backdrop;

    backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.id = "admin-sidebar-backdrop";
    backdrop.className = "admin-sidebar-backdrop";
    backdrop.setAttribute("aria-label", "Close admin navigation");
    document.body.appendChild(backdrop);

    return backdrop;
  }

  function updateAccessibility(isOpen) {
    getToggleButton()?.setAttribute("aria-expanded", String(isOpen));
    getSidebar()?.setAttribute(
      "aria-hidden",
      String(!isOpen && window.innerWidth <= 960),
    );
  }

  function closeSidebar() {
    document.body.classList.remove("admin-sidebar-open");
    updateAccessibility(false);
  }

  function openSidebar() {
    ensureBackdrop();
    document.body.classList.add("admin-sidebar-open");
    updateAccessibility(true);
    document.querySelector("#admin-sidebar-close")?.focus();
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

    ensureBackdrop();
    updateAccessibility(false);
    refreshPendingCount();

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

      if (target.closest("#admin-sidebar-backdrop")) {
        event.preventDefault();
        closeSidebar();
        getToggleButton()?.focus();
        return;
      }

      if (target.closest("#logout-button")) {
        event.preventDefault();
        logout();
        return;
      }

      const sidebar = document.querySelector("#admin-sidebar");

      if (
        window.innerWidth <= 960 &&
        target.closest("#admin-sidebar .admin-nav-link")
      ) {
        closeSidebar();
        return;
      }

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
        getSidebar()?.removeAttribute("aria-hidden");
      } else {
        updateAccessibility(
          document.body.classList.contains("admin-sidebar-open"),
        );
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

  async function refreshPendingCount() {
    if (!document.querySelector("#pending-count")) return;
    if (pendingCountRequest) return pendingCountRequest;

    pendingCountRequest = fetch(pendingCountEndpoint, {
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    })
      .then(async (response) => {
        const result = await response.json();

        if (response.ok && result.success) {
          setPendingCount(result.data?.pending);
        }
      })
      .catch(() => {})
      .finally(() => {
        pendingCountRequest = null;
      });

    return pendingCountRequest;
  }

  function getInitials(firstName, lastName) {
    const initials = `${String(firstName ?? "").charAt(0)}${String(
      lastName ?? "",
    ).charAt(0)}`.toUpperCase();

    return initials || "A";
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

  function setAdminProfile(user = {}) {
    const fullName = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
    const displayName = fullName || "Admin";
    const avatar = document.querySelector("#admin-profile-avatar");
    const picture = document.querySelector("#admin-profile-picture");
    const initialsElement = document.querySelector("#admin-profile-initials");
    const nameElement = document.querySelector("#admin-name");

    if (nameElement) nameElement.textContent = displayName;
    if (!avatar || !picture || !initialsElement) return;

    initialsElement.textContent = getInitials(user.first_name, user.last_name);
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

  return {
    initialize,
    closeSidebar,
    setAdminProfile,
    setPendingCount,
    refreshPendingCount,
  };
})();

window.SilipMuntiAdminShell = SilipMuntiAdminShell;

function initializeAdminShell() {
  window.SilipMuntiAdminShell?.initialize();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeAdminShell, {
    once: true,
  });
} else {
  initializeAdminShell();
}
