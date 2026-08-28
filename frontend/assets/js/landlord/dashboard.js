const LANDLORD_FRONTEND_BASE = "/SilipMunti/frontend";
const LANDLORD_LISTINGS_API = "/SilipMunti/backend/landlord/get-listings.php";

const LANDLORD_DOCUMENTS_API = "/SilipMunti/backend/landlord/get-documents.php";

const LANDLORD_INQUIRIES_API =
  "/SilipMunti/backend/inquiries/get-inquiries.php";

const NOTIFICATIONS_API = "/SilipMunti/backend/notifications/get-all.php";

const LANDLORD_LANDLORD_FRONTEND_BASE = "/SilipMunti/frontend";

const topbarProfileButton = document.querySelector("#topbar-profile-button");

const topbarProfileDropdown = document.querySelector(
  "#topbar-profile-dropdown",
);

const dropdownLandlordPicture = document.querySelector(
  "#dropdown-landlord-picture",
);

const dropdownLandlordName = document.querySelector("#dropdown-landlord-name");

const topbarLogoutButton = document.querySelector("#topbar-logout-button");

const sidebar = document.querySelector("#dashboard-sidebar");
const sidebarToggle = document.querySelector("#sidebar-toggle");
const sidebarClose = document.querySelector("#sidebar-close");
const logoutButton = document.querySelector("#logout-button");
const dashboardSearch = document.querySelector("#dashboard-search");

const landlordName = document.querySelector("#landlord-name");
const landlordTopbarName = document.querySelector("#landlord-topbar-name");
const landlordProfilePicture = document.querySelector(
  "#landlord-profile-picture",
);
const currentDateElement = document.querySelector("#current-date");

const verificationBanner = document.querySelector("#verification-banner");
const verificationTitle = document.querySelector("#verification-title");
const verificationDescription = document.querySelector(
  "#verification-description",
);
const verificationStatus = document.querySelector("#verification-status");

const totalListingsElement = document.querySelector("#total-listings");
const verifiedListingsElement = document.querySelector("#verified-listings");
const pendingListingsElement = document.querySelector("#pending-listings");
const activeInquiriesElement = document.querySelector("#active-inquiries");

const sidebarListingCount = document.querySelector("#sidebar-listing-count");
const sidebarMessageCount = document.querySelector("#sidebar-message-count");

const summaryTotal = document.querySelector("#summary-total");
const summaryVerified = document.querySelector("#summary-verified");
const summaryPending = document.querySelector("#summary-pending");
const summaryRejected = document.querySelector("#summary-rejected");
const summaryUnavailable = document.querySelector("#summary-unavailable");
const listingDonutChart = document.querySelector("#listing-donut-chart");

const recentListingsBody = document.querySelector("#recent-listings-body");
const recentInquiriesList = document.querySelector("#recent-inquiries-list");

const notificationButton = document.querySelector("#notification-button");
const notificationCount = document.querySelector("#notification-count");
const dashboardMessage = document.querySelector("#dashboard-message");

let landlordListings = [];
let landlordInquiries = [];
let landlordDocuments = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatCurrency(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "₱0";
  }

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value) {
  if (!value) {
    return "No date";
  }

  const normalizedValue = String(value).replace(" ", "T");
  const date = new Date(normalizedValue);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatRelativeTime(value) {
  if (!value) {
    return "";
  }

  const normalizedValue = String(value).replace(" ", "T");
  const date = new Date(normalizedValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const difference = Date.now() - date.getTime();
  const seconds = Math.floor(difference / 1000);

  if (seconds < 60) {
    return "Just now";
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return `${days}d ago`;
  }

  return formatDate(value);
}

function getInitials(name) {
  const words = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "R";
  }

  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

function getProfilePictureUrl(path) {
  if (!path) {
    return `${LANDLORD_FRONTEND_BASE}/assets/images/default-profile.png`;
  }

  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("/")
  ) {
    return path;
  }

  return `/SilipMunti/backend/${path}`;
}

function getListingImage(listing) {
  const firstImage = listing.images?.[0]?.image_url;

  if (firstImage) {
    return firstImage;
  }

  return `${LANDLORD_FRONTEND_BASE}/assets/images/property-placeholder.png`;
}

function showDashboardMessage(message, type = "error") {
  if (!dashboardMessage) {
    return;
  }

  dashboardMessage.textContent = message;
  dashboardMessage.className = `dashboard-message ${type}`;

  window.clearTimeout(showDashboardMessage.timeout);

  showDashboardMessage.timeout = window.setTimeout(() => {
    dashboardMessage.className = "dashboard-message hidden";
    dashboardMessage.textContent = "";
  }, 4000);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...options,
  });

  let result;

  try {
    result = await response.json();
  } catch (error) {
    throw new Error("The server returned an invalid response.");
  }

  if (!response.ok || !result.success) {
    const requestError = new Error(
      result.message || "Unable to complete the request.",
    );

    requestError.status = response.status;
    throw requestError;
  }

  return result;
}

function displayCurrentDate() {
  if (!currentDateElement) {
    return;
  }

  currentDateElement.textContent = new Intl.DateTimeFormat("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
}

async function loadAuthenticatedLandlord() {
  const sessionManager = window.SilipMuntiSession;

  if (!sessionManager?.getCurrentUser) {
    throw new Error("Session manager is unavailable.");
  }

  const user = await sessionManager.getCurrentUser();

  if (!user) {
    window.location.href = `${LANDLORD_FRONTEND_BASE}/pages/auth/login.html`;
    return null;
  }

  if (user.role !== "landlord") {
    window.location.href = `${LANDLORD_FRONTEND_BASE}/index.html`;
    return null;
  }

  const fullName =
    `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || "Landlord";

  landlordName.textContent = user.first_name || fullName;
  landlordTopbarName.textContent = fullName;
  dropdownLandlordName.textContent = fullName;

  landlordProfilePicture.src = getProfilePictureUrl(user.profile_picture);
  dropdownLandlordPicture.src = getProfilePictureUrl(user.profile_picture);

  landlordProfilePicture.addEventListener(
    "error",
    () => {
      landlordProfilePicture.src = `${LANDLORD_FRONTEND_BASE}/assets/images/default-profile.png`;
    },
    { once: true },
  );

  return user;
}

function countListings() {
  const verified = landlordListings.filter((listing) =>
    ["verified", "approved"].includes(
      String(listing.verification_status).toLowerCase(),
    ),
  ).length;

  const pending = landlordListings.filter(
    (listing) =>
      String(listing.verification_status).toLowerCase() === "pending",
  ).length;

  const rejected = landlordListings.filter(
    (listing) =>
      String(listing.verification_status).toLowerCase() === "rejected",
  ).length;

  const unavailable = landlordListings.filter(
    (listing) =>
      String(listing.availability_status).toLowerCase() !== "available",
  ).length;

  return {
    total: landlordListings.length,
    verified,
    pending,
    rejected,
    unavailable,
  };
}

function updateListingStatistics() {
  const counts = countListings();

  totalListingsElement.textContent = counts.total;
  verifiedListingsElement.textContent = counts.verified;
  pendingListingsElement.textContent = counts.pending;
  sidebarListingCount.textContent = counts.total;

  summaryTotal.textContent = counts.total;
  summaryVerified.textContent = counts.verified;
  summaryPending.textContent = counts.pending;
  summaryRejected.textContent = counts.rejected;
  summaryUnavailable.textContent = counts.unavailable;

  updateDonutChart(counts);
}

function updateDonutChart(counts) {
  if (!listingDonutChart) {
    return;
  }

  if (counts.total === 0) {
    listingDonutChart.style.background = "#e5e8ef";
    return;
  }

  const verifiedDegrees = (counts.verified / counts.total) * 360;
  const pendingDegrees = (counts.pending / counts.total) * 360;
  const rejectedDegrees = (counts.rejected / counts.total) * 360;

  const verifiedEnd = verifiedDegrees;
  const pendingEnd = verifiedEnd + pendingDegrees;
  const rejectedEnd = pendingEnd + rejectedDegrees;

  listingDonutChart.style.background = `
    conic-gradient(
      #168b57 0deg ${verifiedEnd}deg,
      #f7d447 ${verifiedEnd}deg ${pendingEnd}deg,
      #d84a5b ${pendingEnd}deg ${rejectedEnd}deg,
      #cbd0da ${rejectedEnd}deg 360deg
    )
  `;
}

function getVerificationStatus() {
  const requiredTypes = ["valid_id", "barangay_clearance", "land_title"];

  const latestDocuments = new Map();

  landlordDocuments.forEach((document) => {
    const type = document.document_type;

    if (!latestDocuments.has(type)) {
      latestDocuments.set(type, document);
    }
  });

  const requiredDocuments = requiredTypes.map((type) =>
    latestDocuments.get(type),
  );

  const submittedCount = requiredDocuments.filter(Boolean).length;

  const approvedCount = requiredDocuments.filter((document) =>
    ["approved", "verified"].includes(
      String(document?.verification_status).toLowerCase(),
    ),
  ).length;

  const hasRejected = requiredDocuments.some(
    (document) =>
      String(document?.verification_status).toLowerCase() === "rejected",
  );

  const hasPending = requiredDocuments.some(
    (document) =>
      String(document?.verification_status).toLowerCase() === "pending",
  );

  if (approvedCount === requiredTypes.length) {
    return {
      status: "approved",
      title: "Your landlord account is verified",
      description: "All required documents have been reviewed and approved.",
      label: "Verified",
    };
  }

  if (hasRejected) {
    return {
      status: "rejected",
      title: "A verification document was rejected",
      description:
        "Review the rejection reason and upload a valid replacement document.",
      label: "Action required",
    };
  }

  if (hasPending) {
    return {
      status: "pending",
      title: "Your documents are being reviewed",
      description: `${submittedCount} of ${requiredTypes.length} required documents have been submitted.`,
      label: "Pending",
    };
  }

  return {
    status: "pending",
    title: "Complete your landlord verification",
    description: `${submittedCount} of ${requiredTypes.length} required documents have been submitted.`,
    label: "Incomplete",
  };
}

function renderVerificationStatus() {
  const verification = getVerificationStatus();

  verificationTitle.textContent = verification.title;
  verificationDescription.textContent = verification.description;
  verificationStatus.textContent = verification.label;
  verificationStatus.className = `verification-badge status-${verification.status}`;

  verificationBanner.dataset.status = verification.status;
}

function renderRecentListings(listings = landlordListings) {
  if (!recentListingsBody) {
    return;
  }

  const recentListings = [...listings].slice(0, 5);

  if (recentListings.length === 0) {
    recentListingsBody.innerHTML = `
      <tr>
        <td colspan="6" class="table-message">
          No properties found.
        </td>
      </tr>
    `;
    return;
  }

  recentListingsBody.innerHTML = recentListings
    .map((listing) => {
      const verification = String(
        listing.verification_status || "pending",
      ).toLowerCase();

      const availability = String(
        listing.availability_status || "unavailable",
      ).toLowerCase();

      return `
        <tr>
          <td>
            <div class="property-cell">
              <img
                src="${escapeHtml(getListingImage(listing))}"
                alt="${escapeHtml(listing.title)}"
                onerror="this.src='${LANDLORD_FRONTEND_BASE}/assets/images/property-placeholder.png'"
              />

              <div>
                <strong>${escapeHtml(listing.title)}</strong>

                <span>
                  ${escapeHtml(listing.barangay)},
                  ${escapeHtml(listing.city)}
                </span>
              </div>
            </div>
          </td>

          <td>${escapeHtml(listing.rental_type || "Not specified")}</td>

          <td>
            <strong>${formatCurrency(listing.price)}</strong>
          </td>

          <td>
            <span class="table-status ${escapeHtml(verification)}">
              ${escapeHtml(verification)}
            </span>
          </td>

          <td>
            <span class="table-status ${escapeHtml(availability)}">
              ${escapeHtml(availability)}
            </span>
          </td>

          <td>
            <a
              href="edit-listing.html?id=${Number(listing.id)}"
              class="table-action"
              aria-label="Manage ${escapeHtml(listing.title)}"
            >
              <i class="fa-solid fa-ellipsis"></i>
            </a>
          </td>
        </tr>
      `;
    })
    .join("");
}

function getActiveInquiries() {
  return landlordInquiries.filter(
    (inquiry) => String(inquiry.inquiry_status).toLowerCase() !== "closed",
  );
}

function updateInquiryStatistics() {
  const activeInquiries = getActiveInquiries();

  activeInquiriesElement.textContent = activeInquiries.length;

  const unreadMessages = landlordInquiries.reduce(
    (total, inquiry) => total + Number(inquiry.unread_count || 0),
    0,
  );

  sidebarMessageCount.textContent = unreadMessages;
  sidebarMessageCount.classList.toggle("hidden", unreadMessages < 1);
}

function renderRecentInquiries(inquiries = landlordInquiries) {
  if (!recentInquiriesList) {
    return;
  }

  const recentInquiries = [...inquiries].slice(0, 6);

  if (recentInquiries.length === 0) {
    recentInquiriesList.innerHTML = `
      <div class="empty-panel">
        <span>No renter inquiries yet.</span>
      </div>
    `;
    return;
  }

  recentInquiriesList.innerHTML = recentInquiries
    .map((inquiry) => {
      const renterName =
        inquiry.other_user?.name || inquiry.renter_name || "Renter";

      const lastMessage = inquiry.last_message || "No message available.";

      const unreadCount = Number(inquiry.unread_count || 0);

      return `
        <article class="inquiry-item">
          <div class="inquiry-avatar">
            ${escapeHtml(getInitials(renterName))}

            ${
              unreadCount > 0
                ? `
                  <span class="inquiry-unread">
                    ${unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                `
                : ""
            }
          </div>

          <div class="inquiry-content">
            <div class="inquiry-heading">
              <strong>${escapeHtml(renterName)}</strong>

              <time>
                ${escapeHtml(
                  formatRelativeTime(
                    inquiry.last_message_at || inquiry.created_at,
                  ),
                )}
              </time>
            </div>

            <span class="inquiry-property">
              ${escapeHtml(inquiry.listing_title)}
            </span>

            <span class="inquiry-message">
              ${escapeHtml(lastMessage)}
            </span>
          </div>

          <a
            href="${LANDLORD_FRONTEND_BASE}/pages/messages/index.html?inquiry_id=${Number(inquiry.inquiry_id)}"
            class="inquiry-open"
            aria-label="Open conversation with ${escapeHtml(renterName)}"
          >
            <i class="fa-solid fa-chevron-right"></i>
          </a>
        </article>
      `;
    })
    .join("");
}

async function loadListings() {
  const result = await fetchJson(LANDLORD_LISTINGS_API);

  landlordListings = Array.isArray(result.data?.listings)
    ? result.data.listings
    : [];

  updateListingStatistics();
  renderRecentListings();
}

async function loadDocuments() {
  const result = await fetchJson(LANDLORD_DOCUMENTS_API);

  landlordDocuments = Array.isArray(result.data?.documents)
    ? result.data.documents
    : [];

  renderVerificationStatus();
}

async function loadInquiries() {
  const result = await fetchJson(LANDLORD_INQUIRIES_API);

  landlordInquiries = Array.isArray(result.data?.inquiries)
    ? result.data.inquiries
    : [];

  updateInquiryStatistics();
  renderRecentInquiries();
}

async function loadNotificationCount() {
  try {
    const result = await fetchJson(`${NOTIFICATIONS_API}?status=unread`);

    const unreadCount = Number(result.data?.unread_count || 0);

    notificationCount.textContent = unreadCount > 99 ? "99+" : unreadCount;

    notificationCount.classList.toggle("hidden", unreadCount < 1);
  } catch (error) {
    notificationCount.classList.add("hidden");
  }
}

function showLoadingStates() {
  recentListingsBody.innerHTML = `
    <tr>
      <td colspan="6" class="table-message">
        Loading properties...
      </td>
    </tr>
  `;

  recentInquiriesList.innerHTML = `
    <div class="panel-loading">
      <i class="fa-solid fa-spinner fa-spin"></i>
      <span>Loading inquiries...</span>
    </div>
  `;
}

function showListingsError() {
  recentListingsBody.innerHTML = `
    <tr>
      <td colspan="6" class="table-message">
        Unable to load properties.
      </td>
    </tr>
  `;
}

function showInquiriesError() {
  recentInquiriesList.innerHTML = `
    <div class="empty-panel">
      <span>Unable to load inquiries.</span>
    </div>
  `;
}

function initializeDashboardSearch() {
  dashboardSearch?.addEventListener("input", () => {
    const keyword = dashboardSearch.value.trim().toLowerCase();

    if (keyword === "") {
      renderRecentListings();
      renderRecentInquiries();
      return;
    }

    const filteredListings = landlordListings.filter(
      (listing) =>
        String(listing.title).toLowerCase().includes(keyword) ||
        String(listing.address).toLowerCase().includes(keyword) ||
        String(listing.barangay).toLowerCase().includes(keyword) ||
        String(listing.rental_type).toLowerCase().includes(keyword),
    );

    const filteredInquiries = landlordInquiries.filter(
      (inquiry) =>
        String(inquiry.renter_name).toLowerCase().includes(keyword) ||
        String(inquiry.listing_title).toLowerCase().includes(keyword) ||
        String(inquiry.last_message).toLowerCase().includes(keyword),
    );

    renderRecentListings(filteredListings);
    renderRecentInquiries(filteredInquiries);
  });
}

async function initializeDashboard() {
  displayCurrentDate();
  initializeDashboardSearch();
  showLoadingStates();

  try {
    const user = await loadAuthenticatedLandlord();

    if (!user) {
      return;
    }
  } catch (error) {
    showDashboardMessage(error.message || "Unable to verify your account.");
    return;
  }

  const results = await Promise.allSettled([
    loadListings(),
    loadDocuments(),
    loadInquiries(),
    loadNotificationCount(),
  ]);

  if (results[0].status === "rejected") {
    showListingsError();
    showDashboardMessage(
      results[0].reason?.message || "Unable to load your properties.",
    );
  }

  if (results[1].status === "rejected") {
    verificationTitle.textContent = "Unable to retrieve verification status";

    verificationDescription.textContent =
      "Refresh the page or open the verification page to check your documents.";

    verificationStatus.textContent = "Unavailable";
    verificationStatus.className = "verification-badge status-rejected";
  }

  if (results[2].status === "rejected") {
    showInquiriesError();
  }
}

document.addEventListener("DOMContentLoaded", initializeDashboard);
