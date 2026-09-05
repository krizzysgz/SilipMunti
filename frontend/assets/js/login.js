const BASE_URL = "/SilipMunti";

const loginForm = document.querySelector("#login-form");
const loginButton = document.querySelector("#login-button");
const passwordToggle = document.querySelector("#password-toggle");
const passwordInput = document.querySelector("#password");
const formMessage = document.querySelector("#form-message");
const turnstileSection = document.querySelector("#turnstile-section");
const turnstileError = document.querySelector("#turnstile-error");

const DASHBOARD_URLS = {
  admin: `${BASE_URL}/frontend/pages/admin/dashboard.html`,
  landlord: `${BASE_URL}/frontend/pages/landlord/dashboard.html`,
  renter: `${BASE_URL}/frontend/index.html`,
};

const LOGIN_RETURN_KEY = "silip_munti_redirect";

let isLoading = false;
let securityReady = false;
let turnstileRequired = false;
let turnstileToken = "";
let turnstileWidgetId = null;

function getDashboardUrl(role) {
  return DASHBOARD_URLS[role] || `${BASE_URL}/frontend/index.html`;
}

function normalizeReturnUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(String(value), window.location.origin);
    const frontendPath = `${BASE_URL}/frontend/`;

    if (
      url.origin !== window.location.origin ||
      !url.pathname.startsWith(frontendPath) ||
      url.pathname.endsWith("/pages/auth/login.html")
    ) {
      return null;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch (error) {
    return null;
  }
}

function getPostLoginUrl(role) {
  const parameters = new URLSearchParams(window.location.search);
  const queryReturn = normalizeReturnUrl(parameters.get("return_to"));
  const storedReturn = normalizeReturnUrl(
    sessionStorage.getItem(LOGIN_RETURN_KEY),
  );
  const returnUrl = queryReturn || storedReturn;

  sessionStorage.removeItem(LOGIN_RETURN_KEY);

  return returnUrl || getDashboardUrl(role);
}

function showMessage(message, type) {
  formMessage.textContent = message;
  formMessage.className = `form-message ${type}`;
}

function hideMessage() {
  formMessage.textContent = "";
  formMessage.className = "form-message hidden";
}

function clearErrors() {
  document.querySelectorAll(".field-error").forEach((element) => {
    element.textContent = "";
  });

  document.querySelectorAll(".invalid").forEach((input) => {
    input.classList.remove("invalid");
  });
}

function showFieldErrors(errors) {
  if (!errors) return;

  Object.entries(errors).forEach(([field, message]) => {
    const input = loginForm.elements[field];
    const errorElement = document.querySelector(`[data-error-for="${field}"]`);

    if (input) input.classList.add("invalid");
    if (errorElement) errorElement.textContent = message;
  });
}

function updateSubmitState() {
  const challengeIncomplete = turnstileRequired && turnstileToken === "";

  loginButton.disabled = isLoading || !securityReady || challengeIncomplete;

  const buttonText = loginButton.querySelector("span");

  if (!buttonText) return;

  if (isLoading) {
    buttonText.textContent = "Signing in...";
  } else if (!securityReady) {
    buttonText.textContent = "Preparing secure sign in...";
  } else {
    buttonText.textContent = "Sign In";
  }
}

function setLoading(loading) {
  isLoading = loading;
  updateSubmitState();
}

function setupPasswordToggle() {
  if (!passwordToggle || !passwordInput) return;

  passwordToggle.addEventListener("click", () => {
    const passwordIsVisible = passwordInput.type === "text";

    passwordInput.type = passwordIsVisible ? "password" : "text";
    passwordToggle.innerHTML = passwordIsVisible
      ? '<i class="fa-solid fa-eye"></i>'
      : '<i class="fa-solid fa-eye-slash"></i>';
    passwordToggle.setAttribute(
      "aria-label",
      passwordIsVisible ? "Show password" : "Hide password",
    );
  });
}

async function readJsonResponse(response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch (error) {
    console.error("Invalid JSON response:", text);

    return {
      success: false,
      message: "The server returned an invalid response.",
    };
  }
}

function resetTurnstileChallenge() {
  turnstileToken = "";

  if (turnstileRequired && turnstileWidgetId !== null && window.turnstile) {
    window.turnstile.reset(turnstileWidgetId);
  }

  updateSubmitState();
}

async function initializeTurnstile() {
  try {
    const response = await fetch(
      `${BASE_URL}/backend/security/turnstile-config.php`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        credentials: "same-origin",
        cache: "no-store",
      },
    );

    const result = await readJsonResponse(response);

    if (!response.ok || !result.success) {
      throw new Error(
        result.message || "Unable to load security verification.",
      );
    }

    turnstileRequired = result.data?.enabled === true;

    if (!turnstileRequired) {
      turnstileSection.hidden = true;
      securityReady = true;
      updateSubmitState();
      return;
    }

    const siteKey = String(result.data?.site_key || "").trim();

    if (!siteKey || !window.turnstile) {
      throw new Error("Turnstile is unavailable.");
    }

    turnstileSection.hidden = false;

    turnstileWidgetId = window.turnstile.render("#turnstile-widget", {
      sitekey: siteKey,
      action: "login",
      theme: "auto",
      size: "flexible",
      callback(token) {
        turnstileToken = token;
        turnstileError.textContent = "";
        updateSubmitState();
      },
      "expired-callback"() {
        turnstileToken = "";
        turnstileError.textContent =
          "Security verification expired. Please try again.";
        updateSubmitState();
      },
      "timeout-callback"() {
        turnstileToken = "";
        turnstileError.textContent =
          "Security verification timed out. Please try again.";
        updateSubmitState();
      },
      "error-callback"() {
        turnstileToken = "";
        turnstileError.textContent =
          "Security verification failed to load. Please refresh the page.";
        updateSubmitState();
      },
    });

    securityReady = true;
    updateSubmitState();
  } catch (error) {
    console.error(error);
    turnstileSection.hidden = true;
    securityReady = false;
    updateSubmitState();
    showMessage(
      "Secure sign in is temporarily unavailable. Please refresh the page.",
      "error",
    );
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearErrors();
  hideMessage();

  if (!securityReady) {
    showMessage(
      "Secure sign in is not ready. Please refresh the page.",
      "error",
    );
    return;
  }

  if (turnstileRequired && turnstileToken === "") {
    turnstileError.textContent = "Please complete the security verification.";
    return;
  }

  setLoading(true);

  const loginData = {
    email: loginForm.email.value.trim(),
    password: loginForm.password.value,
    turnstile_token: turnstileToken,
  };

  try {
    const response = await fetch(`${BASE_URL}/backend/auth/login.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "include",
      body: JSON.stringify(loginData),
    });

    const result = await readJsonResponse(response);

    if (!response.ok || !result.success) {
      showFieldErrors(result.errors);
      showMessage(result.message || "Unable to sign in.", "error");
      resetTurnstileChallenge();
      return;
    }

    const user = result.data?.user;

    if (!user || !user.role) {
      showMessage("Login successful, but user role was not found.", "error");
      resetTurnstileChallenge();
      return;
    }

    showMessage(result.message || "Login successful.", "success");

    const destination = getPostLoginUrl(user.role);

    window.setTimeout(() => {
      window.location.href = destination;
    }, 600);
  } catch (error) {
    console.error(error);
    showMessage(
      "Unable to connect to the server. Check if Apache and the backend path are running.",
      "error",
    );
    resetTurnstileChallenge();
  } finally {
    setLoading(false);
  }
});

setupPasswordToggle();
updateSubmitState();
initializeTurnstile();
