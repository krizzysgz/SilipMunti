const BASE_URL = "/SilipMunti";

const TURNSTILE_CONFIG_ENDPOINT = `${BASE_URL}/backend/security/turnstile-config.php`;
const SEND_OTP_ENDPOINT = `${BASE_URL}/backend/auth/send-registration-otp.php`;
const REGISTER_ENDPOINT = `${BASE_URL}/backend/auth/register.php`;

const registerForm = document.querySelector("#register-form");
const registerButton = document.querySelector("#register-button");
const formMessage = document.querySelector("#form-message");
const otpPanel = document.querySelector("#otp-panel");
const otpForm = document.querySelector("#otp-form");
const otpInput = document.querySelector("#otp");
const otpEmail = document.querySelector("#otp-email");
const verifyOtpButton = document.querySelector("#verify-otp-button");
const resendOtpButton = document.querySelector("#resend-otp-button");
const editDetailsButton = document.querySelector("#edit-details-button");
const firstNameInput = document.querySelector("#first-name");
const lastNameInput = document.querySelector("#last-name");
const emailInput = document.querySelector("#email");
const phoneNumberInput = document.querySelector("#phone-number");
const passwordInput = document.querySelector("#password");
const confirmPasswordInput = document.querySelector("#confirm-password");
const termsInput = document.querySelector("#terms");

const registrationTurnstileSection = document.querySelector(
  "#registration-turnstile-section",
);
const registrationTurnstileError = document.querySelector(
  "#registration-turnstile-error",
);
const resendTurnstileSection = document.querySelector(
  "#resend-turnstile-section",
);
const resendTurnstileError = document.querySelector("#resend-turnstile-error");

let pendingRegistrationData = null;
let resendCountdownTimer = null;
let resendRemainingSeconds = 0;
let resendRequestLoading = false;
let registerRequestLoading = false;

let turnstileEnabled = false;
let turnstileConfigReady = false;
let turnstileSiteKey = "";
let registrationTurnstileToken = "";
let resendTurnstileToken = "";
let registrationTurnstileWidgetId = null;
let resendTurnstileWidgetId = null;

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
    const input = document.querySelector(`[name="${field}"]`);
    const errorElement = document.querySelector(`[data-error-for="${field}"]`);

    input?.classList.add("invalid");

    if (errorElement) {
      errorElement.textContent = message;
    }
  });
}

function setButtonLoading(button, loading, loadingText, defaultText) {
  button.disabled = loading;

  const buttonText = button.querySelector("span");

  if (buttonText) {
    buttonText.textContent = loading ? loadingText : defaultText;
  }
}

function updateRegisterButton() {
  const challengeIncomplete =
    turnstileEnabled && registrationTurnstileToken === "";

  registerButton.disabled =
    registerRequestLoading || !turnstileConfigReady || challengeIncomplete;

  const buttonText = registerButton.querySelector("span");

  if (!buttonText) return;

  if (registerRequestLoading) {
    buttonText.textContent = "Sending code...";
  } else if (!turnstileConfigReady) {
    buttonText.textContent = "Preparing secure registration...";
  } else {
    buttonText.textContent = "Send Verification Code";
  }
}

function setRegisterLoading(loading) {
  registerRequestLoading = loading;
  updateRegisterButton();
}

function updateResendButton() {
  if (resendRequestLoading) {
    resendOtpButton.disabled = true;
    resendOtpButton.textContent = "Sending...";
    return;
  }

  if (resendRemainingSeconds > 0) {
    resendOtpButton.disabled = true;
    resendOtpButton.textContent = `Resend code in ${resendRemainingSeconds}s`;
    return;
  }

  if (!turnstileConfigReady) {
    resendOtpButton.disabled = true;
    resendOtpButton.textContent = "Preparing security check...";
    return;
  }

  if (turnstileEnabled && resendTurnstileToken === "") {
    resendOtpButton.disabled = true;
    resendOtpButton.textContent = "Complete security check";
    return;
  }

  resendOtpButton.disabled = false;
  resendOtpButton.textContent = "Resend code";
}

function getRegistrationData() {
  const selectedRole = registerForm.querySelector('input[name="role"]:checked');

  return {
    first_name: firstNameInput.value.trim(),
    last_name: lastNameInput.value.trim(),
    email: emailInput.value.trim(),
    phone_number: phoneNumberInput.value.trim(),
    password: passwordInput.value,
    confirm_password: confirmPasswordInput.value,
    role: selectedRole ? selectedRole.value : "",
  };
}

function maskEmail(email) {
  const [localPart = "", domain = ""] = String(email).split("@");
  const visiblePart = localPart.slice(0, Math.min(2, localPart.length));
  const hiddenPart = "*".repeat(Math.max(3, localPart.length - 2));

  return `${visiblePart}${hiddenPart}@${domain}`;
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

async function requestJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  const result = await readJsonResponse(response);

  if (!response.ok || !result?.success) {
    const error = new Error(
      result?.message || "Unable to complete the request.",
    );

    error.status = response.status;
    error.errors = result?.errors || {};
    error.data = result?.data || {};

    throw error;
  }

  return result;
}

function startResendCountdown(seconds = 60) {
  window.clearInterval(resendCountdownTimer);

  resendRemainingSeconds = Math.max(0, Number(seconds) || 0);
  updateResendButton();

  if (resendRemainingSeconds <= 0) return;

  resendCountdownTimer = window.setInterval(() => {
    resendRemainingSeconds = Math.max(0, resendRemainingSeconds - 1);

    updateResendButton();

    if (resendRemainingSeconds <= 0) {
      window.clearInterval(resendCountdownTimer);
    }
  }, 1000);
}

function resetRegistrationTurnstile() {
  registrationTurnstileToken = "";

  if (
    turnstileEnabled &&
    registrationTurnstileWidgetId !== null &&
    window.turnstile
  ) {
    window.turnstile.reset(registrationTurnstileWidgetId);
  }

  updateRegisterButton();
}

function resetResendTurnstile() {
  resendTurnstileToken = "";

  if (
    turnstileEnabled &&
    resendTurnstileWidgetId !== null &&
    window.turnstile
  ) {
    window.turnstile.reset(resendTurnstileWidgetId);
  }

  updateResendButton();
}

function renderRegistrationTurnstile() {
  registrationTurnstileSection.hidden = false;

  registrationTurnstileWidgetId = window.turnstile.render(
    "#registration-turnstile-widget",
    {
      sitekey: turnstileSiteKey,
      action: "registration_otp",
      theme: "auto",
      size: "flexible",
      callback(token) {
        registrationTurnstileToken = token;
        registrationTurnstileError.textContent = "";
        updateRegisterButton();
      },
      "expired-callback"() {
        registrationTurnstileToken = "";
        registrationTurnstileError.textContent =
          "Security verification expired. Please try again.";
        updateRegisterButton();
      },
      "timeout-callback"() {
        registrationTurnstileToken = "";
        registrationTurnstileError.textContent =
          "Security verification timed out. Please try again.";
        updateRegisterButton();
      },
      "error-callback"() {
        registrationTurnstileToken = "";
        registrationTurnstileError.textContent =
          "Security verification failed to load. Refresh the page.";
        updateRegisterButton();
      },
    },
  );
}

function prepareResendTurnstile() {
  resendTurnstileToken = "";

  if (!turnstileEnabled) {
    resendTurnstileSection.hidden = true;
    updateResendButton();
    return;
  }

  resendTurnstileSection.hidden = false;

  if (resendTurnstileWidgetId === null) {
    resendTurnstileWidgetId = window.turnstile.render(
      "#resend-turnstile-widget",
      {
        sitekey: turnstileSiteKey,
        action: "registration_otp",
        theme: "auto",
        size: "flexible",
        callback(token) {
          resendTurnstileToken = token;
          resendTurnstileError.textContent = "";
          updateResendButton();
        },
        "expired-callback"() {
          resendTurnstileToken = "";
          resendTurnstileError.textContent =
            "Security verification expired. Please try again.";
          updateResendButton();
        },
        "timeout-callback"() {
          resendTurnstileToken = "";
          resendTurnstileError.textContent =
            "Security verification timed out. Please try again.";
          updateResendButton();
        },
        "error-callback"() {
          resendTurnstileToken = "";
          resendTurnstileError.textContent =
            "Security verification failed to load. Refresh the page.";
          updateResendButton();
        },
      },
    );
  } else {
    window.turnstile.reset(resendTurnstileWidgetId);
  }

  updateResendButton();
}

async function initializeTurnstile() {
  try {
    const response = await fetch(TURNSTILE_CONFIG_ENDPOINT, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      credentials: "same-origin",
      cache: "no-store",
    });

    const result = await readJsonResponse(response);

    if (!response.ok || !result.success) {
      throw new Error(
        result.message || "Unable to load security verification.",
      );
    }

    turnstileEnabled = result.data?.enabled === true;

    if (!turnstileEnabled) {
      registrationTurnstileSection.hidden = true;
      resendTurnstileSection.hidden = true;
      turnstileConfigReady = true;
      updateRegisterButton();
      updateResendButton();
      return;
    }

    turnstileSiteKey = String(result.data?.site_key || "").trim();

    if (!turnstileSiteKey || !window.turnstile) {
      throw new Error("Turnstile is unavailable.");
    }

    renderRegistrationTurnstile();
    turnstileConfigReady = true;
    updateRegisterButton();
  } catch (error) {
    console.error(error);
    turnstileConfigReady = false;
    registrationTurnstileSection.hidden = true;
    resendTurnstileSection.hidden = true;
    updateRegisterButton();
    updateResendButton();
    showMessage(
      "Secure registration is temporarily unavailable. Refresh the page.",
      "error",
    );
  }
}

function showOtpStep(email, retryAfter = 60) {
  registerForm.classList.add("hidden");
  otpPanel.classList.remove("hidden");
  otpEmail.textContent = maskEmail(email);
  otpInput.value = "";
  otpInput.focus();
  prepareResendTurnstile();
  startResendCountdown(retryAfter);
}

function showRegistrationStep() {
  otpPanel.classList.add("hidden");
  registerForm.classList.remove("hidden");
  clearErrors();
  hideMessage();
  resetRegistrationTurnstile();
  emailInput.focus();
}

document.querySelectorAll("[data-password-target]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.passwordTarget);

    if (!input) return;

    const passwordIsVisible = input.type === "text";

    input.type = passwordIsVisible ? "password" : "text";
    button.innerHTML = passwordIsVisible
      ? '<i class="fa-solid fa-eye"></i>'
      : '<i class="fa-solid fa-eye-slash"></i>';
    button.setAttribute(
      "aria-label",
      passwordIsVisible ? "Show password" : "Hide password",
    );
  });
});

otpInput.addEventListener("input", () => {
  otpInput.value = otpInput.value.replace(/\D/g, "").slice(0, 6);
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearErrors();
  hideMessage();

  const registrationData = getRegistrationData();

  if (registrationData.password !== registrationData.confirm_password) {
    showFieldErrors({
      confirm_password: "Passwords do not match.",
    });
    return;
  }

  if (!termsInput.checked) {
    showMessage(
      "Please accept the Terms of Service and Privacy Policy.",
      "error",
    );
    return;
  }

  if (!turnstileConfigReady) {
    showMessage("Secure registration is not ready. Refresh the page.", "error");
    return;
  }

  if (turnstileEnabled && registrationTurnstileToken === "") {
    registrationTurnstileError.textContent =
      "Please complete the security verification.";
    return;
  }

  setRegisterLoading(true);

  try {
    const result = await requestJson(SEND_OTP_ENDPOINT, {
      ...registrationData,
      turnstile_token: registrationTurnstileToken,
    });

    pendingRegistrationData = registrationData;
    showMessage(result.message, "success");
    resetRegistrationTurnstile();
    showOtpStep(registrationData.email, result.data?.retry_after || 60);
  } catch (error) {
    showFieldErrors(error.errors);
    showMessage(error.message, "error");
    resetRegistrationTurnstile();
  } finally {
    setRegisterLoading(false);
  }
});

otpForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearErrors();
  hideMessage();

  if (!pendingRegistrationData) {
    showMessage("Enter your registration details again.", "error");
    showRegistrationStep();
    return;
  }

  const otp = otpInput.value.trim();

  if (!/^\d{6}$/.test(otp)) {
    showFieldErrors({
      otp: "Enter the 6-digit verification code.",
    });
    return;
  }

  setButtonLoading(
    verifyOtpButton,
    true,
    "Verifying...",
    "Verify and Create Account",
  );

  try {
    const result = await requestJson(REGISTER_ENDPOINT, {
      ...pendingRegistrationData,
      otp,
    });

    showMessage(result.message, "success");
    otpInput.disabled = true;
    resendOtpButton.disabled = true;
    editDetailsButton.disabled = true;

    window.setTimeout(() => {
      window.location.href = "login.html";
    }, 1200);
  } catch (error) {
    showFieldErrors(error.errors);
    showMessage(error.message, "error");
  } finally {
    setButtonLoading(
      verifyOtpButton,
      false,
      "Verifying...",
      "Verify and Create Account",
    );
  }
});

resendOtpButton.addEventListener("click", async () => {
  if (!pendingRegistrationData) {
    showRegistrationStep();
    return;
  }

  if (resendRemainingSeconds > 0 || resendRequestLoading) {
    return;
  }

  if (!turnstileConfigReady) {
    showMessage(
      "Security verification is not ready. Refresh the page.",
      "error",
    );
    return;
  }

  if (turnstileEnabled && resendTurnstileToken === "") {
    resendTurnstileError.textContent =
      "Please complete the security verification.";
    return;
  }

  clearErrors();
  hideMessage();
  resendRequestLoading = true;
  updateResendButton();

  try {
    const result = await requestJson(SEND_OTP_ENDPOINT, {
      ...pendingRegistrationData,
      turnstile_token: resendTurnstileToken,
    });

    showMessage(result.message, "success");
    resetResendTurnstile();
    startResendCountdown(result.data?.retry_after || 60);
  } catch (error) {
    showMessage(error.message, "error");
    resetResendTurnstile();

    if (error.status === 429 && error.data?.retry_after) {
      startResendCountdown(error.data.retry_after);
    } else {
      resendRemainingSeconds = 0;
    }
  } finally {
    resendRequestLoading = false;
    updateResendButton();
  }
});

editDetailsButton.addEventListener("click", showRegistrationStep);

updateRegisterButton();
updateResendButton();
initializeTurnstile();
