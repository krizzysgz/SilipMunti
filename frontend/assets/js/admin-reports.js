(function () {
  "use strict";

  if (window.SilipMuntiAdminReportsInitialized) return;
  window.SilipMuntiAdminReportsInitialized = true;

  const API_ROOT = "/SilipMunti/backend";
  const FRONTEND_ROOT = "/SilipMunti/frontend";
  const REPORT_ENDPOINT = `${API_ROOT}/admin/reports.php`;
  const state = {
    admin: null,
    data: null,
    loading: false,
  };

  const elements = {
    form: document.querySelector("#report-filter-form"),
    startDate: document.querySelector("#report-start-date"),
    endDate: document.querySelector("#report-end-date"),
    barangay: document.querySelector("#report-barangay"),
    rentalType: document.querySelector("#report-rental-type"),
    message: document.querySelector("#report-message"),
    refresh: document.querySelector("#refresh-report"),
    exportCsv: document.querySelector("#export-csv"),
    print: document.querySelector("#print-report"),
    search: document.querySelector("#topbar-search"),
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  }

  function number(value) {
    return new Intl.NumberFormat("en-PH").format(Number(value) || 0);
  }

  function currency(value) {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(Number(value) || 0);
  }

  function percent(value) {
    return `${Number(value || 0).toFixed(1)}%`;
  }

  function rating(value) {
    const amount = Number(value) || 0;
    return amount > 0 ? `${amount.toFixed(1)} / 5` : "No rating";
  }

  function parseDatabaseDate(value) {
    if (!value) return null;
    const date = new Date(String(value).replace(" ", "T"));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(value, options = {}) {
    const date = parseDatabaseDate(value);
    if (!date) return "Not available";

    return date.toLocaleDateString("en-PH", {
      year: "numeric",
      month: options.short ? "short" : "long",
      day: "numeric",
    });
  }

  function formatDateTime(value) {
    const date = parseDatabaseDate(value);
    if (!date) return "Not available";

    return date.toLocaleString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function dateInputValue(date) {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  }

  function showMessage(message, type = "error") {
    if (!elements.message) return;
    elements.message.textContent = message;
    elements.message.className = `admin-message ${type} report-screen-only`;
  }

  function hideMessage() {
    if (!elements.message) return;
    elements.message.textContent = "";
    elements.message.className = "admin-message hidden report-screen-only";
  }

  function setLoading(isLoading) {
    state.loading = isLoading;

    [elements.refresh, elements.exportCsv, elements.print].forEach((button) => {
      if (button) button.disabled = isLoading;
    });

    if (elements.refresh) {
      elements.refresh.classList.toggle("loading", isLoading);
    }
  }

  function getInitials(firstName, lastName) {
    const initials = `${String(firstName ?? "").charAt(0)}${String(
      lastName ?? "",
    ).charAt(0)}`.toUpperCase();

    return initials || "A";
  }

  function hydrateAdmin(user) {
    state.admin = user;
    const fullName = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
    const displayName = fullName || "Administrator";

    setText("#admin-name", displayName);
    setText("#print-admin", displayName);
    window.SilipMuntiAdminShell?.setAdminProfile(user);

    const initials = getInitials(user.first_name, user.last_name);
    const fallback = document.querySelector("#admin-profile-initials");
    if (fallback) fallback.textContent = initials;
  }

  async function requireAdmin() {
    const user = await window.SilipMuntiSession?.getCurrentUser();

    if (!user) {
      window.location.href = `${FRONTEND_ROOT}/pages/auth/login.html`;
      return null;
    }

    if (user.role !== "admin") {
      window.location.href = `${FRONTEND_ROOT}/index.html`;
      return null;
    }

    hydrateAdmin(user);
    return user;
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      credentials: "include",
      cache: "no-store",
    });
    let result;

    try {
      result = await response.json();
    } catch (error) {
      throw new Error("The server returned an invalid response.");
    }

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to generate the report.");
    }

    return result.data;
  }

  function initializeDateRange() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

    if (elements.startDate && !elements.startDate.value) {
      elements.startDate.value = dateInputValue(firstDay);
    }

    if (elements.endDate && !elements.endDate.value) {
      elements.endDate.value = dateInputValue(today);
    }
  }

  function buildReportUrl() {
    const parameters = new URLSearchParams({
      start_date: elements.startDate?.value || "",
      end_date: elements.endDate?.value || "",
    });

    if (elements.barangay?.value) {
      parameters.set("barangay", elements.barangay.value);
    }

    if (elements.rentalType?.value) {
      parameters.set("rental_type_id", elements.rentalType.value);
    }

    return `${REPORT_ENDPOINT}?${parameters.toString()}`;
  }

  function populateRentalTypes(types) {
    if (!elements.rentalType) return;

    const selected = elements.rentalType.value;
    elements.rentalType.innerHTML = `
      <option value="">All rental types</option>
      ${types
        .map(
          (type) =>
            `<option value="${escapeHtml(type.id)}">${escapeHtml(type.name)}</option>`,
        )
        .join("")}
    `;

    if (
      [...elements.rentalType.options].some(
        (option) => option.value === selected,
      )
    ) {
      elements.rentalType.value = selected;
    }
  }

  function selectedRentalTypeName() {
    return (
      elements.rentalType?.selectedOptions?.[0]?.textContent ||
      "All rental types"
    );
  }

  function renderReportMeta(data) {
    const start = formatDate(data.filters.start_date);
    const end = formatDate(data.filters.end_date);
    const dateLabel = start === end ? start : `${start} – ${end}`;
    const scopes = [
      data.filters.barangay || "All barangays",
      selectedRentalTypeName(),
    ];
    const scopeLabel = scopes.join(" • ");

    setText("#report-period-title", dateLabel);
    setText("#report-scope-text", scopeLabel);
    setText(
      "#report-generated-pill",
      `Generated ${formatDateTime(data.generated_at)}`,
    );
    setText("#print-period", dateLabel);
    setText("#print-scope", scopeLabel);
    setText("#print-admin", data.generated_by || "Administrator");
    setText("#print-generated-at", formatDateTime(data.generated_at));
  }

  function trendText(value, label) {
    if (value === null || value === undefined) {
      return `New ${label}; no previous baseline`;
    }

    const amount = Number(value) || 0;
    if (amount === 0) return `No change from previous period`;
    return `${amount > 0 ? "↑" : "↓"} ${Math.abs(amount).toFixed(1)}% vs previous period`;
  }

  function applyTrend(selector, value, label) {
    const element = document.querySelector(selector);
    if (!element) return;

    element.textContent = trendText(value, label);
    element.classList.remove("positive", "negative");

    if (value !== null && Number(value) !== 0) {
      element.classList.add(Number(value) > 0 ? "positive" : "negative");
    }
  }

  function renderOverview(data) {
    const overview = data.overview;

    setText("#kpi-new-users", number(overview.new_users));
    setText("#kpi-active-listings", number(overview.active_listings));
    setText("#kpi-inquiries", number(overview.inquiries));
    setText("#kpi-favorites", number(overview.favorites));
    setText("#kpi-response-rate", percent(overview.landlord_response_rate));
    setText("#kpi-average-rating", rating(overview.average_rating));
    setText(
      "#kpi-pending-verifications",
      number(overview.pending_verifications),
    );
    setText("#kpi-total-reviews", number(overview.total_reviews));

    applyTrend("#trend-new-users", overview.trends.new_users, "users");
    applyTrend("#trend-inquiries", overview.trends.inquiries, "inquiries");
    applyTrend("#trend-reviews", overview.trends.reviews, "reviews");
  }

  function buildInsights(data) {
    const insights = [];
    const inquiries = data.inquiries;
    const verification = data.verification;
    const listings = data.listing_summary;
    const reviews = data.reviews;
    const strongestDemand = data.demand_by_barangay?.[0];

    if (inquiries.unanswered_over_48_hours > 0) {
      insights.push({
        type: "critical",
        title: `${number(inquiries.unanswered_over_48_hours)} inquiries need attention`,
        finding:
          "These inquiries have no landlord response after more than 48 hours.",
        action:
          "Notify the affected landlords and monitor their response performance.",
      });
    }

    if (inquiries.total > 0 && inquiries.response_rate < 75) {
      insights.push({
        type: "warning",
        title: `Response rate is ${percent(inquiries.response_rate)}`,
        finding:
          "A significant share of renters did not receive a landlord reply in the selected period.",
        action:
          "Introduce response reminders and a suggested 24-hour reply standard.",
      });
    }

    if (verification.pending_over_48_hours > 0) {
      insights.push({
        type: "warning",
        title: `${number(verification.pending_over_48_hours)} verification documents are delayed`,
        finding:
          "These submissions have remained pending for longer than 48 hours.",
        action:
          "Prioritize the oldest verification requests in the admin queue.",
      });
    }

    if (listings.without_images > 0 || listings.stale > 0) {
      insights.push({
        type: "warning",
        title: "Listing quality requires review",
        finding: `${number(listings.without_images)} listings have no image and ${number(listings.stale)} have not been updated for at least 60 days.`,
        action:
          "Prompt landlords to improve incomplete listings and confirm current availability.",
      });
    }

    if (strongestDemand && strongestDemand.demand_score > 0) {
      const supplyText =
        strongestDemand.available_listings > 0
          ? `${number(strongestDemand.available_listings)} available listings`
          : "no available listing";

      insights.push({
        type: strongestDemand.available_listings === 0 ? "critical" : "success",
        title: `${strongestDemand.barangay} has the strongest demand signal`,
        finding: `${number(strongestDemand.demand_score)} demand points compared with ${supplyText}.`,
        action:
          "Use this demand signal when encouraging landlords to add or update rental supply.",
      });
    }

    if (reviews.negative > 0) {
      const topTheme = reviews.themes?.find(
        (theme) => theme.negative_mentions > 0,
      );
      insights.push({
        type: "critical",
        title: `${number(reviews.negative)} negative customer reviews`,
        finding: topTheme
          ? `${topTheme.theme} is the most visible related feedback theme.`
          : "Review the comments to identify recurring renter concerns.",
        action:
          "Open the customer feedback section and address repeated service issues.",
      });
    } else if (reviews.total > 0 && reviews.average_rating >= 4) {
      insights.push({
        type: "success",
        title: `Customer rating is ${reviews.average_rating.toFixed(1)} out of 5`,
        finding:
          "Published customer feedback is generally positive for the selected period.",
        action:
          "Maintain the current service quality and continue monitoring emerging themes.",
      });
    }

    if (insights.length === 0) {
      insights.push({
        type: "success",
        title: "No urgent operational issue detected",
        finding:
          "The available report data does not show a critical threshold for this period.",
        action: "Continue monitoring activity and customer feedback regularly.",
      });
    }

    return insights.slice(0, 6);
  }

  function renderInsights(data) {
    const container = document.querySelector("#report-insights");
    const status = document.querySelector("#report-health-status");
    if (!container || !status) return;

    const insights = buildInsights(data);
    const criticalCount = insights.filter(
      (item) => item.type === "critical",
    ).length;
    const warningCount = insights.filter(
      (item) => item.type === "warning",
    ).length;

    status.className = "report-status-pill";
    if (criticalCount > 0) {
      status.textContent = `${criticalCount} priority issue${criticalCount > 1 ? "s" : ""}`;
      status.classList.add("attention");
    } else if (warningCount > 0) {
      status.textContent = `${warningCount} area${warningCount > 1 ? "s" : ""} to improve`;
    } else {
      status.textContent = "Healthy status";
      status.classList.add("healthy");
    }

    container.innerHTML = insights
      .map(
        (insight) => `
          <article class="report-insight-card ${escapeHtml(insight.type)}">
            <div>
              <h3>${escapeHtml(insight.title)}</h3>
              <p>${escapeHtml(insight.finding)}</p>
              <span class="report-insight-action">Recommended: ${escapeHtml(insight.action)}</span>
            </div>
          </article>
        `,
      )
      .join("");
  }

  function trendLabel(value) {
    const date = parseDatabaseDate(value);
    if (!date) return value;
    return date.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  }

  function renderTrend(data) {
    const container = document.querySelector("#report-trend-chart");
    if (!container) return;

    const points = Array.isArray(data.trend) ? data.trend : [];
    if (points.length < 1) {
      container.innerHTML = `<div class="report-empty-state">No activity was recorded for this period.</div>`;
      return;
    }

    const width = 760;
    const height = 250;
    const padding = { top: 18, right: 18, bottom: 35, left: 38 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const metrics = [
      { key: "users", color: "#1734c7" },
      { key: "listings", color: "#168b57" },
      { key: "inquiries", color: "#7159d9" },
      { key: "reviews", color: "#d6a900" },
    ];
    const maximum = Math.max(
      1,
      ...points.flatMap((point) =>
        metrics.map((metric) => Number(point[metric.key]) || 0),
      ),
    );
    const xAt = (index) =>
      points.length === 1
        ? padding.left + plotWidth / 2
        : padding.left + (index / (points.length - 1)) * plotWidth;
    const yAt = (value) =>
      padding.top + plotHeight - ((Number(value) || 0) / maximum) * plotHeight;
    const grid = [0, 0.25, 0.5, 0.75, 1]
      .map((ratio) => {
        const y = padding.top + plotHeight - ratio * plotHeight;
        const value = Math.round(maximum * ratio);
        return `
          <line class="report-trend-grid-line" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"></line>
          <text class="report-trend-label" x="${padding.left - 9}" y="${y + 3}" text-anchor="end">${value}</text>
        `;
      })
      .join("");
    const paths = metrics
      .map((metric) => {
        const coordinates = points
          .map((point, index) => `${xAt(index)},${yAt(point[metric.key])}`)
          .join(" ");
        const dots = points
          .map(
            (point, index) =>
              `<circle cx="${xAt(index)}" cy="${yAt(point[metric.key])}" r="2.8" fill="${metric.color}"></circle>`,
          )
          .join("");
        return `<polyline class="report-trend-path" points="${coordinates}" stroke="${metric.color}"></polyline>${dots}`;
      })
      .join("");
    const labelStep = Math.max(1, Math.ceil(points.length / 7));
    const labels = points
      .map((point, index) => {
        if (index % labelStep !== 0 && index !== points.length - 1) return "";
        return `<text class="report-trend-label" x="${xAt(index)}" y="${height - 10}" text-anchor="middle">${escapeHtml(trendLabel(point.date))}</text>`;
      })
      .join("");

    container.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Platform activity trend chart">
        ${grid}
        ${paths}
        ${labels}
      </svg>
    `;
  }

  function renderListingHealth(data) {
    const summary = data.listing_summary;
    const total = Number(summary.total) || 0;
    const availableShare =
      total > 0 ? Math.min(100, (Number(summary.available) / total) * 100) : 0;
    const donut = document.querySelector("#listing-health-donut");

    if (donut) {
      donut.style.background = `conic-gradient(#168b57 0 ${availableShare}%, #f2c84b ${availableShare}% 100%)`;
    }

    setText("#listing-health-total", number(total));
    setText("#listing-available", number(summary.available));
    setText("#listing-occupied", number(summary.occupied));
    setText("#listing-without-images", number(summary.without_images));
    setText("#listing-stale", number(summary.stale));
    setText("#listing-average-price", currency(summary.average_price));
  }

  function renderDemand(data) {
    const rows = data.demand_by_barangay || [];
    const visual = document.querySelector("#demand-visual");
    const body = document.querySelector("#demand-table-body");
    if (!visual || !body) return;

    if (rows.length < 1) {
      visual.innerHTML = `<div class="report-empty-state">No barangay demand data is available.</div>`;
      body.innerHTML = `<tr><td colspan="7" class="admin-table-message">No demand data found for this scope.</td></tr>`;
      return;
    }

    const maximum = Math.max(
      1,
      ...rows.map((row) => Number(row.demand_score) || 0),
    );
    visual.innerHTML = rows
      .slice(0, 8)
      .map(
        (row) => `
          <div class="demand-bar-row">
            <span title="${escapeHtml(row.barangay)}">${escapeHtml(row.barangay)}</span>
            <div class="demand-bar-track">
              <i class="demand-bar-fill" style="width:${Math.max(2, (Number(row.demand_score) / maximum) * 100)}%"></i>
            </div>
            <strong>${number(row.demand_score)}</strong>
          </div>
        `,
      )
      .join("");

    body.innerHTML = rows
      .map((row) => {
        const ratio =
          row.demand_per_available_listing === null
            ? "No available supply"
            : Number(row.demand_per_available_listing).toFixed(2);
        return `
          <tr>
            <td><span class="report-table-primary">${escapeHtml(row.barangay)}</span></td>
            <td>${number(row.available_listings)}</td>
            <td>${number(row.inquiries)}</td>
            <td>${number(row.favorites)}</td>
            <td><span class="report-score">${number(row.demand_score)}</span></td>
            <td>${escapeHtml(ratio)}</td>
            <td>${currency(row.average_price)}</td>
          </tr>
        `;
      })
      .join("");
  }

  function renderTopListings(data) {
    const body = document.querySelector("#listing-performance-body");
    const listings = data.top_listings || [];
    if (!body) return;

    if (listings.length < 1) {
      body.innerHTML = `<tr><td colspan="8" class="admin-table-message">No listing performance data found.</td></tr>`;
      return;
    }

    body.innerHTML = listings
      .map(
        (listing) => `
          <tr>
            <td>
              <span class="report-table-primary">${escapeHtml(listing.title)}</span>
              <span class="report-table-secondary">${escapeHtml(listing.rental_type)} • ${escapeHtml(listing.availability_status)}</span>
            </td>
            <td>${escapeHtml(listing.landlord_name)}</td>
            <td>${escapeHtml(listing.barangay)}</td>
            <td>${currency(listing.price)}</td>
            <td>${number(listing.inquiries)}</td>
            <td>${number(listing.favorites)}</td>
            <td>${listing.total_reviews > 0 ? `${Number(listing.average_rating).toFixed(1)} / 5` : "No rating"}</td>
            <td><span class="report-score">${number(listing.engagement_score)}</span></td>
          </tr>
        `,
      )
      .join("");
  }

  function statRow(label, value) {
    return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
  }

  function renderOperationalMetrics(data) {
    const inquiries = data.inquiries;
    const verification = data.verification;
    const inquiryList = document.querySelector("#inquiry-stat-list");
    const verificationList = document.querySelector("#verification-stat-list");
    const reasons = document.querySelector("#verification-reasons");

    if (inquiryList) {
      inquiryList.innerHTML = [
        statRow("Total inquiries", number(inquiries.total)),
        statRow("Pending", number(inquiries.pending)),
        statRow("Closed", number(inquiries.closed)),
        statRow("Landlord response rate", percent(inquiries.response_rate)),
        statRow(
          "Average first response",
          `${Number(inquiries.average_response_hours).toFixed(1)} hours`,
        ),
        statRow(
          "Unanswered after 48 hours",
          number(inquiries.unanswered_over_48_hours),
        ),
      ].join("");
    }

    if (verificationList) {
      verificationList.innerHTML = [
        statRow("Submitted this period", number(verification.submitted)),
        statRow("Approved", number(verification.approved)),
        statRow("Rejected", number(verification.rejected)),
        statRow("Current pending backlog", number(verification.pending)),
        statRow(
          "Pending after 48 hours",
          number(verification.pending_over_48_hours),
        ),
        statRow(
          "Average review time",
          `${Number(verification.average_review_hours).toFixed(1)} hours`,
        ),
      ].join("");
    }

    if (reasons) {
      reasons.innerHTML = verification.rejection_reasons?.length
        ? verification.rejection_reasons
            .map(
              (reason) => `
                <div class="report-reason-item">
                  <span>${escapeHtml(reason.reason)}</span>
                  <strong>${number(reason.total)}</strong>
                </div>
              `,
            )
            .join("")
        : `<div class="report-empty-state">No rejection reason was recorded for this period.</div>`;
    }
  }

  function verificationLabel(level) {
    const labels = {
      fully_verified: "Fully verified",
      verified: "Verified",
      unverified: "Unverified",
    };
    return labels[level] || "Unverified";
  }

  function renderLandlords(data) {
    const body = document.querySelector("#landlord-performance-body");
    const landlords = data.landlords || [];
    if (!body) return;

    if (landlords.length < 1) {
      body.innerHTML = `<tr><td colspan="7" class="admin-table-message">No landlord performance data found.</td></tr>`;
      return;
    }

    body.innerHTML = landlords
      .map(
        (landlord) => `
          <tr>
            <td><span class="report-table-primary">${escapeHtml(landlord.landlord_name)}</span></td>
            <td>
              <span class="admin-status ${landlord.verification_level === "unverified" ? "rejected" : "approved"}">
                ${escapeHtml(verificationLabel(landlord.verification_level))}
              </span>
            </td>
            <td>${number(landlord.active_listings)}</td>
            <td>${number(landlord.inquiries)}</td>
            <td>${landlord.inquiries > 0 ? percent(landlord.response_rate) : "No inquiries"}</td>
            <td>${landlord.total_reviews > 0 ? `${Number(landlord.average_rating).toFixed(1)} / 5` : "No rating"}</td>
            <td>${number(landlord.total_reviews)}</td>
          </tr>
        `,
      )
      .join("");
  }

  function renderReviews(data) {
    const reviews = data.reviews;
    const distribution = document.querySelector("#review-distribution");
    const sentiment = document.querySelector("#review-sentiment");
    const themes = document.querySelector("#review-themes");
    const negativeBody = document.querySelector("#negative-review-body");
    const total = Number(reviews.total) || 0;

    setText(
      "#review-average",
      total > 0 ? Number(reviews.average_rating).toFixed(1) : "—",
    );
    setText(
      "#review-total",
      `${number(total)} published review${total === 1 ? "" : "s"}`,
    );
    setText(
      "#review-average-badge",
      total > 0
        ? `${Number(reviews.average_rating).toFixed(1)} / 5`
        : "No reviews",
    );

    if (distribution) {
      const maximum = Math.max(
        1,
        ...Object.values(reviews.distribution || {}).map(Number),
      );
      distribution.innerHTML = [5, 4, 3, 2, 1]
        .map((score) => {
          const amount = Number(reviews.distribution?.[score] || 0);
          return `
            <div class="review-rating-row">
              <span>${score}★</span>
              <span class="review-rating-track"><i style="width:${(amount / maximum) * 100}%"></i></span>
              <strong>${number(amount)}</strong>
            </div>
          `;
        })
        .join("");
    }

    if (sentiment) {
      sentiment.innerHTML = `
        <div class="review-sentiment-item positive">
          <span>Positive (4–5 stars)</span><strong>${number(reviews.positive)}</strong>
        </div>
        <div class="review-sentiment-item neutral">
          <span>Neutral (3 stars)</span><strong>${number(reviews.neutral)}</strong>
        </div>
        <div class="review-sentiment-item negative">
          <span>Negative (1–2 stars)</span><strong>${number(reviews.negative)}</strong>
        </div>
        <div class="review-sentiment-item">
          <span>Platform reviews</span><strong>${number(reviews.platform)}</strong>
        </div>
        <div class="review-sentiment-item">
          <span>Listing reviews</span><strong>${number(reviews.listing)}</strong>
        </div>
      `;
    }

    if (themes) {
      themes.innerHTML = reviews.themes?.length
        ? reviews.themes
            .map(
              (theme) => `
                <div class="review-theme-item">
                  <span>${escapeHtml(theme.theme)}<br />${number(theme.negative_mentions)} negative mention${theme.negative_mentions === 1 ? "" : "s"}</span>
                  <strong>${number(theme.mentions)}</strong>
                </div>
              `,
            )
            .join("")
        : `<div class="report-empty-state">No recurring review theme was detected.</div>`;
    }

    if (negativeBody) {
      negativeBody.innerHTML = reviews.negative_reviews?.length
        ? reviews.negative_reviews
            .map(
              (review) => `
                <tr>
                  <td>${escapeHtml(formatDate(review.created_at, { short: true }))}</td>
                  <td>${escapeHtml(review.customer_name)}</td>
                  <td>${escapeHtml(review.subject)}</td>
                  <td><span class="admin-status rejected">${number(review.rating)} / 5</span></td>
                  <td>${escapeHtml(review.comment)}</td>
                </tr>
              `,
            )
            .join("")
        : `<tr><td colspan="5" class="admin-table-message">No negative customer review was recorded for this period.</td></tr>`;
    }
  }

  function renderAll(data) {
    state.data = data;
    populateRentalTypes(data.rental_types || []);
    renderReportMeta(data);
    renderOverview(data);
    renderInsights(data);
    renderTrend(data);
    renderListingHealth(data);
    renderDemand(data);
    renderTopListings(data);
    renderOperationalMetrics(data);
    renderLandlords(data);
    renderReviews(data);
    window.SilipMuntiAdminShell?.setPendingCount(data.verification.pending);
  }

  async function loadReport() {
    if (state.loading) return;

    hideMessage();
    setLoading(true);

    try {
      const data = await fetchJson(buildReportUrl());
      renderAll(data);
    } catch (error) {
      showMessage(error.message || "Unable to generate the report.");
    } finally {
      setLoading(false);
    }
  }

  function csvCell(value) {
    let output = String(value ?? "");
    if (/^[=+\-@]/.test(output)) output = `'${output}`;
    return `"${output.replaceAll('"', '""')}"`;
  }

  function pushCsvRow(rows, values = []) {
    rows.push(values.map(csvCell).join(","));
  }

  function exportCsv() {
    const data = state.data;
    if (!data) return;

    const rows = [];
    pushCsvRow(rows, ["SILIPMUNTI PERFORMANCE REPORT"]);
    pushCsvRow(rows, [
      "Reporting period",
      data.filters.start_date,
      data.filters.end_date,
    ]);
    pushCsvRow(rows, ["Barangay", data.filters.barangay || "All barangays"]);
    pushCsvRow(rows, ["Rental type", selectedRentalTypeName()]);
    pushCsvRow(rows, ["Generated by", data.generated_by || "Administrator"]);
    pushCsvRow(rows, ["Generated on", data.generated_at]);
    rows.push("");

    pushCsvRow(rows, ["EXECUTIVE SUMMARY"]);
    [
      ["New users", data.overview.new_users],
      ["Active listings", data.overview.active_listings],
      ["Inquiries", data.overview.inquiries],
      ["Favorites", data.overview.favorites],
      ["Landlord response rate", percent(data.overview.landlord_response_rate)],
      ["Average rating", data.overview.average_rating],
      ["Pending verifications", data.overview.pending_verifications],
      ["Customer reviews", data.overview.total_reviews],
    ].forEach((row) => pushCsvRow(rows, row));
    rows.push("");

    pushCsvRow(rows, ["DEMAND AND SUPPLY BY BARANGAY"]);
    pushCsvRow(rows, [
      "Barangay",
      "Available listings",
      "Inquiries",
      "Favorites",
      "Demand score",
      "Demand per listing",
      "Average price",
    ]);
    data.demand_by_barangay.forEach((row) =>
      pushCsvRow(rows, [
        row.barangay,
        row.available_listings,
        row.inquiries,
        row.favorites,
        row.demand_score,
        row.demand_per_available_listing ?? "No available supply",
        row.average_price,
      ]),
    );
    rows.push("");

    pushCsvRow(rows, ["LISTING PERFORMANCE"]);
    pushCsvRow(rows, [
      "Listing",
      "Landlord",
      "Barangay",
      "Rental type",
      "Price",
      "Inquiries",
      "Favorites",
      "Average rating",
      "Engagement score",
    ]);
    data.top_listings.forEach((row) =>
      pushCsvRow(rows, [
        row.title,
        row.landlord_name,
        row.barangay,
        row.rental_type,
        row.price,
        row.inquiries,
        row.favorites,
        row.average_rating,
        row.engagement_score,
      ]),
    );
    rows.push("");

    pushCsvRow(rows, ["LANDLORD PERFORMANCE"]);
    pushCsvRow(rows, [
      "Landlord",
      "Verification",
      "Listings",
      "Inquiries",
      "Response rate",
      "Average rating",
      "Reviews",
    ]);
    data.landlords.forEach((row) =>
      pushCsvRow(rows, [
        row.landlord_name,
        verificationLabel(row.verification_level),
        row.active_listings,
        row.inquiries,
        percent(row.response_rate),
        row.average_rating,
        row.total_reviews,
      ]),
    );
    rows.push("");

    pushCsvRow(rows, ["CUSTOMER REVIEWS REQUIRING ATTENTION"]);
    pushCsvRow(rows, ["Date", "Customer", "Subject", "Rating", "Feedback"]);
    data.reviews.negative_reviews.forEach((row) =>
      pushCsvRow(rows, [
        row.created_at,
        row.customer_name,
        row.subject,
        row.rating,
        row.comment,
      ]),
    );

    const blob = new Blob(["\ufeff", rows.join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `SilipMunti-Report-${data.filters.start_date}-to-${data.filters.end_date}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function setupSearch() {
    elements.search?.addEventListener("input", () => {
      const keyword = elements.search.value.trim().toLowerCase();

      document.querySelectorAll(".report-section").forEach((section) => {
        const searchable =
          `${section.dataset.reportSearch || ""} ${section.textContent || ""}`.toLowerCase();
        section.classList.toggle(
          "search-hidden",
          keyword !== "" && !searchable.includes(keyword),
        );
      });
    });
  }

  function setupEvents() {
    elements.form?.addEventListener("submit", (event) => {
      event.preventDefault();

      if (
        elements.startDate?.value &&
        elements.endDate?.value &&
        elements.startDate.value > elements.endDate.value
      ) {
        showMessage("Start date must not be later than end date.");
        return;
      }

      loadReport();
    });

    elements.refresh?.addEventListener("click", loadReport);
    elements.exportCsv?.addEventListener("click", exportCsv);
    elements.print?.addEventListener("click", () => {
      if (state.data) window.print();
    });
    setupSearch();
  }

  async function initialize() {
    const admin = await requireAdmin();
    if (!admin) return;

    initializeDateRange();
    setupEvents();
    await loadReport();
  }

  initialize();
})();
