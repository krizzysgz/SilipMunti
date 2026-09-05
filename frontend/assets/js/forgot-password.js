const BASE_URL = "/SilipMunti";

const TURNSTILE_CONFIG_ENDPOINT = `${BASE_URL}/backend/security/turnstile-config.php`;
const SEND_RESET_CODE_ENDPOINT = `${BASE_URL}/backend/auth/send-password-reset-otp.php`;
const RESET_PASSWORD_ENDPOINT = `${BASE_URL}/backend/auth/reset-password.php`;

const emailPanel = document.querySelector("#email-panel");
const resetPanel = document.querySelector("#reset-panel");
const successPanel = document.querySelector("#success-panel");
const emailForm = document.querySelector("#email-form");
const resetForm = document.querySelector("#reset-form");
const emailInput = document.querySelector("#email");
const otpInput = document.querySelector("#otp");
const newPasswordInput = document.querySelector("#new-password");
const confirmPasswordInput = document.querySelector("#confirm-password");
const sendCodeButton = document.querySelector("#send-code-button");
const resetPasswordButton = document.querySelector("#reset-password-button");
const resendCodeButton = document.querySelector("#resend-code-button");
const changeEmailButton = document.querySelector("#change-email-button");
const formMessage = document.querySelector("#form-message");
const resetEmailElement = document.querySelector("#reset-email");
const pageTitle = document.querySelector("#page-title");
const pageDescription = document.querySelector("#page-description");
const signinLink = document.querySelector("#signin-link");

const requestTurnstileSection = document.querySelector(
  "#reset-request-turnstile-section",
);
const requestTurnstileError = document.querySelector(
  "#reset-request-turnstile-error",
);
const resendTurnstileSection = document.querySelector(
  "#reset-resend-turnstile-section",
);
const resendTurnstileError = document.querySelector(
  "#reset-resend-turnstile-error",
);

let resetEmail = "";
let resendTimer = null;
let resendSeconds = 0;
let sendRequestLoading = false;
let resendRequestLoading = false;

let turnstileEnabled = false;
let turnstileConfigReady = false;
let turnstileSiteKey = "";
let requestTurnstileToken = "";
let resendTurnstileToken = "";
let requestTurnstileWidgetId = null;
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

  document.querySelectorAll(".invalid").forEach((element) => {
    element.classList.remove("invalid");
  });
}

function showFieldErrors(errors) {
  if (!errors) return;

  Object.entries(errors).forEach(([field, message]) => {
    const input = document.querySelector(`[name="${field}"]`);
    const errorElement = document.querySelector(`[data-error-for="${field}"]`);

    if (input) input.classList.add("invalid");
    if (errorElement) errorElement.textContent = message;
  });
}

function setButtonLoading(button, loading, loadingText, defaultText) {
  if (!button) return;

  button.disabled = loading;

  const textElement = button.querySelector("span");

  if (textElement) {
    textElement.textContent = loading ? loadingText : defaultText;
  }
}

function updateSendCodeButton() {
  const challengeIncomplete = turnstileEnabled && requestTurnstileToken === "";

  sendCodeButton.disabled =
    sendRequestLoading || !turnstileConfigReady || challengeIncomplete;

  const textElement = sendCodeButton.querySelector("span");

  if (!textElement) return;

  if (sendRequestLoading) {
    textElement.textContent = "Sending code...";
  } else if (!turnstileConfigReady) {
    textElement.textContent = "Preparing secure recovery...";
  } else {
    textElement.textContent = "Send Reset Code";
  }
}

function setSendRequestLoading(loading) {
  sendRequestLoading = loading;
  updateSendCodeButton();
}

function updateResendButton() {
  if (resendRequestLoading) {
    resendCodeButton.disabled = true;
    resendCodeButton.textContent = "Sending code...";
    return;
  }

  if (resendSeconds > 0) {
    resendCodeButton.disabled = true;
    resendCodeButton.textContent = `Resend code in ${resendSeconds}s`;
    return;
  }

  if (!turnstileConfigReady) {
    resendCodeButton.disabled = true;
    resendCodeButton.textContent = "Preparing security check...";
    return;
  }

  if (turnstileEnabled && resendTurnstileToken === "") {
    resendCodeButton.disabled = true;
    resendCodeButton.textContent = "Complete security check";
    return;
  }

  resendCodeButton.disabled = false;
  resendCodeButton.textContent = "Resend code";
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

async function requestJson(url, data) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify(data),
  });

  return {
    response,
    result: await readJsonResponse(response),
  };
}

function stopResendCountdown() {
  if (resendTimer !== null) {
    window.clearInterval(resendTimer);
    resendTimer = null;
  }

  resendSeconds = 0;
  updateResendButton();
}

function startResendCountdown(seconds = 60) {
  if (resendTimer !== null) {
    window.clearInterval(resendTimer);
  }

  resendSeconds = Math.max(0, Number(seconds) || 0);
  updateResendButton();

  if (resendSeconds <= 0) return;

  resendTimer = window.setInterval(() => {
    resendSeconds = Math.max(0, resendSeconds - 1);
    updateResendButton();

    if (resendSeconds <= 0) {
      window.clearInterval(resendTimer);
      resendTimer = null;
    }
  }, 1000);
}

function resetRequestTurnstile() {
  requestTurnstileToken = "";

  if (
    turnstileEnabled &&
    requestTurnstileWidgetId !== null &&
    window.turnstile
  ) {
    window.turnstile.reset(requestTurnstileWidgetId);
  }

  updateSendCodeButton();
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

function renderRequestTurnstile() {
  requestTurnstileSection.hidden = false;

  requestTurnstileWidgetId = window.turnstile.render(
    "#reset-request-turnstile-widget",
    {
      sitekey: turnstileSiteKey,
      action: "password_reset_otp",
      theme: "auto",
      size: "flexible",
      callback(token) {
        requestTurnstileToken = token;
        requestTurnstileError.textContent = "";
        updateSendCodeButton();
      },
      "expired-callback"() {
        requestTurnstileToken = "";
        requestTurnstileError.textContent =
          "Security verification expired. Please try again.";
        updateSendCodeButton();
      },
      "timeout-callback"() {
        requestTurnstileToken = "";
        requestTurnstileError.textContent =
          "Security verification timed out. Please try again.";
        updateSendCodeButton();
      },
      "error-callback"() {
        requestTurnstileToken = "";
        requestTurnstileError.textContent =
          "Security verification failed to load. Refresh the page.";
        updateSendCodeButton();
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
      "#reset-resend-turnstile-widget",
      {
        sitekey: turnstileSiteKey,
        action: "password_reset_otp",
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
      requestTurnstileSection.hidden = true;
      resendTurnstileSection.hidden = true;
      turnstileConfigReady = true;
      updateSendCodeButton();
      updateResendButton();
      return;
    }

    turnstileSiteKey = String(result.data?.site_key || "").trim();

    if (!turnstileSiteKey || !window.turnstile) {
      throw new Error("Turnstile is unavailable.");
    }

    renderRequestTurnstile();
    turnstileConfigReady = true;
    updateSendCodeButton();
  } catch (error) {
    console.error(error);
    turnstileConfigReady = false;
    requestTurnstileSection.hidden = true;
    resendTurnstileSection.hidden = true;
    updateSendCodeButton();
    updateResendButton();
    showMessage(
      "Secure password recovery is unavailable. Refresh the page.",
      "error",
    );
  }
}

function showEmailPanel() {
  emailPanel.classList.remove("hidden");
  resetPanel.classList.add("hidden");
  successPanel.classList.add("hidden");
  pageTitle.textContent = "Forgot Password?";
  pageDescription.textContent =
    "Enter your registered email to receive a reset code.";
  signinLink.classList.remove("hidden");
}

function showResetPanel() {
  emailPanel.classList.add("hidden");
  resetPanel.classList.remove("hidden");
  successPanel.classList.add("hidden");
  pageTitle.textContent = "Check Your Email";
  pageDescription.textContent =
    "Enter the verification code and choose a new password.";
  resetEmailElement.textContent = maskEmail(resetEmail);
  signinLink.classList.remove("hidden");
  prepareResendTurnstile();

  window.setTimeout(() => {
    otpInput.focus();
  }, 100);
}

function showSuccessPanel() {
  emailPanel.classList.add("hidden");
  resetPanel.classList.add("hidden");
  successPanel.classList.remove("hidden");
  pageTitle.textContent = "Reset Complete";
  pageDescription.textContent = "Your SilipMunti account is ready to use.";
  signinLink.classList.add("hidden");
}

function validateEmail() {
  const email = emailInput.value.trim();
  const errors = {};

  if (email === "") {
    errors.email = "Email is required.";
  } else if (email.length > 254) {
    errors.email = "Email address is too long.";
  } else if (!emailInput.checkValidity()) {
    errors.email = "Email address is invalid.";
  }

  return { email, errors };
}

function validateResetForm() {
  const otp = otpInput.value.trim();
  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  const errors = {};

  if (otp === "") {
    errors.otp = "Verification code is required.";
  } else if (!/^\d{6}$/.test(otp)) {
    errors.otp = "Verification code must contain exactly six digits.";
  }

  if (newPassword === "") {
    errors.new_password = "New password is required.";
  } else if (newPassword.length < 8) {
    errors.new_password = "New password must contain at least 8 characters.";
  } else if (newPassword.length > 255) {
    errors.new_password = "New password is too long.";
  }

  if (confirmPassword === "") {
    errors.confirm_password = "Password confirmation is required.";
  } else if (newPassword !== confirmPassword) {
    errors.confirm_password = "Passwords do not match.";
  }

  return {
    otp,
    newPassword,
    confirmPassword,
    errors,
  };
}

emailForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearErrors();
  hideMessage();

  const { email, errors } = validateEmail();

  if (Object.keys(errors).length > 0) {
    showFieldErrors(errors);
    return;
  }

  if (!turnstileConfigReady) {
    showMessage(
      "Secure password recovery is not ready. Refresh the page.",
      "error",
    );
    return;
  }

  if (turnstileEnabled && requestTurnstileToken === "") {
    requestTurnstileError.textContent =
      "Please complete the security verification.";
    return;
  }

  setSendRequestLoading(true);

  try {
    const { response, result } = await requestJson(SEND_RESET_CODE_ENDPOINT, {
      email,
      turnstile_token: requestTurnstileToken,
    });

    if (!response.ok || !result.success) {
      if (response.status === 429 && result.data?.retry_after) {
        resetEmail = email;
        resetRequestTurnstile();
        showResetPanel();
        startResendCountdown(result.data.retry_after);
        showMessage(
          result.message || "Please wait before requesting another code.",
          "error",
        );
        return;
      }

      showFieldErrors(result.errors);
      showMessage(
        result.message || "Unable to send the password reset code.",
        "error",
      );
      resetRequestTurnstile();
      return;
    }

    resetEmail = email;
    resetRequestTurnstile();
    showResetPanel();
    startResendCountdown(result.data?.retry_after || 60);
    showMessage(
      result.message || "If an active account exists, a reset code was sent.",
      "success",
    );
  } catch (error) {
    console.error(error);
    showMessage("Unable to connect to the server.", "error");
    resetRequestTurnstile();
  } finally {
    setSendRequestLoading(false);
  }
});

resetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearErrors();
  hideMessage();

  const { otp, newPassword, confirmPassword, errors } = validateResetForm();

  if (Object.keys(errors).length > 0) {
    showFieldErrors(errors);
    return;
  }

  if (resetEmail === "") {
    showEmailPanel();
    showMessage("Enter your email and request a new code.", "error");
    return;
  }

  setButtonLoading(
    resetPasswordButton,
    true,
    "Resetting password...",
    "Reset Password",
  );

  try {
    const { response, result } = await requestJson(RESET_PASSWORD_ENDPOINT, {
      email: resetEmail,
      otp,
      new_password: newPassword,
      confirm_password: confirmPassword,
    });

    if (!response.ok || !result.success) {
      showFieldErrors(result.errors);
      showMessage(result.message || "Unable to reset the password.", "error");

      if (response.status === 410 || response.status === 429) {
        stopResendCountdown();
      }

      return;
    }

    stopResendCountdown();
    resetForm.reset();
    hideMessage();
    showSuccessPanel();
  } catch (error) {
    console.error(error);
    showMessage("Unable to connect to the server.", "error");
  } finally {
    setButtonLoading(
      resetPasswordButton,
      false,
      "Resetting password...",
      "Reset Password",
    );
  }
});

resendCodeButton.addEventListener("click", async () => {
  if (resendCodeButton.disabled || resetEmail === "" || resendRequestLoading) {
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
    const { response, result } = await requestJson(SEND_RESET_CODE_ENDPOINT, {
      email: resetEmail,
      turnstile_token: resendTurnstileToken,
    });

    if (!response.ok || !result.success) {
      const retryAfter = result.data?.retry_after || 0;

      resetResendTurnstile();

      if (response.status === 429 && retryAfter > 0) {
        startResendCountdown(retryAfter);
      } else {
        resendSeconds = 0;
      }

      showMessage(
        result.message || "Unable to resend the verification code.",
        "error",
      );
      return;
    }

    otpInput.value = "";
    resetResendTurnstile();
    startResendCountdown(result.data?.retry_after || 60);
    showMessage(
      result.message || "If an active account exists, a new code was sent.",
      "success",
    );
    otpInput.focus();
  } catch (error) {
    console.error(error);
    resetResendTurnstile();
    resendSeconds = 0;
    showMessage("Unable to connect to the server.", "error");
  } finally {
    resendRequestLoading = false;
    updateResendButton();
  }
});

changeEmailButton.addEventListener("click", () => {
  stopResendCountdown();
  clearErrors();
  hideMessage();
  resetForm.reset();
  resetEmail = "";
  resetRequestTurnstile();
  showEmailPanel();
  emailInput.focus();
});

otpInput.addEventListener("input", () => {
  otpInput.value = otpInput.value.replace(/\D/g, "").slice(0, 6);
});

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

showEmailPanel();
updateSendCodeButton();
updateResendButton();
initializeTurnstile();
