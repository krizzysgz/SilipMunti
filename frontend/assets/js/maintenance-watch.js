(() => {
  "use strict";
  if (window.SilipMuntiMaintenanceWatch) return;
  window.SilipMuntiMaintenanceWatch = true;
  let checking = false;
  const isMaintenancePage =
    document.body.dataset.maintenance === "true" ||
    document.body.classList.contains("sm-maintenance");
  const message = document.getElementById("maintenance-message");
  if (message?.textContent.includes("{{SM_MAINTENANCE_MESSAGE}}")) {
    message.textContent =
      "We’re making a few improvements. We’ll be back up and running soon.";
  }
  function feedback(text) {
    const element = document.getElementById("maintenance-status");
    if (element) element.textContent = text;
  }
  async function check(manual = false) {
    if (checking || (document.hidden && !manual)) return;
    checking = true;
    try {
      if (manual) feedback("Checking system status…");
      const response = await fetch(
        `${window.SilipMuntiPaths.base}/backend/system/status.php`,
        {
          credentials: "same-origin",
          cache: "no-store",
        },
      );
      if (!response.ok) {
        if (manual)
          feedback("Unable to check right now. Please try again shortly.");
        return;
      }
      const result = await response.json();
      if (!result.success) return;
      if (result.data.busy) {
        if (manual)
          feedback(
            "System recovery is in progress. Please check again shortly.",
          );
        return;
      }
      if (isMaintenancePage) {
        const description = document.getElementById("error-description");
        if (description && typeof result.data.message === "string") {
          description.replaceChildren();
          result.data.message.split(/\r?\n/).forEach((line, index) => {
            if (index) description.append(document.createElement("br"));
            description.append(document.createTextNode(line));
          });
        }
        if (!result.data.enabled) {
          if (location.pathname.endsWith("/maintenance.html"))
            location.replace(
              `${window.SilipMuntiPaths.base}/frontend/index.html`,
            );
          else location.reload();
        } else if (manual)
          feedback(
            "The system is still under maintenance. Please check again later.",
          );
        return;
      }
      if (
        !result.data.enabled ||
        location.pathname.endsWith("/auth/admin-login.html")
      )
        return;
      const responseSession = await fetch(
        `${window.SilipMuntiPaths.base}/backend/auth/status.php`,
        { credentials: "same-origin", cache: "no-store" },
      );
      if (!responseSession.ok) return;
      const session = await responseSession.json();
      if (session.success && session.data?.user?.role !== "admin") {
        location.reload();
      }
    } catch (_) {
      if (manual)
        feedback(
          "Unable to connect. Please check your connection and try again.",
        );
    } finally {
      checking = false;
    }
  }
  document
    .getElementById("maintenance-check")
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      check(true);
    });
  setInterval(() => check(), 30000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) check();
  });
  check();
})();
