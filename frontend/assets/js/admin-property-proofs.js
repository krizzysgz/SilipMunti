(function () {
  "use strict";
  const root = `${window.SilipMuntiPaths.base}/backend/admin`;
  const body = document.querySelector("#property-proofs-body");
  const message = document.querySelector("#property-proof-admin-message");
  const refresh = document.querySelector("#refresh-property-proofs");
  if (!body) return;
  const escape = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  const dates = (s) =>
    s ? new Date(String(s).replace(" ", "T")).toLocaleDateString("en-PH") : "—";
  async function load() {
    if (refresh) refresh.disabled = true;
    try {
      const response = await fetch(`${root}/property-proofs.php`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok || !json.success)
        throw new Error(json.message || "Unable to load documents");
      const docs = json.data?.documents || [];
      body.innerHTML = docs.length
        ? docs
            .map(
              (d) => `
        <tr>
          <td><strong>${escape(d.listing_title)}</strong><div style="font-size:12px;color:#64748b">#${escape(d.listing_id)}</div></td>
          <td>${escape(d.landlord_name)}</td>
          <td><a href="${root}/view-property-proof.php?id=${encodeURIComponent(d.id)}" target="_blank" rel="noopener noreferrer">${escape(d.document_type.toUpperCase())}: View private document</a></td>
          <td>${escape(dates(d.created_at))}</td>
          <td>${escape(d.verification_status)}</td>
          <td>${
            d.verification_status === "pending"
              ? `
            <button type="button" class="proof-review-action" data-id="${escape(d.id)}" data-status="approved">Approve</button>
            <button type="button" class="proof-review-action" data-id="${escape(d.id)}" data-status="rejected">Reject</button>`
              : "Reviewed"
          }</td>
        </tr>`,
            )
            .join("")
        : '<tr><td colspan="6">No supporting documents submitted yet.</td></tr>';
      message.textContent = `${docs.length} supporting document record(s). Only approved proof qualifies for Property Verified.`;
    } catch (error) {
      body.innerHTML =
        '<tr><td colspan="6">Unable to load supporting documents.</td></tr>';
      message.textContent = error.message || "Unable to load documents.";
    } finally {
      if (refresh) refresh.disabled = false;
    }
  }
  body.addEventListener("click", async (event) => {
    const button = event.target.closest(".proof-review-action");
    if (!button) return;
    const status = button.dataset.status;
    const reason =
      status === "rejected"
        ? window.prompt("Reason for rejection (required):")
        : "";
    if (status === "rejected" && (!reason || !reason.trim())) return;
    if (
      status === "approved" &&
      !window.confirm(
        "Approve this supporting document? Confirm you have reviewed its contents.",
      )
    )
      return;
    button.disabled = true;
    try {
      const response = await window.SilipMuntiSession.secureFetch(
        `${root}/property-proofs.php`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            document_id: Number(button.dataset.id),
            status,
            reason: reason || "",
          }),
        },
      );
      const json = await response.json();
      if (!response.ok || !json.success)
        throw new Error(json.message || "Review failed");
      await load();
    } catch (error) {
      message.textContent = error.message || "Review failed";
      button.disabled = false;
    }
  });
  refresh?.addEventListener("click", load);
  load();
})();
