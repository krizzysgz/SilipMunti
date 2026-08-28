const API_ROOT = "/SilipMunti/backend";

const endpoints = {
  user: `${API_ROOT}/auth/user.php`,
  inquiries: `${API_ROOT}/inquiries/get-inquiries.php`,
  messages: `${API_ROOT}/inquiries/get-messages.php`,
  sendMessage: `${API_ROOT}/inquiries/send-message.php`,
  markRead: `${API_ROOT}/inquiries/mark-messages-read.php`,
  updateStatus: `${API_ROOT}/inquiries/update-status.php`,
};

const DEFAULT_PROFILE =
  "/SilipMunti/frontend/assets/images/default-profile.png";

const DEFAULT_PROPERTY =
  "/SilipMunti/frontend/assets/images/property-placeholder.png";

const messagesApp = document.querySelector("#messages-app");
const conversationPanel = document.querySelector("#conversation-panel");
const conversationList = document.querySelector("#conversation-list");
const conversationLoading = document.querySelector("#conversation-loading");
const conversationEmpty = document.querySelector("#conversation-empty");
const conversationError = document.querySelector("#conversation-error");
const conversationErrorMessage = document.querySelector(
  "#conversation-error-message",
);
const conversationSearch = document.querySelector("#conversation-search");
const conversationFilter = document.querySelector("#conversation-filter");
const refreshConversationsButton = document.querySelector(
  "#refresh-conversations",
);
const retryConversationsButton = document.querySelector("#retry-conversations");

const chatPlaceholder = document.querySelector("#chat-placeholder");
const activeChat = document.querySelector("#active-chat");
const chatLoading = document.querySelector("#chat-loading");
const chatError = document.querySelector("#chat-error");
const chatErrorMessage = document.querySelector("#chat-error-message");
const retryMessagesButton = document.querySelector("#retry-messages");
const messageList = document.querySelector("#message-list");

const backToConversationsButton = document.querySelector(
  "#back-to-conversations",
);
const chatUserPicture = document.querySelector("#chat-user-picture");
const chatUserName = document.querySelector("#chat-user-name");
const chatUserRole = document.querySelector("#chat-user-role");
const chatInquiryStatus = document.querySelector("#chat-inquiry-status");

const viewPropertyButton = document.querySelector("#view-property-button");
const inquiryStatusButton = document.querySelector("#inquiry-status-button");

const propertySummary = document.querySelector("#property-summary");
const propertyImage = document.querySelector("#property-image");
const propertyTitle = document.querySelector("#property-title");
const propertyPrice = document.querySelector("#property-price");
const propertyAvailability = document.querySelector("#property-availability");

const messageForm = document.querySelector("#message-form");
const messageInput = document.querySelector("#message-input");
const messageCharacterCount = document.querySelector(
  "#message-character-count",
);
const sendMessageButton = document.querySelector("#send-message-button");
const messageFormError = document.querySelector("#message-form-error");
const replyPreview = document.querySelector("#reply-preview");
const replyPreviewName = document.querySelector("#reply-preview-name");
const replyPreviewText = document.querySelector("#reply-preview-text");
const cancelReplyButton = document.querySelector("#cancel-reply-button");

const closedInquiryNotice = document.querySelector("#closed-inquiry-notice");
const reopenInquiryButton = document.querySelector("#reopen-inquiry-button");

const informationPanel = document.querySelector("#information-panel");
const closeInformationPanelButton = document.querySelector(
  "#close-information-panel",
);
const informationUserPicture = document.querySelector(
  "#information-user-picture",
);
const informationUserName = document.querySelector("#information-user-name");
const informationUserRole = document.querySelector("#information-user-role");
const informationPropertyTitle = document.querySelector(
  "#information-property-title",
);
const informationInquiryStatus = document.querySelector(
  "#information-inquiry-status",
);
const informationCreatedAt = document.querySelector("#information-created-at");
const informationPropertyButton = document.querySelector(
  "#information-property-button",
);

const navbarProfilePicture = document.querySelector("#navbar-profile-picture");

const conversationTemplate = document.querySelector("#conversation-template");
const messageTemplate = document.querySelector("#message-template");

let currentUser = null;
let inquiries = [];
let activeInquiry = null;
let activeFilter = "all";
let searchTerm = "";
let conversationInterval = null;
let messageInterval = null;
let isLoadingMessages = false;
let isSendingMessage = false;
let replyingToMessage = null;

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    throw new Error("The server returned an invalid response.");
  }

  const result = await response.json();

  if (response.status === 401) {
    window.location.href = "/SilipMunti/frontend/pages/auth/login.html";
    throw new Error("You must log in first.");
  }

  if (!response.ok || !result.success) {
    const error = new Error(
      result.message || "Unable to complete the request.",
    );

    error.status = response.status;
    error.errors = result.errors || null;

    throw error;
  }

  return result;
}

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = String(value ?? "");
  return element.innerHTML;
}

function setSafeImage(image, source, fallback) {
  image.onerror = () => {
    image.onerror = null;
    image.src = fallback;
  };

  image.src = source || fallback;
}

function createProfileUrl(path) {
  if (!path) {
    return DEFAULT_PROFILE;
  }

  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("/")
  ) {
    return path;
  }

  return `${API_ROOT}/${path}`;
}

function formatCurrency(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "₱0";
  }

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function parseServerDate(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value).replace(" ", "T");
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function formatConversationTime(value) {
  const date = parseServerDate(value);

  if (!date) {
    return "";
  }

  const now = new Date();
  const difference = now.getTime() - date.getTime();
  const oneMinute = 60 * 1000;
  const oneHour = 60 * oneMinute;
  const oneDay = 24 * oneHour;

  if (difference < oneMinute) {
    return "Now";
  }

  if (difference < oneHour) {
    return `${Math.floor(difference / oneMinute)}m`;
  }

  if (difference < oneDay && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString("en-PH", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  if (difference < oneDay * 7) {
    return date.toLocaleDateString("en-PH", {
      weekday: "short",
    });
  }

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
  });
}

function formatMessageTime(value) {
  const date = parseServerDate(value);

  if (!date) {
    return "";
  }

  return date.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatFullDate(value) {
  const date = parseServerDate(value);

  if (!date) {
    return "—";
  }

  return date.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateSeparator(value) {
  const date = parseServerDate(value);

  if (!date) {
    return "";
  }

  const today = new Date();
  const yesterday = new Date();

  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return "Today";
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  return date.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

function getDateKey(value) {
  const date = parseServerDate(value);

  if (!date) {
    return "";
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function capitalize(value) {
  const text = String(value || "");

  return text
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getOtherUserPicture(inquiry) {
  const picture =
    inquiry.other_user?.profile_picture || inquiry.other_user_profile_picture;

  return createProfileUrl(picture);
}

function showConversationState(state, message = "") {
  conversationLoading.classList.toggle("hidden", state !== "loading");

  conversationEmpty.classList.toggle("hidden", state !== "empty");
  conversationError.classList.toggle("hidden", state !== "error");
  conversationList.classList.toggle("hidden", state !== "list");

  if (state === "error") {
    conversationErrorMessage.textContent =
      message || "Unable to load conversations.";
  }
}

function showChatState(state, message = "") {
  chatLoading.classList.toggle("hidden", state !== "loading");
  chatError.classList.toggle("hidden", state !== "error");
  messageList.classList.toggle("hidden", state !== "messages");

  if (state === "error") {
    chatErrorMessage.textContent = message || "Unable to load messages.";
  }
}

function getFilteredInquiries() {
  return inquiries.filter((inquiry) => {
    const unreadCount = Number(inquiry.unread_count) || 0;
    const statusMatches =
      activeFilter === "all" ||
      (activeFilter === "unread" && unreadCount > 0) ||
      (activeFilter === "closed" && inquiry.inquiry_status === "closed");

    const searchValue = [
      inquiry.other_user?.name,
      inquiry.listing_title,
      inquiry.last_message,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const searchMatches = searchTerm === "" || searchValue.includes(searchTerm);

    return statusMatches && searchMatches;
  });
}

function renderConversations() {
  const filteredInquiries = getFilteredInquiries();

  conversationList.innerHTML = "";

  if (inquiries.length === 0) {
    showConversationState("empty");
    return;
  }

  showConversationState("list");

  if (filteredInquiries.length === 0) {
    const message = document.createElement("div");
    message.className = "conversation-state";
    message.innerHTML = `
      <div class="state-icon">
        <i class="fa-solid fa-magnifying-glass"></i>
      </div>
      <h2>No conversations found</h2>
      <p>Try another name, property, or conversation filter.</p>
    `;

    conversationList.appendChild(message);
    return;
  }

  filteredInquiries.forEach((inquiry) => {
    const fragment = conversationTemplate.content.cloneNode(true);
    const item = fragment.querySelector(".conversation-item");
    const image = fragment.querySelector(".conversation-image");
    const userName = fragment.querySelector(".conversation-user-name");
    const time = fragment.querySelector(".conversation-time");
    const listingTitle = fragment.querySelector(".conversation-property-title");
    const preview = fragment.querySelector(".conversation-preview");
    const unreadCount = fragment.querySelector(".conversation-unread-count");

    const count = Number(inquiry.unread_count) || 0;
    const isActive =
      Number(activeInquiry?.inquiry_id || activeInquiry?.id) ===
      Number(inquiry.inquiry_id);

    item.dataset.inquiryId = inquiry.inquiry_id;
    item.classList.toggle("unread", count > 0);
    item.classList.toggle("active", isActive);

    setSafeImage(
      image,
      getOtherUserPicture(inquiry),
      inquiry.primary_image || DEFAULT_PROFILE,
    );

    userName.textContent = inquiry.other_user?.name || "SilipMunti user";

    time.textContent = formatConversationTime(
      inquiry.last_message_at || inquiry.created_at,
    );

    time.dateTime = inquiry.last_message_at || inquiry.created_at || "";

    listingTitle.textContent = inquiry.listing_title || "Property inquiry";

    preview.textContent = inquiry.last_message || "Property inquiry started.";

    unreadCount.textContent = count > 99 ? "99+" : String(count);

    item.addEventListener("click", () => {
      openConversation(Number(inquiry.inquiry_id));
    });

    conversationList.appendChild(fragment);
  });
}

async function loadCurrentUser() {
  const result = await apiRequest(endpoints.user);

  currentUser = result.data.user;

  const profilePicture = createProfileUrl(currentUser.profile_picture);

  setSafeImage(navbarProfilePicture, profilePicture, DEFAULT_PROFILE);
}

async function loadConversations(options = {}) {
  const preserveState = options.preserveState === true;

  if (!preserveState) {
    showConversationState("loading");
  }

  try {
    const result = await apiRequest(endpoints.inquiries);

    inquiries = result.data.inquiries || [];

    if (activeInquiry) {
      const updatedInquiry = inquiries.find(
        (inquiry) =>
          Number(inquiry.inquiry_id) ===
          Number(activeInquiry.inquiry_id || activeInquiry.id),
      );

      if (updatedInquiry) {
        activeInquiry = {
          ...activeInquiry,
          ...updatedInquiry,
        };

        updateChatInformation();
      }
    }

    renderConversations();

    const requestedInquiryId = Number(
      new URLSearchParams(window.location.search).get("inquiry_id"),
    );

    if (
      requestedInquiryId > 0 &&
      !activeInquiry &&
      inquiries.some(
        (inquiry) => Number(inquiry.inquiry_id) === requestedInquiryId,
      )
    ) {
      await openConversation(requestedInquiryId);
    }
  } catch (error) {
    if (!preserveState) {
      showConversationState("error", error.message);
    }
  }
}

function updateUrlInquiry(inquiryId) {
  const url = new URL(window.location.href);

  if (inquiryId) {
    url.searchParams.set("inquiry_id", inquiryId);
  } else {
    url.searchParams.delete("inquiry_id");
  }

  window.history.replaceState({}, "", url);
}

async function openConversation(inquiryId) {
  cancelReply();

  const selectedInquiry = inquiries.find(
    (inquiry) => Number(inquiry.inquiry_id) === Number(inquiryId),
  );

  if (!selectedInquiry) {
    return;
  }

  activeInquiry = selectedInquiry;

  chatPlaceholder.classList.add("hidden");
  activeChat.classList.remove("hidden");
  messagesApp.classList.add("chat-open");

  closeInformationPanel();
  updateUrlInquiry(inquiryId);
  updateChatInformation();
  renderConversations();

  await loadMessages(false);
  await markMessagesRead();

  startMessagePolling();
}

function updateChatInformation(messageData = null) {
  if (!activeInquiry) {
    return;
  }

  const inquiryDetails = messageData?.inquiry;
  const otherUser = messageData?.other_user || activeInquiry.other_user || {};

  const status =
    inquiryDetails?.status || activeInquiry.inquiry_status || "pending";

  const listingId = inquiryDetails?.listing_id || activeInquiry.listing_id;

  const listingTitle =
    inquiryDetails?.listing_title ||
    activeInquiry.listing_title ||
    "Property inquiry";

  const price = inquiryDetails?.price ?? activeInquiry.price ?? 0;

  const availability =
    inquiryDetails?.availability_status ||
    activeInquiry.availability_status ||
    "available";

  const detailsUrl = `/SilipMunti/frontend/pages/properties/details.html?id=${listingId}`;

  const userPicture = getOtherUserPicture(activeInquiry);

  chatUserName.textContent = otherUser.name || "SilipMunti user";

  chatUserRole.textContent = capitalize(otherUser.role || "user");

  chatInquiryStatus.textContent =
    status === "closed" ? "Closed inquiry" : "Active inquiry";

  setSafeImage(chatUserPicture, userPicture, DEFAULT_PROFILE);

  propertyTitle.textContent = listingTitle;
  propertyPrice.textContent = formatCurrency(price);
  propertyAvailability.textContent = capitalize(availability);

  setSafeImage(propertyImage, activeInquiry.primary_image, DEFAULT_PROPERTY);

  propertySummary.href = detailsUrl;
  viewPropertyButton.href = detailsUrl;
  informationPropertyButton.href = detailsUrl;

  informationUserName.textContent = otherUser.name || "SilipMunti user";

  informationUserRole.textContent = capitalize(otherUser.role || "user");

  setSafeImage(informationUserPicture, userPicture, DEFAULT_PROFILE);

  informationPropertyTitle.textContent = listingTitle;
  informationInquiryStatus.textContent = capitalize(status);

  informationCreatedAt.textContent = formatFullDate(
    inquiryDetails?.created_at || activeInquiry.created_at,
  );

  applyInquiryStatus(status);
}

function applyInquiryStatus(status) {
  const isClosed = status === "closed";

  closedInquiryNotice.classList.toggle("hidden", !isClosed);
  messageForm.classList.toggle("hidden", isClosed);
  messageFormError.classList.add("hidden");

  inquiryStatusButton.title = isClosed ? "Reopen inquiry" : "Close inquiry";

  inquiryStatusButton.setAttribute(
    "aria-label",
    isClosed ? "Reopen inquiry" : "Close inquiry",
  );

  inquiryStatusButton.innerHTML = isClosed
    ? '<i class="fa-solid fa-lock-open"></i>'
    : '<i class="fa-solid fa-circle-check"></i>';

  chatInquiryStatus.textContent = isClosed
    ? "Closed inquiry"
    : "Active inquiry";

  informationInquiryStatus.textContent = isClosed ? "Closed" : "Pending";
}

async function loadMessages(silent = false) {
  if (!activeInquiry || isLoadingMessages) {
    return;
  }

  isLoadingMessages = true;

  if (!silent) {
    showChatState("loading");
  }

  const inquiryId = activeInquiry.inquiry_id || activeInquiry.id;

  try {
    const result = await apiRequest(
      `${endpoints.messages}?inquiry_id=${encodeURIComponent(inquiryId)}`,
    );

    const data = result.data;
    const wasNearBottom =
      messageList.scrollHeight -
        messageList.scrollTop -
        messageList.clientHeight <
      130;

    activeInquiry = {
      ...activeInquiry,
      inquiry_status: data.inquiry.status,
    };

    updateChatInformation(data);
    renderMessages(data.messages || []);
    showChatState("messages");

    if (!silent || wasNearBottom) {
      scrollMessagesToBottom();
    }

    const hasUnreadMessages = (data.messages || []).some(
      (message) => !message.is_mine && !message.is_read,
    );

    if (hasUnreadMessages) {
      await markMessagesRead(false);
    }
  } catch (error) {
    if (!silent) {
      showChatState("error", error.message);
    }
  } finally {
    isLoadingMessages = false;
  }
}

function renderMessages(messages) {
  messageList.innerHTML = "";

  if (messages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "chat-state";
    empty.innerHTML = `
      <div class="state-icon">
        <i class="fa-regular fa-message"></i>
      </div>
      <h2>No messages yet</h2>
      <p>Send a message to begin the conversation.</p>
    `;

    messageList.appendChild(empty);
    return;
  }

  let previousDateKey = "";

  messages.forEach((message) => {
    const currentDateKey = getDateKey(message.created_at);

    if (currentDateKey !== previousDateKey) {
      const separator = document.createElement("div");
      separator.className = "message-date-separator";
      separator.textContent = formatDateSeparator(message.created_at);

      messageList.appendChild(separator);
      previousDateKey = currentDateKey;
    }

    const fragment = messageTemplate.content.cloneNode(true);
    const row = fragment.querySelector(".message-row");
    const avatar = fragment.querySelector(".message-avatar");
    const sender = fragment.querySelector(".message-sender");
    const bubble = fragment.querySelector(".message-bubble");
    const time = fragment.querySelector(".message-time");
    const readStatus = fragment.querySelector(".message-read-status");

    row.classList.toggle("mine", Boolean(message.is_mine));
    row.dataset.messageId = message.id;

    setSafeImage(
      avatar,
      createProfileUrl(message.profile_picture),
      DEFAULT_PROFILE,
    );

    sender.textContent = message.sender_name || capitalize(message.sender_role);

    if (message.reply_to) {
      const quote = document.createElement("button");
      quote.className = "message-reply-quote";
      quote.type = "button";
      quote.dataset.targetMessageId = message.reply_to.id;

      const quoteName = document.createElement("strong");
      quoteName.textContent = message.reply_to.sender_name || "Message";

      const quoteText = document.createElement("span");
      quoteText.textContent =
        message.reply_to.message_text || "Message unavailable";

      quote.appendChild(quoteName);
      quote.appendChild(quoteText);
      bubble.appendChild(quote);
    }

    const messageText = document.createElement("span");
    messageText.className = "message-text";
    messageText.textContent = message.message_text || "";
    bubble.appendChild(messageText);

    const replyButton = document.createElement("button");
    replyButton.className = "message-reply-button";
    replyButton.type = "button";
    replyButton.dataset.messageId = message.id;
    replyButton.setAttribute("aria-label", "Reply to message");
    replyButton.title = "Reply";
    replyButton.innerHTML = '<i class="fa-solid fa-reply"></i>';

    replyButton.addEventListener("click", () => {
      startReply(message);
    });

    row.appendChild(replyButton);

    time.textContent = formatMessageTime(message.created_at);
    time.dateTime = message.created_at || "";

    if (message.is_mine) {
      readStatus.innerHTML = message.is_read
        ? '<i class="fa-solid fa-check-double"></i> Read'
        : '<i class="fa-solid fa-check"></i> Sent';
    } else {
      readStatus.textContent = "";
    }

    messageList.appendChild(fragment);
  });
}

function startReply(message) {
  replyingToMessage = {
    id: Number(message.id),
    sender_name: message.sender_name || capitalize(message.sender_role),
    message_text: message.message_text || "",
  };

  replyPreviewName.textContent = replyingToMessage.sender_name;
  replyPreviewText.textContent = replyingToMessage.message_text;
  replyPreview.classList.remove("hidden");
  messageForm.classList.add("replying");
  messageInput.focus();
}

function cancelReply() {
  replyingToMessage = null;
  replyPreviewName.textContent = "";
  replyPreviewText.textContent = "";
  replyPreview.classList.add("hidden");
  messageForm.classList.remove("replying");
}

function scrollToRepliedMessage(messageId) {
  const target = messageList.querySelector(
    `[data-message-id="${Number(messageId)}"]`,
  );

  if (!target) {
    return;
  }

  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.remove("message-highlight");
  void target.offsetWidth;
  target.classList.add("message-highlight");

  window.setTimeout(() => {
    target.classList.remove("message-highlight");
  }, 1600);
}

function scrollMessagesToBottom() {
  requestAnimationFrame(() => {
    messageList.scrollTop = messageList.scrollHeight;
  });
}

async function markMessagesRead(refreshList = true) {
  if (!activeInquiry) {
    return;
  }

  const inquiryId = activeInquiry.inquiry_id || activeInquiry.id;

  try {
    await apiRequest(endpoints.markRead, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inquiry_id: inquiryId,
      }),
    });

    const inquiry = inquiries.find(
      (item) => Number(item.inquiry_id) === Number(inquiryId),
    );

    if (inquiry) {
      inquiry.unread_count = 0;
    }

    renderConversations();

    if (refreshList) {
      await loadConversations({
        preserveState: true,
      });
    }
  } catch (error) {
    console.error(error);
  }
}

async function sendMessage(event) {
  event.preventDefault();

  if (!activeInquiry || isSendingMessage) {
    return;
  }

  const messageText = messageInput.value.trim();

  if (messageText === "") {
    showMessageFormError("Please enter a message.");
    return;
  }

  if (messageText.length > 2000) {
    showMessageFormError("Message must not exceed 2000 characters.");
    return;
  }

  isSendingMessage = true;
  sendMessageButton.disabled = true;
  messageInput.disabled = true;
  messageFormError.classList.add("hidden");

  const inquiryId = activeInquiry.inquiry_id || activeInquiry.id;

  try {
    await apiRequest(endpoints.sendMessage, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inquiry_id: inquiryId,
        message_text: messageText,
        reply_to_message_id: replyingToMessage?.id ?? null,
      }),
    });

    messageInput.value = "";
    cancelReply();
    resizeMessageInput();
    updateCharacterCount();

    await loadMessages(true);
    await loadConversations({
      preserveState: true,
    });

    scrollMessagesToBottom();
    messageInput.focus();
  } catch (error) {
    showMessageFormError(error.message);
  } finally {
    isSendingMessage = false;
    sendMessageButton.disabled = false;
    messageInput.disabled = false;
  }
}

function showMessageFormError(message) {
  messageFormError.textContent = message;
  messageFormError.classList.remove("hidden");
}

function updateCharacterCount() {
  const length = messageInput.value.length;
  messageCharacterCount.textContent = `${length}/2000`;
}

function resizeMessageInput() {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 125)}px`;
}

async function changeInquiryStatus(status) {
  if (!activeInquiry) {
    return;
  }

  const inquiryId = activeInquiry.inquiry_id || activeInquiry.id;

  inquiryStatusButton.disabled = true;
  reopenInquiryButton.disabled = true;

  try {
    const result = await apiRequest(endpoints.updateStatus, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inquiry_id: inquiryId,
        inquiry_status: status,
      }),
    });

    activeInquiry.inquiry_status = result.data.inquiry_status;

    const inquiry = inquiries.find(
      (item) => Number(item.inquiry_id) === Number(inquiryId),
    );

    if (inquiry) {
      inquiry.inquiry_status = result.data.inquiry_status;
    }

    applyInquiryStatus(result.data.inquiry_status);
    renderConversations();
  } catch (error) {
    showMessageFormError(error.message);
  } finally {
    inquiryStatusButton.disabled = false;
    reopenInquiryButton.disabled = false;
  }
}

function toggleInquiryStatus() {
  if (!activeInquiry) {
    return;
  }

  const currentStatus = activeInquiry.inquiry_status || "pending";

  if (currentStatus === "closed") {
    changeInquiryStatus("pending");
    return;
  }

  const shouldClose = window.confirm(
    "Close this inquiry? The conversation history will remain available.",
  );

  if (shouldClose) {
    changeInquiryStatus("closed");
  }
}

function openInformationPanel() {
  informationPanel.classList.remove("hidden");
  messagesApp.classList.add("information-visible");
}

function closeInformationPanel() {
  informationPanel.classList.add("hidden");
  messagesApp.classList.remove("information-visible");
}

function closeMobileChat() {
  cancelReply();

  messagesApp.classList.remove("chat-open");
  closeInformationPanel();
  stopMessagePolling();

  activeInquiry = null;

  chatPlaceholder.classList.remove("hidden");
  activeChat.classList.add("hidden");

  updateUrlInquiry(null);
  renderConversations();
}

function startConversationPolling() {
  stopConversationPolling();

  conversationInterval = window.setInterval(() => {
    if (!document.hidden) {
      loadConversations({
        preserveState: true,
      });
    }
  }, 10000);
}

function stopConversationPolling() {
  if (conversationInterval) {
    window.clearInterval(conversationInterval);
    conversationInterval = null;
  }
}

function startMessagePolling() {
  stopMessagePolling();

  messageInterval = window.setInterval(() => {
    if (!document.hidden && activeInquiry) {
      loadMessages(true);
    }
  }, 4000);
}

function stopMessagePolling() {
  if (messageInterval) {
    window.clearInterval(messageInterval);
    messageInterval = null;
  }
}

conversationSearch.addEventListener("input", () => {
  searchTerm = conversationSearch.value.trim().toLowerCase();
  renderConversations();
});

conversationFilter.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");

  if (!button) {
    return;
  }

  activeFilter = button.dataset.filter;

  conversationFilter
    .querySelectorAll(".filter-button")
    .forEach((filterButton) => {
      filterButton.classList.toggle("active", filterButton === button);
    });

  renderConversations();
});

refreshConversationsButton.addEventListener("click", () => {
  loadConversations();
});

retryConversationsButton.addEventListener("click", () => {
  loadConversations();
});

retryMessagesButton.addEventListener("click", () => {
  loadMessages(false);
});

messageForm.addEventListener("submit", sendMessage);

cancelReplyButton.addEventListener("click", () => {
  cancelReply();
  messageInput.focus();
});

messageList.addEventListener("click", (event) => {
  const quote = event.target.closest(".message-reply-quote");

  if (quote) {
    scrollToRepliedMessage(quote.dataset.targetMessageId);
  }
});

messageInput.addEventListener("input", () => {
  updateCharacterCount();
  resizeMessageInput();
  messageFormError.classList.add("hidden");
});

messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && window.innerWidth > 760) {
    event.preventDefault();
    messageForm.requestSubmit();
  }
});

backToConversationsButton.addEventListener("click", closeMobileChat);

inquiryStatusButton.addEventListener("click", toggleInquiryStatus);

reopenInquiryButton.addEventListener("click", () => {
  changeInquiryStatus("pending");
});

closeInformationPanelButton.addEventListener("click", closeInformationPanel);

chatUserName.addEventListener("click", openInformationPanel);
chatUserPicture.addEventListener("click", openInformationPanel);

window.addEventListener("beforeunload", () => {
  stopConversationPolling();
  stopMessagePolling();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    loadConversations({
      preserveState: true,
    });

    if (activeInquiry) {
      loadMessages(true);
    }
  }
});

async function initializeMessages() {
  showConversationState("loading");

  try {
    await loadCurrentUser();
    await loadConversations();
    startConversationPolling();
  } catch (error) {
    showConversationState("error", error.message);
  }
}

initializeMessages();
