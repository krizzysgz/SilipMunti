const SESSION_STATUS_API = "/SilipMunti/backend/auth/status.php";
const LOGOUT_API = "/SilipMunti/backend/auth/logout.php";
const CSRF_TOKEN_API = "/SilipMunti/backend/auth/csrf-token.php";

const FRONTEND_BASE = "/SilipMunti/frontend";
const BACKEND_BASE = "/SilipMunti/backend";

const LOGIN_RETURN_KEY = "silip_munti_redirect";

let cachedUser = null;
let sessionLoaded = false;
let sessionRequest = null;
let cachedCsrfToken = null;
let csrfTokenRequest = null;

function clearCsrfToken() {
  cachedCsrfToken = null;
  csrfTokenRequest = null;
}

async function getCsrfToken(forceRefresh = false) {
  if (!forceRefresh && cachedCsrfToken) {
    return cachedCsrfToken;
  }

  if (!forceRefresh && csrfTokenRequest) {
    return csrfTokenRequest;
  }

  csrfTokenRequest = (async () => {
    const response = await fetch(CSRF_TOKEN_API, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      credentials: "include",
      cache: "no-store",
    });

    const text = await response.text();
    let result;

    try {
      result = text ? JSON.parse(text) : {};
    } catch (error) {
      throw new Error("The server returned an invalid security response.");
    }

    if (!response.ok || !result.success) {
      throw new Error(
        result.message || "Unable to initialize request security.",
      );
    }

    const token = String(result.data?.csrf_token || "").trim();

    if (!/^[a-f0-9]{64}$/.test(token)) {
      throw new Error("The server returned an invalid security token.");
    }

    cachedCsrfToken = token;
    return token;
  })();

  try {
    return await csrfTokenRequest;
  } finally {
    csrfTokenRequest = null;
  }
}

function isSafeRequestMethod(method) {
  return ["GET", "HEAD", "OPTIONS"].includes(
    String(method || "GET").toUpperCase(),
  );
}

function isSilipMuntiBackendUrl(value) {
  try {
    const url = new URL(String(value), window.location.origin);

    return (
      url.origin === window.location.origin &&
      url.pathname.startsWith(`${BACKEND_BASE}/`)
    );
  } catch (error) {
    return false;
  }
}

async function secureFetch(url, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const requestOptions = {
    ...options,
    method,
    credentials: options.credentials || "include",
  };

  if (isSafeRequestMethod(method)) {
    return fetch(url, requestOptions);
  }

  if (!isSilipMuntiBackendUrl(url)) {
    throw new Error(
      "Protected requests can only be sent to the SilipMunti backend.",
    );
  }

  const sendRequest = async (forceRefresh = false) => {
    const token = await getCsrfToken(forceRefresh);
    const headers = new Headers(options.headers || {});

    headers.set("X-CSRF-Token", token);

    return fetch(url, {
      ...requestOptions,
      headers,
    });
  };

  let response = await sendRequest(false);

  if (response.status === 419) {
    clearCsrfToken();
    response = await sendRequest(true);
  }

  return response;
}

async function getCurrentUser(forceRefresh = false) {
  if (!forceRefresh && sessionLoaded) {
    return cachedUser;
  }

  if (!forceRefresh && sessionRequest) {
    return sessionRequest;
  }

  sessionRequest = (async () => {
    try {
      const response = await fetch(SESSION_STATUS_API, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        cachedUser = null;
        return null;
      }

      cachedUser = result.data?.authenticated
        ? (result.data?.user ?? null)
        : null;

      return cachedUser;
    } catch (error) {
      cachedUser = null;
      return null;
    } finally {
      sessionLoaded = true;
      sessionRequest = null;
    }
  })();

  return sessionRequest;
}

function getCurrentPageUrl() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function normalizeReturnUrl(value) {
  if (!value) {
    return `${FRONTEND_BASE}/index.html`;
  }

  try {
    const url = new URL(String(value), window.location.origin);

    if (
      url.origin !== window.location.origin ||
      !url.pathname.startsWith(`${FRONTEND_BASE}/`)
    ) {
      return `${FRONTEND_BASE}/index.html`;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch (error) {
    return `${FRONTEND_BASE}/index.html`;
  }
}

function rememberLoginReturn(returnUrl = getCurrentPageUrl()) {
  const safeReturnUrl = normalizeReturnUrl(returnUrl);
  sessionStorage.setItem(LOGIN_RETURN_KEY, safeReturnUrl);
  return safeReturnUrl;
}

function getLoginUrl(returnUrl = getCurrentPageUrl()) {
  const safeReturnUrl = rememberLoginReturn(returnUrl);
  return `${FRONTEND_BASE}/pages/auth/login.html?return_to=${encodeURIComponent(safeReturnUrl)}`;
}

function redirectToLogin(returnUrl = getCurrentPageUrl()) {
  window.location.href = getLoginUrl(returnUrl);
}

function closeLoginPrompt() {
  const prompt = document.querySelector("#sm-login-prompt");

  if (!prompt) return;

  prompt.classList.add("hidden");
  document.body.classList.remove("sm-auth-prompt-open");
}

function ensureLoginPrompt() {
  let prompt = document.querySelector("#sm-login-prompt");

  if (prompt) return prompt;

  prompt = document.createElement("div");
  prompt.id = "sm-login-prompt";
  prompt.className = "sm-auth-prompt hidden";
  prompt.setAttribute("role", "dialog");
  prompt.setAttribute("aria-modal", "true");
  prompt.setAttribute("aria-labelledby", "sm-login-prompt-title");
  prompt.innerHTML = `
    <button
      class="sm-auth-prompt-backdrop"
      type="button"
      data-sm-auth-close
      aria-label="Close sign in prompt"
    ></button>
    <section class="sm-auth-prompt-card">
      <button
        class="sm-auth-prompt-close"
        type="button"
        data-sm-auth-close
        aria-label="Close"
      >
        <i class="fa-solid fa-xmark"></i>
      </button>
      <span class="sm-auth-prompt-icon" aria-hidden="true">
        <i class="fa-solid fa-user-lock"></i>
      </span>
      <p class="sm-auth-prompt-label">SilipMunti account</p>
      <h2 id="sm-login-prompt-title">Sign in to continue</h2>
      <p id="sm-login-prompt-message">
        Sign in using your renter account to continue this action.
      </p>
      <div class="sm-auth-prompt-actions">
        <button type="button" class="sm-auth-prompt-cancel" data-sm-auth-close>
          Continue browsing
        </button>
        <a class="sm-auth-prompt-login" id="sm-login-prompt-link" href="#">
          Sign in
          <i class="fa-solid fa-arrow-right"></i>
        </a>
      </div>
      <p class="sm-auth-prompt-register">
        New to SilipMunti?
        <a href="${FRONTEND_BASE}/pages/auth/register.html">Create an account</a>
      </p>
    </section>
  `;

  prompt.addEventListener("click", (event) => {
    if (event.target.closest("[data-sm-auth-close]")) {
      closeLoginPrompt();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !prompt.classList.contains("hidden")) {
      closeLoginPrompt();
    }
  });

  document.body.appendChild(prompt);
  return prompt;
}

function showLoginPrompt(options = {}) {
  const prompt = ensureLoginPrompt();
  const title = options.title || "Sign in to continue";
  const message =
    options.message ||
    "Sign in using your renter account to continue this action.";
  const returnUrl = options.returnUrl || getCurrentPageUrl();
  const loginUrl = getLoginUrl(returnUrl);

  prompt.querySelector("#sm-login-prompt-title").textContent = title;
  prompt.querySelector("#sm-login-prompt-message").textContent = message;
  prompt.querySelector("#sm-login-prompt-link").href = loginUrl;
  prompt.classList.remove("hidden");
  document.body.classList.add("sm-auth-prompt-open");
  prompt.querySelector("#sm-login-prompt-link")?.focus();
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
    return `${FRONTEND_BASE}/assets/images/default-profile.svg`;
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
      navbarPicture.src = `${FRONTEND_BASE}/assets/images/default-profile.svg`;
    };
  }

  if (dropdownPicture) {
    dropdownPicture.src = profilePicture;
    dropdownPicture.alt = `${fullName}'s profile picture`;

    dropdownPicture.onerror = () => {
      dropdownPicture.src = `${FRONTEND_BASE}/assets/images/default-profile.svg`;
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

    const isHidden = profileDropdown.classList.contains("hidden");

    profileDropdown.classList.toggle("hidden");

    profileButton.setAttribute("aria-expanded", String(isHidden));
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
    const response = await secureFetch(LOGOUT_API, {
      method: "POST",
      credentials: "include",
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to log out.");
    }

    cachedUser = null;
    sessionLoaded = true;
    clearCsrfToken();

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
  getCsrfToken,
  clearCsrfToken,
  secureFetch,
  getCurrentPageUrl,
  normalizeReturnUrl,
  rememberLoginReturn,
  getLoginUrl,
  redirectToLogin,
  showLoginPrompt,
  closeLoginPrompt,
  getDashboardUrl,
  getProfilePictureUrl,
  logoutUser,
  updateUserInterface,
};

document.addEventListener("DOMContentLoaded", initializeSessionInterface);
