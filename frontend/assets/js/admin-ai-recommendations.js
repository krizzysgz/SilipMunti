/* SilipMunti: automatic 30-day Gemini + live operational alerts. */
(() => {
  "use strict";
  if (window.SilipMuntiMonthlyAIInitialized) return;
  window.SilipMuntiMonthlyAIInitialized = true;

  const panel = document.querySelector(".report-insights-section");
  const insights = document.querySelector("#report-insights");
  const status = document.querySelector("#report-health-status");
  if (!panel || !insights || !status) return;

  // Remove the previous AI addon button, if an old script is still loaded by mistake.
  document.querySelector("#generate-ai-insights")?.remove();
  document.querySelector("#ai-insights-message")?.remove();
  const note = document.createElement("p");
  note.className = "report-screen-only";
  note.id = "monthly-ai-insights-note";
  note.style.cssText = "font-size:.82rem;opacity:.8;margin:8px 12px;";
  note.textContent = "Monthly AI recommendations will load automatically.";
  insights.before(note);

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  const friendlyDate = (value) => {
    if (!value) return "not available";
    // PHP MySQL timestamps are in server-local time, display as a date only.
    const date = new Date(String(value).replace(" ", "T"));
    return Number.isNaN(date.getTime())
      ? String(value).slice(0, 10)
      : date.toLocaleDateString("en-PH", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
  };

  let activePayload = null;
  let controller = null;
  let timer = null;
  let writing = false;
  let lastRendered = "";
  let lastRequestTime = 0;
  let requested = false;

  function render(payload) {
    if (!Array.isArray(payload.insights)) return;
    const live = Array.isArray(payload.live_alerts) ? payload.live_alerts : [];
    const monthly = payload.insights;
    const cards = [...live, ...monthly];
    const html = cards
      .map((item, index) => {
        const type = ["critical", "warning", "success"].includes(item.type)
          ? item.type
          : "warning";
        const label =
          index < live.length
            ? "Current operational alert"
            : "30-day AI recommendation";
        return `<article class="report-insight-card ${type}">
        <div>
          <p style="font-size:.75rem;opacity:.7;margin:0 0 6px">${label}</p>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.finding)}</p>
          <span class="report-insight-action">Recommended: ${escapeHtml(item.action)}</span>
          ${item.evidence ? `<p style="margin-top:8px;font-size:.82rem;opacity:.8">Evidence: ${escapeHtml(item.evidence)}</p>` : ""}
        </div>
      </article>`;
      })
      .join("");
    writing = true;
    if (insights.innerHTML !== html) insights.innerHTML = html;
    lastRendered = html;
    const countCritical = cards.filter((x) => x.type === "critical").length;
    const countWarning = cards.filter((x) => x.type === "warning").length;
    status.className = "report-status-pill";
    if (countCritical) {
      status.textContent = `${countCritical} priority issue${countCritical > 1 ? "s" : ""}`;
      status.classList.add("attention");
    } else if (countWarning) {
      status.textContent = `${countWarning} area${countWarning > 1 ? "s" : ""} to improve`;
    } else {
      status.textContent = "Healthy status";
      status.classList.add("healthy");
    }
    note.textContent =
      `Monthly AI insights generated ${friendlyDate(payload.generated_at)}. ` +
      (payload.next_update_at
        ? `Next eligible update: ${friendlyDate(payload.next_update_at)}. `
        : "Next scheduled update pending. ") +
      `Current operational alerts are refreshed on report load.${payload.stale ? " Showing the previous saved recommendations while regeneration is unavailable." : ""}`;
    // MutationObserver runs in a microtask after DOM mutations.
    queueMicrotask(() => {
      writing = false;
    });
  }

  async function loadMonthly() {
    if (!window.SilipMuntiSession?.secureFetch) {
      note.textContent =
        "Session security helper is not loaded; existing rules remain available.";
      return;
    }
    controller?.abort();
    controller = new AbortController();
    const { signal } = controller;
    lastRequestTime = Date.now();
    requested = true;
    note.textContent =
      "Loading saved monthly AI recommendations and checking current alerts…";
    try {
      // Filters intentionally do NOT determine the monthly snapshot; all admins see one shared cycle.
      // POST uses SilipMunti secureFetch to retain CSRF validation.
      const response = await window.SilipMuntiSession.secureFetch(
        "/SilipMunti/backend/admin/ai-recommendations.php",
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: "{}",
          signal,
        },
      );
      const payload = await response.json();
      if (
        !response.ok ||
        !payload.success ||
        !Array.isArray(payload.insights)
      ) {
        throw new Error(
          payload.message || "Monthly AI recommendations are unavailable.",
        );
      }
      activePayload = payload;
      render(payload);
    } catch (error) {
      if (error?.name === "AbortError") return;
      note.textContent = `${error.message} Existing rule-based recommendations remain available.`;
      // If refresh had overwritten an older successful AI response, don't present it as fresh.
      activePayload = null;
    }
  }

  // Existing admin-reports.js rebuilds #report-insights whenever it fetches new report data.
  // Detect that event and restore the unified monthly view, rather than stacking duplicate cards.
  const observer = new MutationObserver(() => {
    if (writing || !insights.children.length) return;
    if (activePayload && insights.innerHTML !== lastRendered)
      render(activePayload);
    if (!requested && !timer) {
      timer = setTimeout(() => {
        timer = null;
        loadMonthly();
      }, 200);
    }
  });
  observer.observe(insights, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // Existing Reports data loads on page startup. Wait until it has rendered once,
  // then automatically call Gemini only if the 30-day server cache has expired.
  if (insights.children.length) {
    timer = setTimeout(() => {
      timer = null;
      loadMonthly();
    }, 250);
  }
  // Refreshes update the live alerts but DO NOT regenerate saved monthly AI until due.
  document.querySelector("#refresh-report")?.addEventListener("click", () => {
    if (Date.now() - lastRequestTime < 1000) return;
    setTimeout(loadMonthly, 500);
  });
  window.addEventListener("focus", () => {
    // Re-check live alerts at most every 5 minutes if admin returns to the tab.
    if (requested && Date.now() - lastRequestTime > 300000) loadMonthly();
  });
})();
