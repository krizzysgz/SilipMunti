(() => {
  "use strict";

  const requestForm = document.querySelector("#email-change-request-form");
  const verifyForm = document.querySelector("#email-change-verify-form");

  if (!requestForm || !verifyForm) return;

  const message = document.querySelector("#email-change-message");
  const pending = document.querySelector("#email-change-pending-address");
  const newEmail = document.querySelector("#email-change-new-email");
  const password = document.querySelector("#email-change-password");
  const otp = document.querySelector("#email-change-otp");
  const startAgain = document.querySelector("#email-change-start-again");

  let busy = false;
  let completed = false;

  function show(text, error = false) {
    message.textContent = text;
    message.dataset.type = error ? "error" : "success";
  }

  async function send(payload) {
    const response = await window.SilipMuntiSession.secureFetch(
      "/SilipMunti/backend/profile/email-change.php",
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to update your email.");
    }

    return result;
  }

  async function run(task) {
    if (busy || completed) return;

    busy = true;

    document
      .querySelectorAll(".profile-email-change button")
      .forEach((button) => {
        button.disabled = true;
      });

    try {
      await task();
    } catch (error) {
      show(error.message || "Unable to update your email.", true);
    } finally {
      busy = false;

      document
        .querySelectorAll(".profile-email-change button")
        .forEach((button) => {
          button.disabled = completed;
        });
    }
  }

  requestForm.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!requestForm.reportValidity()) return;

    run(async () => {
      show("Sending verification code…");

      const result = await send({
        action: "request",
        new_email: newEmail.value.trim(),
        current_password: password.value,
      });

      password.value = "";

      pending.textContent = result.data.new_email;
      requestForm.hidden = true;
      verifyForm.hidden = false;

      show(result.message);
      otp.focus();
    });
  });

  verifyForm.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!verifyForm.reportValidity()) return;

    run(async () => {
      show("Verifying your email…");

      const result = await send({
        action: "confirm",
        otp: otp.value.trim(),
      });

      completed = true;

      show(result.message + " Refreshing your profile…");

      window.setTimeout(() => {
        window.location.reload();
      }, 1200);
    });
  });

  startAgain.addEventListener("click", () => {
    if (busy || completed) return;

    verifyForm.reset();
    verifyForm.hidden = true;
    requestForm.hidden = false;

    password.value = "";

    show("Enter your email and current password to request a new code.");

    newEmail.focus();
  });
})();
