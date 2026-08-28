const SESSION_API = "/SilipMunti/backend/auth/user.php";
const LOGOUT_API = "/SilipMunti/backend/auth/logout.php";

const FRONTEND_BASE = "/SilipMunti/frontend";
const BACKEND_BASE = "/SilipMunti/backend";

async function getCurrentUser() {
  try {
    const response = await fetch(SESSION_API, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const result = await response.json();

    if (!result.success) {
      return null;
    }

    return result.data?.user ?? null;
  } catch (error) {
    return null;
  }
}

function getDashboardUrl(role) {
  const dashboards = {
    renter: `${FRONTEND_BASE}/index.html`,
    landlord: `${FRONTEND_BASE}/pages/landlord/dashboard.html`,
    admin: `${FRONTEND_BASE}/pages/admin/dashboard.html`,
  };

  return dashboards[role] ?? `${FRONTEND_BASE}/index.html`;
}

function getProfilePictureUrl(profilePicture) {
  if (!profilePicture) {
    return `${FRONTEND_BASE}/assets/images/default-profile.png`;
  }

  if (
    profilePicture.startsWith("http://") ||
    profilePicture.startsWith("https://") ||
    profilePicture.startsWith("/")
  ) {
    return profilePicture;
  }

  return `${BACKEND_BASE}/${profilePicture}`;
}

function formatRole(role) {
  if (!role) {
    return "User";
  }

  return role.charAt(0).toUpperCase() + role.slice(1);
}

function hideAllRoleMenus() {
  document.querySelector("#renter-menu")?.classList.add("hidden");
  document.querySelector("#landlord-menu")?.classList.add("hidden");
  document.querySelector("#admin-menu")?.classList.add("hidden");
}

function showRoleMenu(role) {
  hideAllRoleMenus();

  if (role === "renter") {
    document.querySelector("#renter-menu")?.classList.remove("hidden");
    return;
  }

  if (role === "landlord") {
    document.querySelector("#landlord-menu")?.classList.remove("hidden");
    return;
  }

  if (role === "admin") {
    document.querySelector("#admin-menu")?.classList.remove("hidden");
  }
}

function updateUserInterface(user) {
  const guestActions = document.querySelector("#guest-actions");
  const userActions = document.querySelector("#user-actions");

  if (!user) {
    guestActions?.classList.remove("hidden");
    userActions?.classList.add("hidden");
    hideAllRoleMenus();
    return;
  }

  guestActions?.classList.add("hidden");
  userActions?.classList.remove("hidden");

  const fullName =
    `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || "User";

  const role = user.role ?? "";
  const profilePicture = getProfilePictureUrl(user.profile_picture);

  const navbarPicture = document.querySelector("#navbar-profile-picture");

  const dropdownPicture = document.querySelector("#dropdown-profile-picture");

  const dropdownName = document.querySelector("#dropdown-user-name");

  const dropdownRole = document.querySelector("#dropdown-user-role");

  if (navbarPicture) {
    navbarPicture.src = profilePicture;
    navbarPicture.alt = `${fullName}'s profile picture`;

    navbarPicture.onerror = () => {
      navbarPicture.src = `${FRONTEND_BASE}/assets/images/default-profile.png`;
    };
  }

  if (dropdownPicture) {
    dropdownPicture.src = profilePicture;
    dropdownPicture.alt = `${fullName}'s profile picture`;

    dropdownPicture.onerror = () => {
      dropdownPicture.src = `${FRONTEND_BASE}/assets/images/default-profile.png`;
    };
  }

  if (dropdownName) {
    dropdownName.textContent = fullName;
  }

  if (dropdownRole) {
    dropdownRole.textContent = formatRole(role);
  }

  showRoleMenu(role);
}

function initializeProfileDropdown() {
  const profileButton = document.querySelector("#profile-menu-button");

  const profileDropdown = document.querySelector("#profile-dropdown");

  if (!profileButton || !profileDropdown) {
    return;
  }

 profileButton.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const isHidden =
    profileDropdown.classList.contains("hidden");

  profileDropdown.classList.toggle("hidden");

  profileButton.setAttribute(
    "aria-expanded",
    String(isHidden),
  );
});

  profileDropdown.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  document.addEventListener("click", () => {
    profileDropdown.classList.add("hidden");
    profileButton.setAttribute("aria-expanded", "false");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    profileDropdown.classList.add("hidden");
    profileButton.setAttribute("aria-expanded", "false");
  });
}

async function logoutUser() {
  try {
    const response = await fetch(LOGOUT_API, {
      method: "POST",
      credentials: "include",
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to log out.");
    }

    window.location.href = `${FRONTEND_BASE}/pages/auth/login.html`;
  } catch (error) {
    alert(error.message || "Unable to connect to the server.");
  }
}

function initializeLogout() {
  const logoutButton = document.querySelector("#logout-button");

  logoutButton?.addEventListener("click", logoutUser);
}

async function initializeSessionInterface() {
  initializeProfileDropdown();
  initializeLogout();

  const user = await getCurrentUser();

  updateUserInterface(user);

  window.dispatchEvent(
    new CustomEvent("silipmunti:user-ready", {
      detail: {
        user,
      },
    }),
  );

  return user;
}

window.SilipMuntiSession = {
  getCurrentUser,
  getDashboardUrl,
  getProfilePictureUrl,
  logoutUser,
  updateUserInterface,
};

document.addEventListener("DOMContentLoaded", initializeSessionInterface);
