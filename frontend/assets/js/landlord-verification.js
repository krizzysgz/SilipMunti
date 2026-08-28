const GET_DOCUMENTS_API = "/SilipMunti/backend/landlord/get-documents.php";

const UPLOAD_DOCUMENT_API = "/SilipMunti/backend/landlord/upload-document.php";

const REQUIRED_DOCUMENTS = ["valid_id", "barangay_clearance", "land_title"];

const DOCUMENT_NAMES = {
  valid_id: "Valid ID",
  barangay_clearance: "Barangay Clearance",
  land_title: "Land Title",
};

const pageMessage = document.querySelector("#page-message");
const overallStatus = document.querySelector("#overall-status");
const progressBar = document.querySelector("#progress-bar");
const progressText = document.querySelector("#progress-text");
const verificationHeading = document.querySelector("#verification-heading");
const verificationDescription = document.querySelector(
  "#verification-description",
);
const refreshButton = document.querySelector("#refresh-button");
const logoutButton = document.querySelector("#logout-button");
const addPropertyLink = document.querySelector("#add-property-link");
const sidebar = document.querySelector("#dashboard-sidebar");
const sidebarToggle = document.querySelector("#sidebar-toggle");
const sidebarClose = document.querySelector("#sidebar-close");
const topbarProfileButton = document.querySelector("#topbar-profile-button");
const topbarProfileDropdown = document.querySelector(
  "#topbar-profile-dropdown",
);
const topbarLogoutButton = document.querySelector("#topbar-logout-button");
const notificationButton = document.querySelector("#notification-button");
const notificationCount = document.querySelector("#notification-count");

const NOTIFICATIONS_API =
  "/SilipMunti/backend/notifications/get-all.php?status=unread";

let currentDocuments = [];

function showMessage(message, type) {
  pageMessage.textContent = message;
  pageMessage.className = `page-message ${type}`;
}

function hideMessage() {
  pageMessage.textContent = "";
  pageMessage.className = "page-message hidden";
}

function formatDate(dateValue) {
  if (!dateValue) {
    return "";
  }

  const date = new Date(dateValue.replace(" ", "T"));

  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getLatestDocument(documentType) {
  return (
    currentDocuments.find(
      (document) => document.document_type === documentType,
    ) ?? null
  );
}

function updateDocumentCard(documentType) {
  const documentRecord = getLatestDocument(documentType);

  const statusElement = window.document.querySelector(
    `[data-document-status="${documentType}"]`,
  );

  const detailsElement = window.document.querySelector(
    `[data-document-details="${documentType}"]`,
  );

  const rejectionElement = window.document.querySelector(
    `[data-rejection-message="${documentType}"]`,
  );

  const uploadForm = window.document.querySelector(
    `[data-upload-form="${documentType}"]`,
  );

  if (!statusElement || !detailsElement || !rejectionElement || !uploadForm) {
    return;
  }

  const uploadButton = uploadForm.querySelector(".upload-button");

  const uploadButtonText = uploadButton?.querySelector("span");

  statusElement.className = "document-status not-submitted";

  statusElement.textContent = "Not submitted";

  detailsElement.classList.add("hidden");
  detailsElement.textContent = "";

  rejectionElement.classList.add("hidden");
  rejectionElement.textContent = "";

  uploadForm.classList.remove("hidden");

  if (uploadButton) {
    uploadButton.disabled = false;
  }

  if (uploadButtonText) {
    uploadButtonText.textContent = "Upload document";
  }

  if (!documentRecord) {
    return;
  }

  const status = documentRecord.verification_status || "pending";

  statusElement.className = `document-status ${status}`;

  statusElement.textContent = status.charAt(0).toUpperCase() + status.slice(1);

  detailsElement.textContent = `Submitted ${formatDate(documentRecord.created_at)}`;

  detailsElement.classList.remove("hidden");

  if (status === "pending" || status === "approved") {
    uploadForm.classList.add("hidden");
  }

  if (status === "rejected") {
    if (uploadButtonText) {
      uploadButtonText.textContent = "Resubmit document";
    }

    rejectionElement.textContent =
      documentRecord.rejection_reason ||
      "This document was rejected. Please upload a corrected copy.";

    rejectionElement.classList.remove("hidden");
  }
}

function updateOverallStatus() {
  const approvedDocuments = REQUIRED_DOCUMENTS.filter((documentType) => {
    const document = getLatestDocument(documentType);

    return document?.verification_status === "approved";
  });

  const pendingDocuments = REQUIRED_DOCUMENTS.filter((documentType) => {
    const document = getLatestDocument(documentType);

    return document?.verification_status === "pending";
  });

  const rejectedDocuments = REQUIRED_DOCUMENTS.filter((documentType) => {
    const document = getLatestDocument(documentType);

    return document?.verification_status === "rejected";
  });

  const approvedCount = approvedDocuments.length;
  const progressPercentage = (approvedCount / REQUIRED_DOCUMENTS.length) * 100;

  progressBar.style.width = `${progressPercentage}%`;
  progressText.textContent = `${approvedCount} of ${REQUIRED_DOCUMENTS.length} approved`;

  if (approvedCount === REQUIRED_DOCUMENTS.length) {
    overallStatus.className = "overall-status approved";
    overallStatus.innerHTML =
      '<i class="fa-solid fa-circle-check"></i><span>Verified</span>';

    verificationHeading.textContent = "Your landlord account is verified";

    verificationDescription.textContent =
      "You can now create, edit, and manage rental property listings.";

    addPropertyLink.classList.remove("disabled");
    addPropertyLink.removeAttribute("aria-disabled");

    return;
  }

  addPropertyLink.classList.add("disabled");
  addPropertyLink.setAttribute("aria-disabled", "true");

  if (rejectedDocuments.length > 0) {
    overallStatus.className = "overall-status rejected";
    overallStatus.innerHTML =
      '<i class="fa-solid fa-circle-xmark"></i><span>Needs action</span>';

    verificationHeading.textContent = "Some documents need to be resubmitted";

    verificationDescription.textContent =
      "Review the rejection reason and upload a corrected document.";

    return;
  }

  if (pendingDocuments.length > 0) {
    overallStatus.className = "overall-status pending";
    overallStatus.innerHTML =
      '<i class="fa-solid fa-clock"></i><span>Under review</span>';

    verificationHeading.textContent = "Your documents are being reviewed";

    verificationDescription.textContent =
      "Property management will be available after all documents are approved.";

    return;
  }

  overallStatus.className = "overall-status incomplete";
  overallStatus.innerHTML =
    '<i class="fa-solid fa-triangle-exclamation"></i><span>Incomplete</span>';

  verificationHeading.textContent = "Complete your landlord verification";

  verificationDescription.textContent =
    "Upload all three required documents to start the review process.";
}

function renderDocuments() {
  REQUIRED_DOCUMENTS.forEach(updateDocumentCard);
  updateOverallStatus();
}

async function loadCurrentUser() {
  const user = await window.SilipMuntiSession?.getCurrentUser();

  if (!user) {
    window.location.href = "/SilipMunti/frontend/pages/auth/login.html";
    return null;
  }

  if (user.role !== "landlord") {
    window.location.href = "/SilipMunti/frontend/index.html";
    return null;
  }

  const fullName = `${user.first_name} ${user.last_name}`.trim();

  const displayName = fullName || "Landlord";
  const topbarName = document.querySelector("#landlord-topbar-name");
  const dropdownName = document.querySelector("#dropdown-landlord-name");

  if (topbarName) topbarName.textContent = displayName;
  if (dropdownName) dropdownName.textContent = displayName;

  const profileUrl = user.profile_picture
    ? user.profile_picture.startsWith("/")
      ? user.profile_picture
      : `/SilipMunti/backend/${user.profile_picture}`
    : "/SilipMunti/frontend/assets/images/default-profile.png";

  const topbarPicture = document.querySelector("#landlord-profile-picture");
  const dropdownPicture = document.querySelector("#dropdown-landlord-picture");

  if (topbarPicture) topbarPicture.src = profileUrl;
  if (dropdownPicture) dropdownPicture.src = profileUrl;

  return user;
}

async function loadNotificationCount() {
  if (!notificationCount) return;

  try {
    const response = await fetch(NOTIFICATIONS_API, {
      credentials: "include",
      cache: "no-store",
    });
    const result = await response.json();
    const count = Number(result.data?.unread_count || 0);

    notificationCount.textContent = count > 99 ? "99+" : String(count);
    notificationCount.classList.toggle("hidden", count < 1);
  } catch (error) {
    notificationCount.classList.add("hidden");
  }
}

async function loadDocuments() {
  hideMessage();

  refreshButton.disabled = true;

  try {
    const response = await fetch(GET_DOCUMENTS_API, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.message || "Unable to retrieve verification documents.",
      );
    }

    currentDocuments = result.data?.documents ?? [];

    renderDocuments();
  } catch (error) {
    showMessage(error.message || "Unable to connect to the server.", "error");
  } finally {
    refreshButton.disabled = false;
  }
}

function setupFileInputs() {
  document
    .querySelectorAll('.upload-form input[type="file"]')
    .forEach((fileInput) => {
      fileInput.addEventListener("change", () => {
        const documentType =
          fileInput.closest(".upload-form").dataset.uploadForm;

        const fileLabel = document.querySelector(
          `[data-file-label="${documentType}"]`,
        );

        fileLabel.textContent =
          fileInput.files[0]?.name || "Choose PDF, JPG, or PNG";
      });
    });
}

function setupUploadForms() {
  document.querySelectorAll(".upload-form").forEach((uploadForm) => {
    const uploadButton = uploadForm.querySelector(".upload-button");
    const fileInput = uploadForm.querySelector('input[type="file"]');

    uploadButton?.addEventListener("click", (event) => {
      if (fileInput && !fileInput.files.length) {
        event.preventDefault();
        fileInput.click();
      }
    });

    uploadForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      hideMessage();

      const documentType = uploadForm.dataset.uploadForm;

      const file = fileInput.files[0];

      if (!file) {
        showMessage(
          `Please select your ${DOCUMENT_NAMES[documentType]}.`,
          "error",
        );
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        showMessage("Document must not exceed 5 MB.", "error");
        return;
      }

      const buttonText = uploadButton.querySelector("span");

      const originalButtonText = buttonText.textContent;

      uploadButton.disabled = true;
      buttonText.textContent = "Uploading...";

      try {
        const formData = new FormData(uploadForm);

        const response = await fetch(UPLOAD_DOCUMENT_API, {
          method: "POST",
          credentials: "include",
          body: formData,
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.message || "Unable to upload document.");
        }

        showMessage(
          result.message || "Verification document uploaded successfully.",
          "success",
        );

        uploadForm.reset();

        document.querySelector(
          `[data-file-label="${documentType}"]`,
        ).textContent = "Choose PDF, JPG, or PNG";

        await loadDocuments();
      } catch (error) {
        showMessage(
          error.message || "Unable to connect to the server.",
          "error",
        );
      } finally {
        uploadButton.disabled = false;
        buttonText.textContent = originalButtonText;
      }
    });
  });
}

addPropertyLink?.addEventListener("click", (event) => {
  if (addPropertyLink.classList.contains("disabled")) {
    event.preventDefault();

    showMessage(
      "Complete your landlord verification before adding a property.",
      "error",
    );
  }
});

refreshButton?.addEventListener("click", loadDocuments);

async function initializeVerificationPage() {
  const user = await loadCurrentUser();

  if (!user) {
    return;
  }

  setupFileInputs();
  setupUploadForms();
  await Promise.all([loadDocuments(), loadNotificationCount()]);
}

initializeVerificationPage();
