const GET_DOCUMENTS_API = `${window.SilipMuntiPaths.base}/backend/landlord/get-documents.php`;

const UPLOAD_DOCUMENT_API = `${window.SilipMuntiPaths.base}/backend/landlord/upload-document.php`;

const REQUIRED_DOCUMENTS = ["valid_id"];

const DOCUMENT_NAMES = {
  valid_id: "Valid ID",
  barangay_clearance: "Barangay Clearance",
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
const addPropertyLink = document.querySelector("#add-property-link");
const notificationCount = document.querySelector("#notification-count");

const NOTIFICATIONS_API = `${window.SilipMuntiPaths.base}/backend/notifications/get-all.php?status=unread`;

let currentDocuments = [];
let currentLandlord = null;

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

  const typeLabel =
    documentType === "valid_id" && documentRecord.id_type
      ? ` · ID type: ${documentRecord.id_type.replaceAll("_", " ")}`
      : "";
  detailsElement.textContent = `Submitted ${formatDate(documentRecord.created_at)}${typeLabel}`;

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
  const validId = getLatestDocument("valid_id");
  const idStatus = validId?.verification_status || "not_submitted";
  const accountStatus =
    currentLandlord?.account_status ||
    currentLandlord?.landlord_status ||
    "pending";
  const approved = idStatus === "approved";
  const canCreate =
    ["pending", "approved"].includes(idStatus) &&
    !["rejected", "suspended"].includes(accountStatus);
  progressBar.style.width = approved ? "100%" : "0%";
  progressText.textContent = approved
    ? "Required Valid ID approved (1/1)"
    : "Required Valid ID not yet approved (0/1)";
  addPropertyLink?.classList.toggle("disabled", !canCreate);
  if (canCreate) addPropertyLink?.removeAttribute("aria-disabled");
  else addPropertyLink?.setAttribute("aria-disabled", "true");

  let label = "Not submitted",
    heading = "Submit your Valid ID",
    description =
      "A Valid Government-Issued ID is required before adding properties. Barangay Clearance is optional.";
  let css = "pending";
  if (["rejected", "suspended"].includes(accountStatus)) {
    label = "Account restricted";
    css = "rejected";
    heading = "Your landlord account is restricted";
    description =
      currentLandlord?.landlord_rejection_reason ||
      "Contact the administrator for assistance.";
  } else if (idStatus === "rejected") {
    label = "Needs resubmission";
    css = "rejected";
    heading = "Your Valid ID needs resubmission";
    description =
      validId?.rejection_reason ||
      "Resubmit your required Valid ID to add properties.";
  } else if (idStatus === "pending") {
    label = "Pending review";
    heading = "Valid ID submitted — awaiting review";
    description =
      "You can submit properties while the ID review is pending. Review typically takes 1–3 working days, excluding holidays.";
  } else if (approved && accountStatus === "approved") {
    label = "Verified";
    css = "approved";
    heading = "Your identity is verified";
    description =
      "Your required Valid ID has been approved. Barangay Clearance remains optional.";
  } else if (approved) {
    label = "ID approved";
    css = "approved";
    heading = "Your Valid ID has been approved";
    description =
      "Your landlord account may still have a separate administrative status.";
  }
  overallStatus.className = `overall-status ${css}`;
  overallStatus.textContent = label;
  verificationHeading.textContent = heading;
  verificationDescription.textContent = description;
}

function renderDocuments() {
  ["valid_id", "barangay_clearance"].forEach(updateDocumentCard);
  updateOverallStatus();
}

async function loadCurrentUser() {
  const user = await window.SilipMuntiSession?.getCurrentUser();

  if (!user) {
    window.location.href = `${window.SilipMuntiPaths.base}/frontend/pages/auth/login.html`;
    return null;
  }

  if (user.role !== "landlord") {
    window.location.href = `${window.SilipMuntiPaths.base}/frontend/index.html`;
    return null;
  }

  window.SilipMuntiLandlordShell?.setLandlordProfile(user);

  currentLandlord = user;

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

    if (currentLandlord) {
      currentLandlord.account_status =
        result.data?.account_status || currentLandlord.account_status;
      currentLandlord.verification_level =
        result.data?.verification_level || currentLandlord.verification_level;
      currentLandlord.landlord_rejection_reason =
        result.data?.rejection_reason ||
        currentLandlord.landlord_rejection_reason;
    }

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

      if (documentType === "valid_id") {
        const idType = uploadForm.querySelector('select[name="id_type"]');
        if (!idType?.value) {
          showMessage("Please select the government ID type first.", "error");
          return;
        }
        if (
          !["image/jpeg", "image/png"].includes(file.type) ||
          /\.pdf$/i.test(file.name)
        ) {
          showMessage(
            "Upload a JPG or PNG image for the ID type OCR check.",
            "error",
          );
          return;
        }
        if (!window.SilipMuntiIdOcr?.validateBeforeUpload) {
          showMessage(
            "The ID type checker is still loading. Refresh the page and try again.",
            "error",
          );
          return;
        }
        const check = await window.SilipMuntiIdOcr.validateBeforeUpload();
        if (!check.allowed) {
          showMessage(
            check.message ||
              "Please correct the selected ID type or uploaded image.",
            "error",
          );
          return;
        }
      }

      const buttonText = uploadButton.querySelector("span");

      const originalButtonText = buttonText.textContent;

      uploadButton.disabled = true;
      buttonText.textContent = "Uploading...";

      try {
        const formData = new FormData(uploadForm);

        const response = await window.SilipMuntiSession.secureFetch(
          UPLOAD_DOCUMENT_API,
          {
            method: "POST",
            credentials: "include",
            body: formData,
          },
        );

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
        ).textContent =
          documentType === "valid_id"
            ? "Choose JPG or PNG (for ID type pre-check)"
            : "Choose PDF, JPG, or PNG";

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
      "Your landlord account must be approved before adding a property.",
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
