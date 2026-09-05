(() => {
  "use strict";

  if (window.SilipMuntiAiRecoInitialized) return;
  window.SilipMuntiAiRecoInitialized = true;

  const API_ROOT = "/SilipMunti/backend";
  const FRONTEND_ROOT = "/SilipMunti/frontend";
  const endpoints = {
    options: `${API_ROOT}/ai/options.php`,
    chat: `${API_ROOT}/ai/chat.php`,
    recommend: `${API_ROOT}/ai/recommend.php`,
  };

  const fallbackOptions = {
    barangays: [
      "Alabang",
      "Ayala Alabang",
      "Bayanan",
      "Buli",
      "Cupang",
      "New Alabang Village",
      "Poblacion",
      "Putatan",
      "Sucat",
      "Tunasan",
    ],
    rental_types: [],
    amenities: ["Wi-Fi", "Parking", "Air conditioning", "Pet friendly"],
  };

  const placeholderImage = `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="460" viewBox="0 0 800 460">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="#e8edff"/>
          <stop offset="1" stop-color="#fff4b8"/>
        </linearGradient>
      </defs>
      <rect width="800" height="460" fill="url(#bg)"/>
      <g fill="none" stroke="#1737c8" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" opacity=".72">
        <path d="M280 245 400 145l120 100v120H280Z"/>
        <path d="M350 365v-82h100v82"/>
      </g>
      <text x="400" y="415" text-anchor="middle" fill="#4056aa" font-family="Arial" font-size="24" font-weight="700">SilipMunti Property</text>
    </svg>
  `)}`;

  let options = { ...fallbackOptions };
  let optionsPromise = null;
  let currentStep = 0;
  let currentChoices = [];
  let lastFocusedElement = null;
  let retryAction = null;
  let answers = createEmptyAnswers();
  let conversationHistory = [];

  function createEmptyAnswers() {
    return {
      budget_max: null,
      barangay: "",
      rental_type_id: null,
      occupancy: null,
      bedroom_no: null,
      amenities: [],
      note: "",
    };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatPrice(value) {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(Number(value) || 0);
  }

  function getRentalTypeName(id) {
    const selected = options.rental_types.find(
      (type) => Number(type.id) === Number(id),
    );
    return selected?.name || "Any property type";
  }

  function createMarkup() {
    const backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.className = "sm-ai-backdrop";
    backdrop.id = "sm-ai-backdrop";
    backdrop.setAttribute("aria-label", "Close AI rental finder");

    const dialog = document.createElement("section");
    dialog.className = "sm-ai-dialog";
    dialog.id = "sm-ai-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "sm-ai-dialog-title");
    dialog.setAttribute("aria-hidden", "true");

    dialog.innerHTML = `
      <header class="sm-ai-header">
        <div class="sm-ai-brand">
          <span class="sm-ai-brand-icon" aria-hidden="true">
            <i class="fa-solid fa-wand-magic-sparkles"></i>
          </span>
          <div>
            <strong id="sm-ai-dialog-title">SilipMunti AI Assistant</strong>
            <span>Rental guidance and verified property recommendations</span>
          </div>
        </div>
        <button type="button" class="sm-ai-close" id="sm-ai-close" aria-label="Close AI rental finder">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </header>

      <div class="sm-ai-content" id="sm-ai-content">
        <div class="sm-ai-view sm-ai-welcome" id="sm-ai-welcome-view">
          <div class="sm-ai-welcome-card">
            <span class="sm-ai-welcome-icon" aria-hidden="true">
              <i class="fa-solid fa-house-circle-check"></i>
            </span>
            <h2>Your renter assistant is ready.</h2>
            <p>
              Ask about rental requirements, budgeting, viewing, safety, or
              finding a property. For recommendations, we compare your request
              with verified and currently available listings in Muntinlupa.
            </p>
            <div class="sm-ai-benefits">
              <div class="sm-ai-benefit">
                <i class="fa-solid fa-clock"></i>
                <span>Takes less than a minute</span>
              </div>
              <div class="sm-ai-benefit">
                <i class="fa-solid fa-database"></i>
                <span>Uses real listings from the SilipMunti</span>
              </div>
              <div class="sm-ai-benefit">
                <i class="fa-solid fa-shield-halved"></i>
                <span>Only verified and available properties are considered</span>
              </div>
            </div>
            <button type="button" class="sm-ai-primary" id="sm-ai-start">
              Use the guided finder
              <i class="fa-solid fa-arrow-right"></i>
            </button>
          </div>
        </div>

        <div class="sm-ai-view" id="sm-ai-question-view" hidden>
          <div class="sm-ai-progress-row">
            <span id="sm-ai-step-text">Step 1 of 6</span>
            <span>Your answers can be skipped</span>
          </div>
          <div class="sm-ai-progress-track" aria-hidden="true">
            <div class="sm-ai-progress-bar" id="sm-ai-progress-bar"></div>
          </div>
          <div class="sm-ai-question">
            <span class="sm-ai-question-badge" id="sm-ai-question-badge"></span>
            <h2 id="sm-ai-question-title"></h2>
            <p id="sm-ai-question-help"></p>
            <div class="sm-ai-choices" id="sm-ai-choices"></div>
            <textarea
              class="sm-ai-other-note"
              id="sm-ai-note"
              maxlength="500"
              placeholder="Example: Near public transportation or a school"
              hidden
            ></textarea>
          </div>
          <div class="sm-ai-step-actions">
            <button type="button" class="sm-ai-secondary" id="sm-ai-back">
              <i class="fa-solid fa-arrow-left"></i>
              Back
            </button>
            <button type="button" class="sm-ai-skip" id="sm-ai-skip">Skip this</button>
            <button type="button" class="sm-ai-primary sm-ai-continue" id="sm-ai-continue">
              Continue
              <i class="fa-solid fa-arrow-right"></i>
            </button>
          </div>
        </div>

        <div class="sm-ai-view sm-ai-loading" id="sm-ai-loading-view" hidden>
          <div class="sm-ai-loading-card">
            <div class="sm-ai-thinking" aria-hidden="true"></div>
            <h2>Finding your best matches…</h2>
            <p>We’re comparing your choices with verified and available properties.</p>
          </div>
        </div>

        <div class="sm-ai-view sm-ai-error" id="sm-ai-error-view" hidden>
          <div class="sm-ai-error-card">
            <span class="sm-ai-error-icon" aria-hidden="true">
              <i class="fa-solid fa-triangle-exclamation"></i>
            </span>
            <h2>We couldn’t load your matches.</h2>
            <p id="sm-ai-error-message">Please check your connection and try again.</p>
            <button type="button" class="sm-ai-retry" id="sm-ai-retry">Try again</button>
          </div>
        </div>

        <div class="sm-ai-view sm-ai-results" id="sm-ai-results-view" hidden>
          <div class="sm-ai-results-heading">
            <span class="sm-ai-question-badge">
              <i class="fa-solid fa-wand-magic-sparkles"></i>
              Your matches
            </span>
            <h2 id="sm-ai-results-title">Properties selected for you</h2>
            <div
              class="sm-ai-chat-history"
              id="sm-ai-chat-history"
              aria-live="polite"
            ></div>
            <div class="sm-ai-preference-summary" id="sm-ai-preference-summary"></div>
          </div>
          <div class="sm-ai-result-list" id="sm-ai-result-list"></div>
          <div class="sm-ai-results-actions">
            <button type="button" class="sm-ai-secondary" id="sm-ai-restart">
              <i class="fa-solid fa-rotate-left"></i>
              Start over
            </button>
          </div>
        </div>
      </div>

      <footer class="sm-ai-chat-composer" id="sm-ai-chat-composer">
        <div class="sm-ai-quick-prompts" id="sm-ai-quick-prompts">
          <button type="button" data-sm-ai-prompt="Apartment under ₱10,000 in Alabang">
            Under ₱10k in Alabang
          </button>
          <button type="button" data-sm-ai-prompt="Good for 2 people">
            Good for 2 people
          </button>
          <button type="button" data-sm-ai-prompt="Show properties with parking">
            With parking
          </button>
          <button type="button" data-sm-ai-prompt="Near public transportation">
            Near transportation
          </button>
        </div>
        <form class="sm-ai-chat-form" id="sm-ai-chat-form">
          <label class="sm-ai-chat-input-wrap" for="sm-ai-chat-input">
            <i class="fa-solid fa-comment-dots" aria-hidden="true"></i>
            <textarea
              id="sm-ai-chat-input"
              rows="1"
              maxlength="500"
              placeholder="Ask about rentals or find a property"
              aria-label="Ask the AI rental finder"
            ></textarea>
          </label>
          <button type="submit" class="sm-ai-chat-send" id="sm-ai-chat-send" aria-label="Send message">
            <i class="fa-solid fa-arrow-up"></i>
          </button>
        </form>
        <p>Listing facts use the SilipMunti. Powered by Gemini AI</p>
      </footer>
    `;

    document.body.append(backdrop, dialog);
  }

  function getSteps() {
    return [
      {
        key: "budget_max",
        badge: '<i class="fa-solid fa-peso-sign"></i> Budget',
        title: "What is your maximum monthly budget?",
        help: "We will not recommend a property above the amount you select.",
        choices: [
          { value: 5000, label: "Up to ₱5,000", icon: "fa-wallet" },
          { value: 10000, label: "Up to ₱10,000", icon: "fa-wallet" },
          { value: 15000, label: "Up to ₱15,000", icon: "fa-wallet" },
          { value: 20000, label: "Up to ₱20,000", icon: "fa-wallet" },
          { value: 30000, label: "Up to ₱30,000", icon: "fa-wallet" },
          {
            value: null,
            label: "My budget is flexible",
            icon: "fa-arrows-left-right",
          },
        ],
      },
      {
        key: "barangay",
        badge: '<i class="fa-solid fa-location-dot"></i> Location',
        title: "Which barangay do you prefer?",
        help: "You may skip this if you are open to any location in Muntinlupa.",
        choices: [
          ...options.barangays.map((barangay) => ({
            value: barangay,
            label: barangay,
            icon: "fa-location-dot",
          })),
          { value: "", label: "Anywhere in Muntinlupa", icon: "fa-map" },
        ],
      },
      {
        key: "rental_type_id",
        badge: '<i class="fa-solid fa-house"></i> Property type',
        title: "What type of rental are you looking for?",
        help: "The available choices come from current SilipMunti listings.",
        choices: [
          ...options.rental_types.map((type) => ({
            value: Number(type.id),
            label: type.name,
            icon: "fa-building",
          })),
          {
            value: null,
            label: "Any property type",
            icon: "fa-house-circle-check",
          },
        ],
      },
      {
        key: "occupancy",
        badge: '<i class="fa-solid fa-people-roof"></i> Household',
        title: "How many people will live in the rental?",
        help: "We will remove properties that cannot accommodate your household size.",
        choices: [1, 2, 3, 4, 5].map((count) => ({
          value: count,
          label:
            count === 5
              ? "5 or more people"
              : `${count} ${count === 1 ? "person" : "people"}`,
          icon: "fa-user-group",
        })),
      },
      {
        key: "bedroom_no",
        badge: '<i class="fa-solid fa-bed"></i> Bedrooms',
        title: "How many bedrooms do you need?",
        help: "Choose Studio if a separate bedroom is not required.",
        choices: [
          { value: 0, label: "Studio", icon: "fa-couch" },
          { value: 1, label: "1 bedroom", icon: "fa-bed" },
          { value: 2, label: "2 bedrooms", icon: "fa-bed" },
          { value: 3, label: "3 bedrooms", icon: "fa-bed" },
          { value: 4, label: "4 or more bedrooms", icon: "fa-bed" },
        ],
      },
      {
        key: "amenities",
        multiple: true,
        badge: '<i class="fa-solid fa-list-check"></i> Final preferences',
        title: "Which amenities matter to you?",
        help: "Select as many as you need, then add an optional note below.",
        choices: options.amenities.map((amenity) => ({
          value: amenity,
          label: amenity,
          icon: "fa-circle-check",
        })),
      },
    ];
  }

  function getElements() {
    return {
      backdrop: document.querySelector("#sm-ai-backdrop"),
      dialog: document.querySelector("#sm-ai-dialog"),
      content: document.querySelector("#sm-ai-content"),
      welcome: document.querySelector("#sm-ai-welcome-view"),
      question: document.querySelector("#sm-ai-question-view"),
      loading: document.querySelector("#sm-ai-loading-view"),
      error: document.querySelector("#sm-ai-error-view"),
      results: document.querySelector("#sm-ai-results-view"),
      composer: document.querySelector("#sm-ai-chat-composer"),
    };
  }

  function showView(name) {
    const elements = getElements();

    ["welcome", "question", "loading", "error", "results"].forEach((key) => {
      elements[key].hidden = key !== name;
    });

    elements.composer.hidden = !["welcome", "results"].includes(name);
    elements.content.scrollTop = 0;
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
      throw new Error(result.message || "Unable to load AI recommendations.");
    }

    return result;
  }

  async function loadOptions() {
    if (optionsPromise) return optionsPromise;

    optionsPromise = fetchJson(endpoints.options)
      .then((result) => {
        const data = result.data || {};
        options = {
          barangays:
            Array.isArray(data.barangays) && data.barangays.length
              ? data.barangays
              : fallbackOptions.barangays,
          rental_types: Array.isArray(data.rental_types)
            ? data.rental_types
            : fallbackOptions.rental_types,
          amenities:
            Array.isArray(data.amenities) && data.amenities.length
              ? data.amenities
              : fallbackOptions.amenities,
        };
        return options;
      })
      .catch(() => fallbackOptions)
      .finally(() => {
        optionsPromise = null;
      });

    return optionsPromise;
  }

  function syncVisibleSearchPreferences() {
    const budget = document.querySelector("#search-budget, #filter-max-price");
    const barangay = document.querySelector(
      "#search-location, #filter-barangay",
    );
    const rentalType = document.querySelector(
      "#search-type, #filter-rental-type",
    );
    const bedrooms = document.querySelector("#filter-bedrooms");

    if (budget?.value && Number(budget.value) >= 0) {
      answers.budget_max = Number(budget.value);
    }
    if (barangay?.value) answers.barangay = barangay.value;
    if (rentalType?.value) answers.rental_type_id = Number(rentalType.value);
    if (bedrooms?.value !== "" && bedrooms?.value !== undefined) {
      answers.bedroom_no = Number(bedrooms.value);
    }
  }

  function isChoiceSelected(step, choice) {
    if (step.multiple) {
      return answers.amenities.includes(String(choice.value));
    }

    const storedValue = answers[step.key];
    return (
      storedValue === choice.value ||
      String(storedValue) === String(choice.value)
    );
  }

  function renderStep() {
    const steps = getSteps();
    const step = steps[currentStep];
    currentChoices = step.choices;

    document.querySelector("#sm-ai-step-text").textContent =
      `Step ${currentStep + 1} of ${steps.length}`;
    document.querySelector("#sm-ai-progress-bar").style.width =
      `${((currentStep + 1) / steps.length) * 100}%`;
    document.querySelector("#sm-ai-question-badge").innerHTML = step.badge;
    document.querySelector("#sm-ai-question-title").textContent = step.title;
    document.querySelector("#sm-ai-question-help").textContent = step.help;

    const choices = document.querySelector("#sm-ai-choices");
    choices.innerHTML = currentChoices.length
      ? currentChoices
          .map(
            (choice, index) => `
              <button
                type="button"
                class="sm-ai-choice ${isChoiceSelected(step, choice) ? "is-selected" : ""}"
                data-sm-ai-choice="${index}"
                aria-pressed="${isChoiceSelected(step, choice)}"
              >
                <span class="sm-ai-choice-icon" aria-hidden="true">
                  <i class="fa-solid ${escapeHtml(choice.icon)}"></i>
                </span>
                <span>${escapeHtml(choice.label)}</span>
              </button>
            `,
          )
          .join("")
      : '<div class="sm-ai-empty">No current options are available for this step. You may skip it.</div>';

    const note = document.querySelector("#sm-ai-note");
    note.hidden = !step.multiple;
    note.value = answers.note;
    document.querySelector("#sm-ai-back").disabled = currentStep === 0;
    document.querySelector("#sm-ai-continue").innerHTML = step.multiple
      ? 'Find my matches <i class="fa-solid fa-wand-magic-sparkles"></i>'
      : 'Continue <i class="fa-solid fa-arrow-right"></i>';

    showView("question");
  }

  function selectChoice(index) {
    const steps = getSteps();
    const step = steps[currentStep];
    const choice = currentChoices[index];

    if (!choice) return;

    if (step.multiple) {
      const value = String(choice.value);
      answers.amenities = answers.amenities.includes(value)
        ? answers.amenities.filter((item) => item !== value)
        : [...answers.amenities, value];
    } else {
      answers[step.key] = choice.value;
    }

    renderStep();
  }

  function clearCurrentStep() {
    const step = getSteps()[currentStep];

    if (step.multiple) {
      answers.amenities = [];
      answers.note = "";
    } else {
      answers[step.key] = step.key === "barangay" ? "" : null;
    }
  }

  function moveNext() {
    const steps = getSteps();
    const step = steps[currentStep];

    if (step.multiple) {
      answers.note = document.querySelector("#sm-ai-note").value.trim();
    }

    if (currentStep >= steps.length - 1) {
      appendChatMessage("user", "Find rentals using my guided preferences.");
      submitRecommendations();
      return;
    }

    currentStep += 1;
    renderStep();
  }

  function moveBack() {
    if (currentStep < 1) return;
    currentStep -= 1;
    renderStep();
  }

  function preferenceSummary(preferences) {
    const summary = [];

    if (preferences.budget_max) {
      summary.push(`Budget: ${formatPrice(preferences.budget_max)}`);
    }
    if (preferences.barangay) summary.push(preferences.barangay);
    if (preferences.rental_type) {
      summary.push(preferences.rental_type);
    } else if (preferences.rental_type_id) {
      summary.push(getRentalTypeName(preferences.rental_type_id));
    }
    if (preferences.occupancy) {
      summary.push(
        `${preferences.occupancy} ${preferences.occupancy === 1 ? "occupant" : "occupants"}`,
      );
    }
    if (
      preferences.bedroom_no !== null &&
      preferences.bedroom_no !== undefined
    ) {
      summary.push(
        preferences.bedroom_no === 0
          ? "Studio"
          : `${preferences.bedroom_no}+ bedroom`,
      );
    }
    if (Array.isArray(preferences.amenities)) {
      summary.push(...preferences.amenities.slice(0, 3));
    }

    return summary.length ? summary : ["Verified available listings"];
  }

  function appendChatMessage(role, message, options = {}) {
    const history = document.querySelector("#sm-ai-chat-history");
    const text = String(message || "").trim();

    if (!history || !text) return;

    const item = document.createElement("div");
    item.className = `sm-ai-chat-message is-${role}`;

    if (role === "assistant") {
      const avatar = document.createElement("span");
      avatar.className = "sm-ai-chat-avatar";
      avatar.textContent = "AI";
      item.append(avatar);
    }

    const bubble = document.createElement("div");
    bubble.className = "sm-ai-chat-bubble";

    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    bubble.append(paragraph);

    if (role === "assistant" && options.sourceLabel) {
      const source = document.createElement("span");
      source.className = "sm-ai-chat-source";
      source.textContent = options.sourceLabel;
      bubble.append(source);
    }

    item.append(bubble);
    history.append(item);

    if (options.record !== false) {
      conversationHistory.push({ role, message: text });
      conversationHistory = conversationHistory.slice(-12);
    }
  }

  function normalizeClientPreferences(preferences) {
    const normalized = {
      ...createEmptyAnswers(),
      ...(preferences || {}),
    };

    normalized.amenities = Array.isArray(normalized.amenities)
      ? normalized.amenities
      : [];

    return normalized;
  }

  function renderResults(result) {
    const recommendations = Array.isArray(result.data?.recommendations)
      ? result.data.recommendations
      : [];
    const preferences = result.data?.preferences || {};

    document.querySelector("#sm-ai-results-title").textContent =
      "Properties selected for you";
    appendChatMessage("assistant", result.message, {
      sourceLabel: result.data?.ai_generated
        ? "Gemini explanation · SilipMunti database"
        : "SilipMunti database matcher",
    });
    document.querySelector("#sm-ai-preference-summary").innerHTML =
      preferenceSummary(preferences)
        .map(
          (item) =>
            `<span class="sm-ai-summary-pill">${escapeHtml(item)}</span>`,
        )
        .join("");

    const resultList = document.querySelector("#sm-ai-result-list");

    if (!recommendations.length) {
      resultList.innerHTML = `
        <div class="sm-ai-empty">
          <strong>No exact matches yet.</strong><br />
          Try again with a higher budget or fewer preferences.
        </div>
      `;
      showView("results");
      return;
    }

    resultList.innerHTML = recommendations
      .map((listing) => {
        const reasons = Array.isArray(listing.match_reasons)
          ? listing.match_reasons
          : [];
        const bedroomLabel =
          listing.bedroom_no === null
            ? "Bedrooms not specified"
            : listing.bedroom_no === 0
              ? "Studio"
              : `${listing.bedroom_no} ${listing.bedroom_no === 1 ? "bedroom" : "bedrooms"}`;
        const occupancyLabel = listing.occupancy_limit
          ? `Up to ${listing.occupancy_limit}`
          : "Flexible occupancy";

        return `
          <article class="sm-ai-property-card">
            <div class="sm-ai-property-image-wrap">
              <img
                class="sm-ai-property-image"
                src="${escapeHtml(listing.primary_image || placeholderImage)}"
                alt="${escapeHtml(listing.title)}"
                loading="lazy"
              />
              <span class="sm-ai-match">${escapeHtml(listing.match_percentage)}% match</span>
            </div>
            <div class="sm-ai-property-content">
              <div class="sm-ai-property-meta">
                <span>${escapeHtml(listing.rental_type)}</span>
                <strong class="sm-ai-property-price">${escapeHtml(formatPrice(listing.price))}</strong>
              </div>
              <h3>${escapeHtml(listing.title)}</h3>
              <div class="sm-ai-property-location">
                <i class="fa-solid fa-location-dot"></i>
                <span>${escapeHtml(listing.barangay)}, ${escapeHtml(listing.city || "Muntinlupa")}</span>
              </div>
              <div class="sm-ai-reasons">
                ${reasons
                  .map(
                    (reason) => `
                      <div class="sm-ai-reason">
                        <i class="fa-solid fa-circle-check"></i>
                        <span>${escapeHtml(reason)}</span>
                      </div>
                    `,
                  )
                  .join("")}
              </div>
              <div class="sm-ai-property-footer">
                <span class="sm-ai-property-specs">${escapeHtml(bedroomLabel)} · ${escapeHtml(occupancyLabel)}</span>
                <a
                  class="sm-ai-view-link"
                  href="${FRONTEND_ROOT}/pages/properties/details.html?id=${encodeURIComponent(listing.id)}"
                >
                  View property
                  <i class="fa-solid fa-arrow-right"></i>
                </a>
              </div>
            </div>
          </article>
        `;
      })
      .join("");

    resultList.querySelectorAll(".sm-ai-property-image").forEach((image) => {
      image.addEventListener(
        "error",
        () => {
          image.src = placeholderImage;
        },
        { once: true },
      );
    });

    showView("results");
    window.setTimeout(() => {
      document.querySelector("#sm-ai-chat-input")?.focus();
    }, 80);
  }

  async function submitRecommendations() {
    answers.note =
      document.querySelector("#sm-ai-note")?.value.trim() || answers.note;
    showView("loading");
    retryAction = submitRecommendations;

    try {
      const result = await fetchJson(endpoints.recommend, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answers),
      });
      retryAction = null;
      renderResults(result);
    } catch (error) {
      document.querySelector("#sm-ai-error-message").textContent =
        error.message || "Please check your connection and try again.";
      showView("error");
    }
  }

  async function processChatMessage(message, addToHistory = true) {
    const cleanMessage = String(message || "").trim();

    if (!cleanMessage) return;

    if (addToHistory) {
      appendChatMessage("user", cleanMessage);
    }

    showView("loading");
    retryAction = () => processChatMessage(cleanMessage, false);

    try {
      const requestHistory =
        conversationHistory.at(-1)?.role === "user" &&
        conversationHistory.at(-1)?.message === cleanMessage
          ? conversationHistory.slice(0, -1).slice(-8)
          : conversationHistory.slice(-8);
      const interpretation = await fetchJson(endpoints.chat, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: cleanMessage,
          current_preferences: answers,
          history: requestHistory,
        }),
      });

      answers = normalizeClientPreferences(interpretation.data?.preferences);

      if (interpretation.data?.reset) {
        retryAction = null;
        conversationHistory = [];
        appendChatMessage("assistant", interpretation.message, {
          sourceLabel: interpretation.data?.ai_interpreted
            ? "Gemini preference assistant"
            : "SilipMunti preference assistant",
        });
        document.querySelector("#sm-ai-preference-summary").innerHTML =
          '<span class="sm-ai-summary-pill">Preferences cleared</span>';
        document.querySelector("#sm-ai-result-list").innerHTML = `
          <div class="sm-ai-empty">
            Tell me your new budget, preferred location, or property type below.
          </div>
        `;
        showView("results");
        return;
      }

      if (
        interpretation.data?.direct_answer ||
        interpretation.data?.recommend === false
      ) {
        retryAction = null;
        const responseMode = interpretation.data?.response_mode;
        const isGeneralAnswer = responseMode === "renter_assistant";

        document.querySelector("#sm-ai-results-title").textContent =
          isGeneralAnswer ? "Your rental assistant" : "Availability update";
        appendChatMessage("assistant", interpretation.message, {
          sourceLabel: isGeneralAnswer
            ? interpretation.data?.ai_generated_answer
              ? "Gemini renter guidance"
              : "SilipMunti renter guidance"
            : "SilipMunti database availability",
        });
        document.querySelector("#sm-ai-preference-summary").innerHTML =
          preferenceSummary(answers)
            .map(
              (item) =>
                `<span class="sm-ai-summary-pill">${escapeHtml(item)}</span>`,
            )
            .join("");
        document.querySelector("#sm-ai-result-list").innerHTML = isGeneralAnswer
          ? `
              <div class="sm-ai-empty">
                You can ask another rental question below, or tell me your
                budget and preferred location when you are ready to see listings.
              </div>
            `
          : `
              <div class="sm-ai-empty">
                No matching property cards are available for this request yet.
                Try changing the location, budget, or another preference below.
              </div>
            `;
        showView("results");
        window.setTimeout(() => {
          document.querySelector("#sm-ai-chat-input")?.focus();
        }, 80);
        return;
      }

      const recommendations = await fetchJson(endpoints.recommend, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answers),
      });

      retryAction = null;
      renderResults(recommendations);
    } catch (error) {
      document.querySelector("#sm-ai-error-message").textContent =
        error.message || "Please check your connection and try again.";
      showView("error");
    }
  }

  function submitChatForm() {
    const input = document.querySelector("#sm-ai-chat-input");
    const message = input?.value.trim() || "";

    if (!message) {
      input?.focus();
      return;
    }

    input.value = "";
    input.style.height = "auto";
    processChatMessage(message);
  }

  async function startQuestionnaire() {
    await loadOptions();
    currentStep = 0;
    renderStep();
  }

  function restart() {
    answers = createEmptyAnswers();
    conversationHistory = [];
    syncVisibleSearchPreferences();
    currentStep = 0;
    retryAction = null;
    document.querySelector("#sm-ai-chat-history").innerHTML = "";
    document.querySelector("#sm-ai-preference-summary").innerHTML = "";
    document.querySelector("#sm-ai-result-list").innerHTML = "";
    document.querySelector("#sm-ai-chat-input").value = "";
    showView("welcome");
  }

  function openDialog(trigger) {
    lastFocusedElement = trigger || document.activeElement;
    syncVisibleSearchPreferences();
    const elements = getElements();
    elements.dialog.setAttribute("aria-hidden", "false");
    document.body.classList.add("sm-ai-dialog-open");
    window.requestAnimationFrame(() => {
      elements.backdrop.classList.add("is-open");
      elements.dialog.classList.add("is-open");
      document.querySelector("#sm-ai-close")?.focus();
    });
    loadOptions();
  }

  function closeDialog() {
    const elements = getElements();
    elements.backdrop.classList.remove("is-open");
    elements.dialog.classList.remove("is-open");
    elements.dialog.setAttribute("aria-hidden", "true");
    document.body.classList.remove("sm-ai-dialog-open");
    lastFocusedElement?.focus?.();
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      const openButton = event.target.closest("[data-ai-reco-open]");

      if (openButton) {
        event.preventDefault();
        openDialog(openButton);
        return;
      }

      const choice = event.target.closest("[data-sm-ai-choice]");
      if (choice) selectChoice(Number(choice.dataset.smAiChoice));

      const prompt = event.target.closest("[data-sm-ai-prompt]");
      if (prompt) {
        event.preventDefault();
        processChatMessage(prompt.dataset.smAiPrompt || "");
      }
    });

    document
      .querySelector("#sm-ai-backdrop")
      .addEventListener("click", closeDialog);
    document
      .querySelector("#sm-ai-close")
      .addEventListener("click", closeDialog);
    document
      .querySelector("#sm-ai-start")
      .addEventListener("click", startQuestionnaire);
    document.querySelector("#sm-ai-back").addEventListener("click", moveBack);
    document
      .querySelector("#sm-ai-continue")
      .addEventListener("click", moveNext);
    document.querySelector("#sm-ai-skip").addEventListener("click", () => {
      clearCurrentStep();
      moveNext();
    });
    document.querySelector("#sm-ai-retry").addEventListener("click", () => {
      if (typeof retryAction === "function") retryAction();
    });
    document.querySelector("#sm-ai-restart").addEventListener("click", restart);
    document
      .querySelector("#sm-ai-chat-form")
      .addEventListener("submit", (event) => {
        event.preventDefault();
        submitChatForm();
      });

    const chatInput = document.querySelector("#sm-ai-chat-input");
    chatInput.addEventListener("input", () => {
      chatInput.style.height = "auto";
      chatInput.style.height = `${Math.min(chatInput.scrollHeight, 112)}px`;
    });
    chatInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submitChatForm();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" &&
        getElements().dialog.classList.contains("is-open")
      ) {
        closeDialog();
      }
    });
  }

  createMarkup();
  bindEvents();
})();
