(function () {
  "use strict";

  if (window.SilipModal) return;

  const TYPES = new Set([
    "info",
    "success",
    "warning",
    "error",
    "confirm",
    "prompt",
  ]);

  const DEFAULTS = {
    info: { title: "Information", confirmText: "Got it" },
    success: { title: "Success", confirmText: "Continue" },
    warning: { title: "Attention needed", confirmText: "Got it" },
    error: { title: "Something went wrong", confirmText: "Try again" },
    confirm: { title: "Please confirm", confirmText: "Continue" },
    prompt: { title: "Additional information", confirmText: "Submit" },
  };

  const ICONS = {
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 11v5"></path><path d="M12 8h.01"></path></svg>',
    success:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 12.5 3.5 3.5 7.5-8"></path></svg>',
    warning:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 4.1 3.2 17a2 2 0 0 0 1.8 3h14a2 2 0 0 0 1.8-3L13.7 4.1a2 2 0 0 0-3.4 0Z"></path><path d="M12 9v4"></path><path d="M12 16.5h.01"></path></svg>',
    error:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7.5 7.5 9 9"></path><path d="m16.5 7.5-9 9"></path></svg>',
    confirm:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16v.01"></path><path d="M9.7 9a2.5 2.5 0 1 1 3.7 2.2c-.9.5-1.4 1.1-1.4 2.3"></path><circle cx="12" cy="12" r="9"></circle></svg>',
    prompt:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19h4l10-10a2.8 2.8 0 0 0-4-4L5 15v4Z"></path><path d="m13.5 6.5 4 4"></path></svg>',
  };

  let sequence = Promise.resolve();

  function normalize(input, type) {
    const source = typeof input === "string" ? { message: input } : input || {};
    const normalizedType = TYPES.has(type || source.type)
      ? type || source.type
      : "info";
    const defaults = DEFAULTS[normalizedType];

    return {
      type: normalizedType,
      title: source.title || defaults.title,
      message: source.message || "",
      confirmText: source.confirmText || defaults.confirmText,
      cancelText: source.cancelText || "Cancel",
      showCancel:
        source.showCancel === true ||
        normalizedType === "confirm" ||
        normalizedType === "prompt",
      closeOnBackdrop: source.closeOnBackdrop !== false,
      closeOnEscape: source.closeOnEscape !== false,
      inputLabel: source.inputLabel || "Your response",
      inputPlaceholder: source.inputPlaceholder || "",
      inputValue: source.inputValue == null ? "" : String(source.inputValue),
      inputType: source.inputType === "textarea" ? "textarea" : "text",
      required: source.required === true,
      requiredMessage: source.requiredMessage || "This field is required.",
      maxLength: Number.isFinite(Number(source.maxLength))
        ? Math.max(1, Number(source.maxLength))
        : 500,
    };
  }

  function waitForBody() {
    if (document.body) return Promise.resolve();

    return new Promise((resolve) => {
      document.addEventListener("DOMContentLoaded", resolve, { once: true });
    });
  }

  function createButton(text, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `sm-dialog__button ${className}`;
    button.textContent = text;
    return button;
  }

  function getFocusable(dialog) {
    return Array.from(
      dialog.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
  }

  async function present(options) {
    await waitForBody();

    return new Promise((resolve) => {
      const previousFocus = document.activeElement;
      const layer = document.createElement("div");
      const dialog = document.createElement("section");
      const body = document.createElement("div");
      const closeButton = document.createElement("button");
      const icon = document.createElement("div");
      const title = document.createElement("h2");
      const message = document.createElement("p");
      const actions = document.createElement("div");
      const confirmButton = createButton(
        options.confirmText,
        "sm-dialog__button--primary",
      );
      const cancelButton = createButton(
        options.cancelText,
        "sm-dialog__button--secondary",
      );
      const titleId = `sm-dialog-title-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const messageId = `${titleId}-message`;
      let input = null;
      let errorText = null;
      let settled = false;

      layer.className = `sm-dialog-layer sm-dialog-layer--${options.type}`;
      dialog.className = "sm-dialog";
      dialog.setAttribute(
        "role",
        options.type === "error" ? "alertdialog" : "dialog",
      );
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", titleId);
      if (options.message) dialog.setAttribute("aria-describedby", messageId);

      body.className = "sm-dialog__body";

      closeButton.type = "button";
      closeButton.className = "sm-dialog__close";
      closeButton.setAttribute("aria-label", "Close dialog");
      closeButton.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" stroke-width="2" stroke-linecap="round"></path></svg>';

      icon.className = "sm-dialog__icon";
      icon.innerHTML = ICONS[options.type];

      title.className = "sm-dialog__title";
      title.id = titleId;
      title.textContent = options.title;

      message.className = "sm-dialog__message";
      message.id = messageId;
      message.textContent = options.message;

      actions.className = "sm-dialog__actions";

      body.append(closeButton, icon, title);
      if (options.message) body.append(message);

      if (options.type === "prompt") {
        const field = document.createElement("div");
        const label = document.createElement("label");

        input = document.createElement(
          options.inputType === "textarea" ? "textarea" : "input",
        );
        errorText = document.createElement("p");

        field.className = "sm-dialog__field";
        label.className = "sm-dialog__label";
        label.textContent = options.inputLabel;
        input.className = "sm-dialog__input";
        input.value = options.inputValue;
        input.placeholder = options.inputPlaceholder;
        input.maxLength = options.maxLength;
        if (options.inputType !== "textarea") input.type = "text";
        errorText.className = "sm-dialog__field-error";
        errorText.setAttribute("aria-live", "polite");

        const inputId = `${titleId}-input`;
        input.id = inputId;
        label.htmlFor = inputId;
        field.append(label, input, errorText);
        body.append(field);
      }

      if (options.showCancel) actions.append(cancelButton);
      actions.append(confirmButton);
      body.append(actions);
      dialog.append(body);
      layer.append(dialog);
      document.body.append(layer);
      document.body.classList.add("sm-dialog-open");

      function finish(value) {
        if (settled) return;
        settled = true;
        document.removeEventListener("keydown", handleKeydown, true);
        layer.classList.add("is-closing");
        layer.classList.remove("is-open");

        window.setTimeout(() => {
          layer.remove();
          if (!document.querySelector(".sm-dialog-layer")) {
            document.body.classList.remove("sm-dialog-open");
          }
          if (
            previousFocus instanceof HTMLElement &&
            previousFocus.isConnected
          ) {
            previousFocus.focus({ preventScroll: true });
          }
          resolve(value);
        }, 190);
      }

      function cancel() {
        finish(options.type === "prompt" ? null : false);
      }

      function confirm() {
        if (input) {
          const value = input.value.trim();
          if (options.required && !value) {
            input.classList.add("is-invalid");
            input.setAttribute("aria-invalid", "true");
            errorText.textContent = options.requiredMessage;
            input.focus();
            return;
          }
          finish(value);
          return;
        }

        finish(true);
      }

      function handleKeydown(event) {
        if (event.key === "Escape" && options.closeOnEscape) {
          event.preventDefault();
          cancel();
          return;
        }

        if (
          event.key === "Enter" &&
          input &&
          options.inputType !== "textarea"
        ) {
          event.preventDefault();
          confirm();
          return;
        }

        if (event.key !== "Tab") return;

        const focusable = getFocusable(dialog);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }

      closeButton.addEventListener("click", cancel);
      cancelButton.addEventListener("click", cancel);
      confirmButton.addEventListener("click", confirm);
      layer.addEventListener("click", (event) => {
        if (event.target === layer && options.closeOnBackdrop) cancel();
      });
      input?.addEventListener("input", () => {
        input.classList.remove("is-invalid");
        input.removeAttribute("aria-invalid");
        errorText.textContent = "";
      });
      document.addEventListener("keydown", handleKeydown, true);

      window.requestAnimationFrame(() => {
        layer.classList.add("is-open");
        window.setTimeout(() => {
          (input || confirmButton).focus();
          if (input)
            input.setSelectionRange(input.value.length, input.value.length);
        }, 40);
      });
    });
  }

  function enqueue(input, type) {
    const options = normalize(input, type);
    const task = () => present(options);
    const result = sequence.then(task, task);
    sequence = result.catch(() => null);
    return result;
  }

  window.SilipModal = Object.freeze({
    show(input) {
      return enqueue(input);
    },
    alert(input) {
      return enqueue(input, "info");
    },
    info(input) {
      return enqueue(input, "info");
    },
    success(input) {
      return enqueue(input, "success");
    },
    warning(input) {
      return enqueue(input, "warning");
    },
    error(input) {
      return enqueue(input, "error");
    },
    confirm(input) {
      return enqueue(input, "confirm");
    },
    prompt(input) {
      return enqueue(input, "prompt");
    },
  });
})();
