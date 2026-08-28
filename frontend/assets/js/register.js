const registerForm = document.querySelector("#register-form");

const registerButton = document.querySelector("#register-button");

const formMessage = document.querySelector("#form-message");

const firstNameInput = document.querySelector("#first-name");

const lastNameInput = document.querySelector("#last-name");

const emailInput = document.querySelector("#email");

const phoneNumberInput = document.querySelector("#phone-number");

const passwordInput = document.querySelector("#password");

const confirmPasswordInput = document.querySelector("#confirm-password");

const termsInput = document.querySelector("#terms");

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
  if (!errors) {
    return;
  }

  Object.entries(errors).forEach(([field, message]) => {
    const input = registerForm.querySelector(`[name="${field}"]`);

    const errorElement = document.querySelector(`[data-error-for="${field}"]`);

    if (input) {
      input.classList.add("invalid");
    }

    if (errorElement) {
      errorElement.textContent = message;
    }
  });
}

function setLoading(loading) {
  registerButton.disabled = loading;

  registerButton.querySelector("span").textContent = loading
    ? "Creating account..."
    : "Create Account";
}

document.querySelectorAll("[data-password-target]").forEach((button) => {
  button.addEventListener("click", () => {
    const targetId = button.dataset.passwordTarget;

    const input = document.getElementById(targetId);

    if (!input) {
      return;
    }

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

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  clearErrors();
  hideMessage();

  const password = passwordInput.value;

  const confirmPassword = confirmPasswordInput.value;

  if (password !== confirmPassword) {
    confirmPasswordInput.classList.add("invalid");

    const confirmError = document.querySelector(
      '[data-error-for="confirm_password"]',
    );

    if (confirmError) {
      confirmError.textContent = "Passwords do not match.";
    }

    return;
  }

  if (!termsInput.checked) {
    showMessage(
      "Please accept the Terms of Service and Privacy Policy.",
      "error",
    );

    return;
  }

  setLoading(true);

  const selectedRole = registerForm.querySelector('input[name="role"]:checked');

  const registrationData = {
    first_name: firstNameInput.value.trim(),

    last_name: lastNameInput.value.trim(),

    email: emailInput.value.trim(),

    phone_number: phoneNumberInput.value.trim(),

    password,

    confirm_password: confirmPassword,

    role: selectedRole ? selectedRole.value : "",
  };

  try {
    const response = await fetch("/SilipMunti/backend/auth/register.php", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      credentials: "include",

      body: JSON.stringify(registrationData),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      showFieldErrors(result.errors);

      const errorMessages = result.errors
        ? Object.values(result.errors).join(" ")
        : result.message;

      showMessage(errorMessages || "Unable to create account.", "error");

      return;
    }

    showMessage(result.message || "Account created successfully.", "success");

    registerForm.reset();

    setTimeout(() => {
      window.location.href = "login.html";
    }, 900);
  } catch (error) {
    console.error(error);

    showMessage("Unable to connect to the server.", "error");
  } finally {
    setLoading(false);
  }
});
