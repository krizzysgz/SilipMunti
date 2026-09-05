(() => {
  const API_BASE = "/SilipMunti/backend";
  const FRONTEND_BASE = "/SilipMunti/frontend";
  const CREATE_REVIEW_ENDPOINT = `${API_BASE}/reviews/create.php`;
  const GET_LISTING_ENDPOINT = `${API_BASE}/listings/get-one.php`;

  const form = document.querySelector("#platform-review-form");
  const ratingInput = document.querySelector("#review-rating");
  const ratingButtons = Array.from(document.querySelectorAll(".rating-option"));
  const selectedRatingLabel = document.querySelector("#selected-rating-label");
  const commentInput = document.querySelector("#review-comment");
  const commentCounter = document.querySelector("#comment-counter");
  const submitButton = document.querySelector("#submit-review-button");
  const formMessage = document.querySelector("#review-form-message");
  const successPanel = document.querySelector("#review-success");
  const backLink = document.querySelector("#review-back-link");
  const heroEyebrow = document.querySelector("#review-hero-eyebrow");
  const heroTitle = document.querySelector("#review-hero-title");
  const heroDescription = document.querySelector("#review-hero-description");
  const targetIcon = document.querySelector("#review-target-icon");
  const targetImage = document.querySelector("#review-target-image");
  const targetTitle = document.querySelector("#review-target-title");
  const targetDescription = document.querySelector(
    "#review-target-description",
  );
  const targetDetails = document.querySelector("#review-target-details");
  const targetLocation = document.querySelector("#review-target-location");
  const targetPrice = document.querySelector("#review-target-price");
  const formTitle = document.querySelector("#review-form-title");
  const formDescription = document.querySelector("#review-form-description");
  const successTitle = document.querySelector("#review-success-title");
  const successDescription = document.querySelector(
    "#review-success-description",
  );
  const successLink = document.querySelector("#review-success-link");
  const successLinkText = document.querySelector("#review-success-link-text");

  if (
    !form ||
    !ratingInput ||
    ratingButtons.length === 0 ||
    !selectedRatingLabel ||
    !commentInput ||
    !commentCounter ||
    !submitButton ||
    !formMessage ||
    !successPanel
  ) {
    return;
  }

  const pageParameters = new URLSearchParams(window.location.search);
  const requestedType = pageParameters.get("type");
  const requestedListingId = pageParameters.get("listing_id");

  const ratingLabels = {
    1: "Very Poor",
    2: "Poor",
    3: "Good",
    4: "Very Good",
    5: "Excellent",
  };

  let reviewContext = {
    type: "platform",
    listingId: null,
    listing: null,
    ready: true,
  };

  const formatPrice = (price) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Number(price) || 0);

  const showMessage = (message, type = "error") => {
    formMessage.textContent = message;
    formMessage.className = `review-message ${type}`;
  };

  const hideMessage = () => {
    formMessage.textContent = "";
    formMessage.className = "review-message review-hidden";
  };

  const updateSubmitState = () => {
    const hasRating = ratingInput.value !== "";
    const hasComment = commentInput.value.trim() !== "";
    submitButton.disabled = !reviewContext.ready || !hasRating || !hasComment;
  };

  const selectRating = (rating) => {
    ratingInput.value = String(rating);

    ratingButtons.forEach((button) => {
      const isSelected = Number(button.dataset.rating) === rating;
      button.classList.toggle("selected", isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
    });

    selectedRatingLabel.textContent = `${rating} — ${ratingLabels[rating]}`;
    hideMessage();
    updateSubmitState();
  };

  const renderPlatformContext = () => {
    reviewContext = {
      type: "platform",
      listingId: null,
      listing: null,
      ready: true,
    };

    document.title = "Reviews & Feedback | SilipMunti";

    if (backLink) {
      backLink.href = `${FRONTEND_BASE}/index.html`;
      backLink.lastChild.textContent = " Back to home";
    }

    if (heroEyebrow) heroEyebrow.textContent = "Reviews & Feedback";
    if (heroTitle) {
      heroTitle.innerHTML =
        "Tell us about your <span>SilipMunti experience.</span>";
    }
    if (heroDescription) {
      heroDescription.textContent =
        "Your feedback helps us improve the platform and build a better rental experience for the Muntinlupa community.";
    }
    targetIcon?.classList.remove("review-hidden");
    targetImage?.classList.add("review-hidden");
    if (targetTitle) targetTitle.textContent = "SilipMunti Platform";
    if (targetDescription) {
      targetDescription.textContent =
        "Share your overall experience searching, comparing rentals, and communicating through SilipMunti.";
    }
    targetDetails?.classList.add("review-hidden");
    if (formTitle) formTitle.textContent = "How was your overall experience?";
    if (formDescription) {
      formDescription.textContent =
        "Select a rating from 1 to 5 and tell us what you think.";
    }
    if (successTitle) successTitle.textContent = "Thank you for your feedback.";
    if (successDescription) {
      successDescription.textContent =
        "Your SilipMunti experience review was submitted successfully.";
    }
    if (successLink) successLink.href = `${FRONTEND_BASE}/index.html`;
    if (successLinkText) successLinkText.textContent = "Return to Home";

    hideMessage();
    updateSubmitState();
  };

  const renderListingContext = (listing) => {
    const listingDetailsUrl = `${FRONTEND_BASE}/pages/properties/details.html?id=${encodeURIComponent(listing.id)}`;
    const fullAddress = [listing.address, listing.barangay, listing.city]
      .filter(Boolean)
      .join(", ");

    reviewContext = {
      type: "listing",
      listingId: Number(listing.id),
      listing,
      ready: true,
    };

    document.title = `Review ${listing.title} | SilipMunti`;

    if (backLink) {
      backLink.href = listingDetailsUrl;
      backLink.lastChild.textContent = " Back to property";
    }

    if (heroEyebrow) heroEyebrow.textContent = "Property Review";
    if (heroTitle) {
      heroTitle.innerHTML =
        "Share your experience with this <span>rental property.</span>";
    }
    if (heroDescription) {
      heroDescription.textContent =
        "Your review can help other renters make a more informed property decision.";
    }

    targetIcon?.classList.add("review-hidden");

    if (targetImage) {
      targetImage.src =
        listing.primary_image ||
        `${FRONTEND_BASE}/assets/images/property-placeholder.svg`;
      targetImage.alt = `${listing.title} property`;
      targetImage.classList.remove("review-hidden");
      targetImage.onerror = () => {
        targetImage.onerror = null;
        targetImage.src = `${FRONTEND_BASE}/assets/images/property-placeholder.svg`;
      };
    }

    if (targetTitle) targetTitle.textContent = listing.title;
    if (targetDescription) {
      targetDescription.textContent =
        listing.rental_type || "Verified rental property";
    }
    if (targetLocation) {
      targetLocation.textContent = fullAddress || "Muntinlupa City";
    }
    if (targetPrice) {
      targetPrice.textContent = `${formatPrice(listing.price)} / month`;
    }
    targetDetails?.classList.remove("review-hidden");

    if (formTitle) formTitle.textContent = "How was your property experience?";
    if (formDescription) {
      formDescription.textContent =
        "Rate this rental from 1 to 5 and share details that may help other renters.";
    }
    if (successTitle)
      successTitle.textContent = "Your property review is submitted.";
    if (successDescription) {
      successDescription.textContent =
        "Thank you for sharing your experience with this rental property.";
    }
    if (successLink) successLink.href = listingDetailsUrl;
    if (successLinkText) successLinkText.textContent = "Return to Property";

    hideMessage();
    updateSubmitState();
  };

  const loadListingContext = async () => {
    if (
      !requestedListingId ||
      !/^\d+$/.test(requestedListingId) ||
      Number(requestedListingId) < 1
    ) {
      reviewContext.ready = false;
      showMessage("A valid listing ID is required for a property review.");
      updateSubmitState();
      return;
    }

    reviewContext = {
      type: "listing",
      listingId: Number(requestedListingId),
      listing: null,
      ready: false,
    };

    showMessage("Loading the selected property...", "info");
    updateSubmitState();

    try {
      const response = await fetch(
        `${GET_LISTING_ENDPOINT}?id=${encodeURIComponent(requestedListingId)}`,
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        },
      );

      const responseText = await response.text();
      let result = null;

      try {
        result = responseText ? JSON.parse(responseText) : null;
      } catch {
        result = null;
      }

      if (!response.ok || !result?.success || !result.data?.listing) {
        throw new Error(
          result?.message || "Unable to load the selected property.",
        );
      }

      renderListingContext(result.data.listing);
    } catch (error) {
      reviewContext.ready = false;
      showMessage(
        error instanceof Error
          ? error.message
          : "Unable to load the selected property.",
      );
      updateSubmitState();
    }
  };

  ratingButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectRating(Number(button.dataset.rating));
    });
  });

  commentInput.addEventListener("input", () => {
    commentCounter.textContent = `${commentInput.value.length} / 1000`;
    hideMessage();
    updateSubmitState();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideMessage();

    const rating = Number(ratingInput.value);
    const comment = commentInput.value.trim();

    if (!reviewContext.ready) {
      showMessage("The review target is not ready. Please refresh the page.");
      return;
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      showMessage("Please select a rating from 1 to 5.");
      return;
    }

    if (comment === "") {
      showMessage("Please tell us about your experience.");
      commentInput.focus();
      return;
    }

    const requestBody = {
      review_type: reviewContext.type,
      rating,
      comment,
    };

    if (reviewContext.type === "listing") {
      requestBody.listing_id = reviewContext.listingId;
    }

    const originalButtonContent = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.innerHTML = `
      <span>Submitting...</span>
      <i class="fa-solid fa-spinner fa-spin"></i>
    `;

    try {
      const response = await window.SilipMuntiSession.secureFetch(
        CREATE_REVIEW_ENDPOINT,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        },
      );

      const responseText = await response.text();
      let result = null;

      try {
        result = responseText ? JSON.parse(responseText) : null;
      } catch {
        result = null;
      }

      if (!response.ok || !result?.success) {
        if (response.status === 401) {
          window.SilipMuntiSession?.redirectToLogin(
            `${window.location.pathname}${window.location.search}`,
          );
          return;
        }

        throw new Error(result?.message || "Unable to submit your review.");
      }

      form.classList.add("review-hidden");
      hideMessage();
      successPanel.classList.remove("review-hidden");
      successPanel.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (error) {
      showMessage(
        error instanceof Error
          ? error.message
          : "Unable to submit your review. Please try again.",
      );
    } finally {
      submitButton.innerHTML = originalButtonContent;

      if (!form.classList.contains("review-hidden")) {
        updateSubmitState();
      }
    }
  });

  async function initializeReviewPage() {
    const user = await window.SilipMuntiSession?.getCurrentUser();

    if (!user) {
      window.SilipMuntiSession?.redirectToLogin(
        `${window.location.pathname}${window.location.search}`,
      );
      return;
    }

    if (user.role !== "renter") {
      window.location.href =
        window.SilipMuntiSession?.getDashboardUrl(user.role) ||
        `${FRONTEND_BASE}/index.html`;
      return;
    }

    if (requestedType === "listing") {
      await loadListingContext();
    } else {
      renderPlatformContext();
    }
  }

  initializeReviewPage();
})();
