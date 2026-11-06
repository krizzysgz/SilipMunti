const BASE_URL = "/SilipMunti";

const TURNSTILE_CONFIG_ENDPOINT = `${BASE_URL}/backend/security/turnstile-config.php`;
const SEND_RESET_CODE_ENDPOINT = `${BASE_URL}/backend/auth/send-password-reset-otp.php`;
const RESET_PASSWORD_ENDPOINT = `${BASE_URL}/backend/auth/reset-password.php`;
const VERIFY_RESET_CODE_ENDPOINT = `${BASE_URL}/backend/auth/verify-password-reset-otp.php`;

const emailPanel = document.querySelector("#email-panel");
const resetPanel = document.querySelector("#reset-panel");
const successPanel = document.querySelector("#success-panel");
const emailForm = document.querySelector("#email-form");
const verifyPanel = document.querySelector("#verify-panel");
const verifyForm = document.querySelector("#verify-form");
const resetForm = document.querySelector("#reset-form");
const emailInput = document.querySelector("#email");
const otpInput = document.querySelector("#otp");
const newPasswordInput = document.querySelector("#new-password");
const confirmPasswordInput = document.querySelector("#confirm-password");
const sendCodeButton = document.querySelector("#send-code-button");
const verifyCodeButton = document.querySelector("#verify-code-button");
const resetPasswordButton = document.querySelector("#reset-password-button");
const resendCodeButton = document.querySelector("#resend-code-button");
const changeEmailButton = document.querySelector("#change-email-button");
const formMessage = document.querySelector("#form-message");
const resetEmailElement = document.querySelector("#verify-email");
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
let resetToken = "";
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

function showOnlyPanel(panelToShow) {
  [emailPanel, verifyPanel, resetPanel, successPanel].forEach((panel) => {
    panel.classList.toggle("hidden", panel !== panelToShow);
  });
}

// STEP 1: Email
function showEmailPanel() {
  showOnlyPanel(emailPanel);
  pageTitle.textContent = "Forgot Password?";
  pageDescription.textContent =
    "Enter your registered email to receive a reset code.";
  signinLink.classList.remove("hidden");
}

// STEP 2: Verification code
function showVerifyPanel() {
  showOnlyPanel(verifyPanel);
  pageTitle.textContent = "Check Your Email";
  pageDescription.textContent =
    "Enter the verification code we sent to your email.";
  resetEmailElement.textContent = maskEmail(resetEmail);
  signinLink.classList.remove("hidden");
  prepareResendTurnstile();

  window.setTimeout(() => {
    focusOtpField();
  }, 100);
}

// STEP 3: New password (lalabas lang kapag tama na ang code)
function showResetPanel() {
  showOnlyPanel(resetPanel);
  pageTitle.textContent = "Create New Password";
  pageDescription.textContent =
    "Choose a strong new password for your account.";
  signinLink.classList.remove("hidden");

  updatePasswordRequirements();

  window.setTimeout(() => {
    newPasswordInput.focus();
  }, 100);
}

function showSuccessPanel() {
  showOnlyPanel(successPanel);
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

// Password requirements (pareho ng sa registration)
const passwordRequirementRules = [
  { id: "req-length", test: (value) => value.length >= 8 },
  { id: "req-upper", test: (value) => /[A-Z]/.test(value) },
  { id: "req-lower", test: (value) => /[a-z]/.test(value) },
  { id: "req-number", test: (value) => /[0-9]/.test(value) },
  { id: "req-symbol", test: (value) => /[\W_]/.test(value) },
];

function passwordMeetsRequirements(value) {
  return passwordRequirementRules.every((rule) => rule.test(value));
}

function updatePasswordRequirements() {
  const value = newPasswordInput.value;

  passwordRequirementRules.forEach(({ id, test }) => {
    const item = document.getElementById(id);

    if (!item) return;

    const passed = test(value);
    const icon = item.querySelector("i");

    item.classList.toggle("valid", passed);

    if (icon) {
      icon.className = passed
        ? "fa-solid fa-circle-check"
        : "fa-solid fa-circle-xmark";
    }
  });
}

function validateVerifyForm() {
  const otp = otpInput.value.trim();
  const errors = {};

  if (otp === "") {
    errors.otp = "Verification code is required.";
  } else if (!/^\d{6}$/.test(otp)) {
    errors.otp = "Verification code must contain exactly six digits.";
  }

  return { otp, errors };
}

function validateResetForm() {
  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  const errors = {};

  if (newPassword === "") {
    errors.new_password = "New password is required.";
  } else if (newPassword.length < 8) {
    errors.new_password = "New password must contain at least 8 characters.";
  } else if (newPassword.length > 255) {
    errors.new_password = "New password is too long.";
  } else if (!passwordMeetsRequirements(newPassword)) {
    errors.new_password =
      "Password must include an uppercase letter, a lowercase letter, a number, and a special character.";
  }

  if (confirmPassword === "") {
    errors.confirm_password = "Password confirmation is required.";
  } else if (newPassword !== confirmPassword) {
    errors.confirm_password = "Passwords do not match.";
  }

  return {
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
        showVerifyPanel();
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
    showVerifyPanel();
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

  const { newPassword, confirmPassword, errors } = validateResetForm();

  if (Object.keys(errors).length > 0) {
    showFieldErrors(errors);
    return;
  }

  if (resetEmail === "" || resetToken === "") {
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
      reset_token: resetToken,
      new_password: newPassword,
      confirm_password: confirmPassword,
    });

    if (!response.ok || !result.success) {
      // Expired / invalid na ang verification: balik sa umpisa
      if (result.data?.restart) {
        resetToken = "";
        resetForm.reset();
        showEmailPanel();
        showMessage(
          result.message ||
            "Your verification expired. Please request a new code.",
          "error",
        );
        return;
      }

      showFieldErrors(result.errors);
      showMessage(result.message || "Unable to reset the password.", "error");
      return;
    }

    stopResendCountdown();
    resetToken = "";
    resetForm.reset();
    verifyForm.reset();
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

// STEP 2 submit: i-verify muna ang code bago payagang mag-set ng password
verifyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearErrors();
  hideMessage();

  const { otp, errors } = validateVerifyForm();

  if (Object.keys(errors).length > 0) {
    showFieldErrors(errors);
    return;
  }

  if (resetEmail === "") {
    showEmailPanel();
    showMessage("Enter your email and request a new code.", "error");
    return;
  }

  setButtonLoading(verifyCodeButton, true, "Verifying code...", "Verify Code");

  try {
    const { response, result } = await requestJson(VERIFY_RESET_CODE_ENDPOINT, {
      email: resetEmail,
      otp,
    });

    if (!response.ok || !result.success || !result.data?.reset_token) {
      showFieldErrors(result.errors);
      showMessage(result.message || "Unable to verify the code.", "error");
      otpInput.value = "";
      focusOtpField();
      return;
    }

    resetToken = result.data.reset_token;
    stopResendCountdown();
    hideMessage();
    showResetPanel();
  } catch (error) {
    console.error(error);
    showMessage("Unable to connect to the server.", "error");
  } finally {
    setButtonLoading(
      verifyCodeButton,
      false,
      "Verifying code...",
      "Verify Code",
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
    focusOtpField(); // CHANGED: dating otpInput.focus()
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
  verifyForm.reset();
  resetEmail = "";
  resetToken = "";
  resetRequestTurnstile();
  showEmailPanel();
  emailInput.focus();
});

newPasswordInput.addEventListener("input", updatePasswordRequirements);

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

/* =====================================================
   NEW: OTP 6-BOX UI
   Itinatago ang original #otp at gumagawa ng 6 boxes
   na nag-sync dito, kaya gumagana pa rin ang validation.
   ===================================================== */
let otpBoxes = [];

function focusOtpField() {
  if (otpBoxes.length > 0) {
    otpBoxes[0].focus();
  } else {
    otpInput.focus();
  }
}

(function initOtpBoxes() {
  const LENGTH = 6;

  if (!otpInput || otpInput.dataset.boxed) return;
  otpInput.dataset.boxed = "1";
  otpInput.classList.add("otp-real");

  const wrap = document.createElement("div");
  wrap.className = "otp-boxes";

  for (let i = 0; i < LENGTH; i++) {
    const box = document.createElement("input");
    box.type = "text";
    box.inputMode = "numeric";
    box.maxLength = 1;
    box.className = "otp-box";
    box.setAttribute("aria-label", `Digit ${i + 1}`);
    if (i === 0) box.autocomplete = "one-time-code";
    wrap.appendChild(box);
    otpBoxes.push(box);
  }

  otpInput.insertAdjacentElement("afterend", wrap);

  function pushToReal() {
    otpInput.value = otpBoxes.map((box) => box.value).join("");
    otpInput.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function pullFromReal() {
    const value = otpInput.value.replace(/\D/g, "").slice(0, LENGTH);

    otpBoxes.forEach((box, i) => {
      box.value = value[i] || "";
      box.classList.toggle("filled", box.value !== "");
    });
  }

  function fillFrom(startIndex, digits) {
    digits.split("").forEach((digit, k) => {
      const box = otpBoxes[startIndex + k];

      if (box) {
        box.value = digit;
        box.classList.add("filled");
      }
    });

    pushToReal();
    otpBoxes[Math.min(startIndex + digits.length, LENGTH - 1)].focus();
  }

  otpBoxes.forEach((box, i) => {
    box.addEventListener("input", () => {
      const digits = box.value.replace(/\D/g, "");

      box.value = "";
      box.classList.remove("filled");

      if (digits) {
        fillFrom(i, digits);
      } else {
        pushToReal();
      }
    });

    box.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && !box.value && i > 0) {
        otpBoxes[i - 1].value = "";
        otpBoxes[i - 1].classList.remove("filled");
        otpBoxes[i - 1].focus();
        pushToReal();
      } else if (event.key === "ArrowLeft" && i > 0) {
        otpBoxes[i - 1].focus();
      } else if (event.key === "ArrowRight" && i < LENGTH - 1) {
        otpBoxes[i + 1].focus();
      }
    });

    box.addEventListener("focus", () => box.select());

    box.addEventListener("paste", (event) => {
      event.preventDefault();

      const text = (event.clipboardData || window.clipboardData)
        .getData("text")
        .replace(/\D/g, "")
        .slice(0, LENGTH);

      if (text) fillFrom(0, text);
    });
  });

  // Sync ang "invalid" state ng original input papunta sa boxes
  new MutationObserver(() => {
    wrap.classList.toggle("invalid", otpInput.classList.contains("invalid"));
  }).observe(otpInput, { attributes: true, attributeFilter: ["class"] });

  // Kapag nilinis/binago ng code ang value (resetForm.reset(), resend, atbp.)
  let lastValue = otpInput.value;

  window.setInterval(() => {
    if (otpInput.value !== lastValue) {
      lastValue = otpInput.value;
      pullFromReal();
    }
  }, 200);
})();

showEmailPanel();
updateSendCodeButton();
updateResendButton();
initializeTurnstile();
