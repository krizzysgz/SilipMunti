const BASE_URL = "/SilipMunti";

const loginForm = document.querySelector("#login-form");
const loginButton = document.querySelector("#login-button");
const passwordToggle = document.querySelector("#password-toggle");
const passwordInput = document.querySelector("#password");
const formMessage = document.querySelector("#form-message");

const DASHBOARD_URLS = {
  admin: `${BASE_URL}/frontend/pages/admin/dashboard.html`,
  landlord: `${BASE_URL}/frontend/pages/landlord/dashboard.html`,
  renter: `${BASE_URL}/frontend/index.html`,
};

function getDashboardUrl(role) {
  return DASHBOARD_URLS[role] || `${BASE_URL}/frontend/index.html`;
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

function setLoading(loading) {
  loginButton.disabled = loading;

  const buttonText = loginButton.querySelector("span");

  if (buttonText) {
    buttonText.textContent = loading ? "Signing in..." : "Sign In";
  }
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
      message:
        "Server returned an invalid response. Check PHP errors in login.php.",
    };
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  clearErrors();
  hideMessage();
  setLoading(true);

  const loginData = {
    email: loginForm.email.value.trim(),
    password: loginForm.password.value,
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
      return;
    }

    const user = result.data?.user;

    if (!user || !user.role) {
      showMessage("Login successful, but user role was not found.", "error");
      return;
    }

    showMessage(result.message || "Login successful.", "success");

    window.setTimeout(() => {
      window.location.href = getDashboardUrl(user.role);
    }, 600);
  } catch (error) {
    console.error(error);
    showMessage(
      "Unable to connect to the server. Check if Apache and the backend path are running.",
      "error",
    );
  } finally {
    setLoading(false);
  }
});

setupPasswordToggle();
