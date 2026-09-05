(() => {
  const API_ROOT = "/SilipMunti/backend";

  const MESSAGES_PAGE = "/SilipMunti/frontend/pages/messages/index.html";

  const DEFAULT_PROFILE =
    "/SilipMunti/frontend/assets/images/default-profile.svg";

  const DEFAULT_PROPERTY =
    "/SilipMunti/frontend/assets/images/property-placeholder.svg";

  const currentPath = window.location.pathname.toLowerCase();

  if (currentPath.includes("/pages/messages/")) {
    return;
  }

  const endpoints = {
    user: `${API_ROOT}/auth/user.php`,
    inquiries: `${API_ROOT}/inquiries/get-inquiries.php`,
    messages: `${API_ROOT}/inquiries/get-messages.php`,
    sendMessage: `${API_ROOT}/inquiries/send-message.php`,
    markRead: `${API_ROOT}/inquiries/mark-messages-read.php`,
  };

  let currentUser = null;
  let inquiries = [];
  let selectedInquiry = null;
  let activeFilter = "all";
  let searchTerm = "";
  let conversationInterval = null;
  let messageInterval = null;
  let isLoadingMessages = false;
  let isSendingMessage = false;
  let replyingToMessage = null;

  function createWidget() {
    const widget = document.createElement("div");

    widget.className = "silip-chat-widget";

    widget.innerHTML = `
      <section
        id="silip-chat-popup"
        class="silip-chat-popup"
        aria-label="SilipMunti chats"
      >
        <div id="silip-chat-list-view">
          <header class="silip-chat-header">
            <div class="silip-chat-header-information">
              <p class="silip-chat-eyebrow">
                SilipMunti
              </p>

              <h2>Chats</h2>
            </div>

            <button
              id="silip-chat-refresh"
              class="silip-chat-icon-button"
              type="button"
              aria-label="Refresh conversations"
              title="Refresh conversations"
            >
              <i class="fa-solid fa-rotate-right"></i>
            </button>

            <button
              id="silip-chat-close"
              class="silip-chat-icon-button"
              type="button"
              aria-label="Close chats"
              title="Close chats"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </header>

          <div class="silip-chat-search">
            <i class="fa-solid fa-magnifying-glass"></i>

            <input
              id="silip-chat-search"
              type="search"
              placeholder="Search conversations"
              autocomplete="off"
              aria-label="Search conversations"
            />
          </div>

          <div
            id="silip-chat-tabs"
            class="silip-chat-tabs"
          >
            <button
              class="silip-chat-tab active"
              type="button"
              data-filter="all"
            >
              All
            </button>

            <button
              class="silip-chat-tab"
              type="button"
              data-filter="unread"
            >
              Unread
            </button>

            <button
              class="silip-chat-tab"
              type="button"
              data-filter="closed"
            >
              Closed
            </button>
          </div>

          <div
            id="silip-chat-conversations"
            class="silip-chat-conversations"
          ></div>

          <footer class="silip-chat-footer">
            <a
              class="silip-chat-see-all"
              href="${MESSAGES_PAGE}"
            >
              See all in Messages
              <i class="fa-solid fa-arrow-right"></i>
            </a>
          </footer>
        </div>
      </section>

      <section
        id="silip-mini-chat"
        class="silip-mini-chat-window"
        aria-label="Active conversation"
        hidden
      ></section>

      <button
        id="silip-chat-bubble"
        class="silip-chat-bubble"
        type="button"
        aria-label="Open chats"
      >
        <i class="fa-solid fa-message"></i>

        <span
          id="silip-chat-count"
          class="silip-chat-count"
          hidden
        >
          0
        </span>
      </button>
    `;

    document.body.appendChild(widget);
  }

  async function apiRequest(url, options = {}) {
    const response = await window.SilipMuntiSession.secureFetch(url, {
      credentials: "include",
      cache: "no-store",
      ...options,
    });

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      throw new Error("The server returned an invalid response.");
    }

    const result = await response.json();

    if (!response.ok || !result.success) {
      const error = new Error(
        result.message || "Unable to complete the request.",
      );

      error.status = response.status;

      throw error;
    }

    return result;
  }

  function setSafeImage(image, source, fallback) {
    if (!image) {
      return;
    }

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
      path.startsWith("/") ||
      path.startsWith("http://") ||
      path.startsWith("https://")
    ) {
      return path;
    }

    return `${API_ROOT}/${path}`;
  }

  function parseServerDate(value) {
    if (!value) {
      return null;
    }

    const normalizedValue = String(value).replace(" ", "T");
    const date = new Date(normalizedValue);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date;
  }

  function formatTime(value) {
    const date = parseServerDate(value);

    if (!date) {
      return "";
    }

    const currentDate = new Date();
    const difference = currentDate.getTime() - date.getTime();

    const oneMinute = 60 * 1000;
    const oneHour = 60 * oneMinute;
    const oneDay = 24 * oneHour;

    if (difference < oneMinute) {
      return "Now";
    }

    if (difference < oneHour) {
      return `${Math.floor(difference / oneMinute)}m`;
    }

    if (difference < oneDay) {
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

  function formatPrice(value) {
    const amount = Number(value);

    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(Number.isFinite(amount) ? amount : 0);
  }

  function capitalize(value) {
    return String(value || "")
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function getOtherUserPicture(inquiry) {
    const profilePicture =
      inquiry.other_user?.profile_picture || inquiry.other_user_profile_picture;

    return createProfileUrl(profilePicture);
  }

  function getTotalUnreadMessages() {
    return inquiries.reduce((total, inquiry) => {
      return total + (Number(inquiry.unread_count) || 0);
    }, 0);
  }

  function updateUnreadBadge() {
    const countElement = document.querySelector("#silip-chat-count");

    if (!countElement) {
      return;
    }

    const unreadTotal = getTotalUnreadMessages();

    countElement.hidden = unreadTotal === 0;
    countElement.textContent = unreadTotal > 99 ? "99+" : String(unreadTotal);
  }

  function showLoadingConversations() {
    const container = document.querySelector("#silip-chat-conversations");

    container.innerHTML = `
      <div class="silip-chat-state">
        <div class="silip-chat-spinner"></div>
        <p>Loading conversations...</p>
      </div>
    `;
  }

  function showConversationState(icon, title, message) {
    const container = document.querySelector("#silip-chat-conversations");

    container.innerHTML = `
      <div class="silip-chat-state">
        <div class="silip-chat-state-icon">
          <i class="${icon}"></i>
        </div>

        <strong>${title}</strong>
        <p>${message}</p>
      </div>
    `;
  }

  function getFilteredInquiries() {
    return inquiries.filter((inquiry) => {
      const unreadCount = Number(inquiry.unread_count) || 0;

      const filterMatches =
        activeFilter === "all" ||
        (activeFilter === "unread" && unreadCount > 0) ||
        (activeFilter === "closed" && inquiry.inquiry_status === "closed");

      const searchableText = [
        inquiry.other_user?.name,
        inquiry.listing_title,
        inquiry.last_message,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const searchMatches =
        searchTerm === "" || searchableText.includes(searchTerm);

      return filterMatches && searchMatches;
    });
  }

  function renderConversations() {
    const container = document.querySelector("#silip-chat-conversations");

    const filteredInquiries = getFilteredInquiries();

    container.innerHTML = "";

    if (inquiries.length === 0) {
      showConversationState(
        "fa-regular fa-comments",
        "No conversations yet",
        "Your property conversations will appear here.",
      );

      return;
    }

    if (filteredInquiries.length === 0) {
      showConversationState(
        "fa-solid fa-magnifying-glass",
        "No conversations found",
        "Try another name, property, or filter.",
      );

      return;
    }

    filteredInquiries.slice(0, 15).forEach((inquiry) => {
      const unreadCount = Number(inquiry.unread_count) || 0;

      const conversationButton = document.createElement("button");

      conversationButton.type = "button";
      conversationButton.className = "silip-chat-conversation";

      conversationButton.classList.toggle("unread", unreadCount > 0);

      conversationButton.innerHTML = `
        <div class="silip-chat-conversation-image-wrapper">
          <img
            class="silip-chat-conversation-image"
            alt=""
          />

          <span class="silip-chat-online"></span>
        </div>

        <div class="silip-chat-conversation-content">
          <div class="silip-chat-conversation-top">
            <strong
              class="silip-chat-conversation-name"
            ></strong>

            <time
              class="silip-chat-conversation-time"
            ></time>
          </div>

          <p class="silip-chat-property-name"></p>

          <div class="silip-chat-conversation-bottom">
            <p class="silip-chat-preview"></p>

            ${
              unreadCount > 0
                ? `
                  <span class="silip-chat-unread-count">
                    ${unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                `
                : ""
            }
          </div>
        </div>
      `;

      const image = conversationButton.querySelector(
        ".silip-chat-conversation-image",
      );

      const userName = conversationButton.querySelector(
        ".silip-chat-conversation-name",
      );

      const conversationTime = conversationButton.querySelector(
        ".silip-chat-conversation-time",
      );

      const propertyName = conversationButton.querySelector(
        ".silip-chat-property-name",
      );

      const messagePreview = conversationButton.querySelector(
        ".silip-chat-preview",
      );

      setSafeImage(
        image,
        getOtherUserPicture(inquiry),
        inquiry.primary_image || DEFAULT_PROFILE,
      );

      userName.textContent = inquiry.other_user?.name || "SilipMunti user";

      conversationTime.textContent = formatTime(
        inquiry.last_message_at || inquiry.created_at,
      );

      propertyName.textContent = inquiry.listing_title || "Property inquiry";

      messagePreview.textContent =
        inquiry.last_message || "Property inquiry started.";

      conversationButton.addEventListener("click", () => {
        if (window.innerWidth <= 600) {
          window.location.href = `${MESSAGES_PAGE}?inquiry_id=${inquiry.inquiry_id}`;

          return;
        }

        openMiniChat(inquiry);
      });

      container.appendChild(conversationButton);
    });
  }

  async function loadConversations(silent = false) {
    if (!silent) {
      showLoadingConversations();
    }

    try {
      const result = await apiRequest(endpoints.inquiries);

      inquiries = result.data.inquiries || [];

      updateUnreadBadge();
      renderConversations();

      if (selectedInquiry) {
        const updatedInquiry = inquiries.find(
          (inquiry) =>
            Number(inquiry.inquiry_id) === Number(selectedInquiry.inquiry_id),
        );

        if (updatedInquiry) {
          selectedInquiry = updatedInquiry;
        }
      }
    } catch (error) {
      if (!silent) {
        showConversationState(
          "fa-solid fa-circle-exclamation",
          "Unable to load chats",
          error.message,
        );
      }
    }
  }

  function renderClosedBubble() {
    const bubble = document.querySelector("#silip-chat-bubble");

    const unreadTotal = getTotalUnreadMessages();

    bubble.innerHTML = `
      <i class="fa-solid fa-message"></i>

      <span
        id="silip-chat-count"
        class="silip-chat-count"
        ${unreadTotal === 0 ? "hidden" : ""}
      >
        ${unreadTotal > 99 ? "99+" : unreadTotal}
      </span>
    `;
  }

  function openPopup() {
    const widget = document.querySelector(".silip-chat-widget");

    const popup = document.querySelector("#silip-chat-popup");

    const bubble = document.querySelector("#silip-chat-bubble");

    const unreadTotal = getTotalUnreadMessages();

    popup.classList.add("open");
    widget.classList.add("chat-list-open");
    bubble.classList.add("active");

    bubble.innerHTML = `
    <i class="fa-solid fa-xmark"></i>

    <span
      id="silip-chat-count"
      class="silip-chat-count"
      ${unreadTotal === 0 ? "hidden" : ""}
    >
      ${unreadTotal > 99 ? "99+" : unreadTotal}
    </span>
  `;

    loadConversations(true);
  }

  function closePopup() {
    const widget = document.querySelector(".silip-chat-widget");

    const popup = document.querySelector("#silip-chat-popup");

    const bubble = document.querySelector("#silip-chat-bubble");

    popup.classList.remove("open");
    widget.classList.remove("chat-list-open");
    bubble.classList.remove("active");

    renderClosedBubble();
  }

  function closeMiniChat() {
    const miniChat = document.querySelector("#silip-mini-chat");

    miniChat.classList.add("closing");

    window.setTimeout(() => {
      miniChat.hidden = true;
      miniChat.classList.remove("closing");
      miniChat.innerHTML = "";

      selectedInquiry = null;
      replyingToMessage = null;

      stopMessagePolling();
      loadConversations(true);
    }, 220);
  }

  async function openMiniChat(inquiry) {
    selectedInquiry = inquiry;
    replyingToMessage = null;

    const widget = document.querySelector(".silip-chat-widget");

    const popup = document.querySelector("#silip-chat-popup");

    const miniChat = document.querySelector("#silip-mini-chat");

    miniChat.classList.remove("closing");
    miniChat.hidden = false;

    if (popup.classList.contains("open")) {
      widget.classList.add("chat-list-open");
    } else {
      widget.classList.remove("chat-list-open");
    }

    miniChat.innerHTML = `
    <div class="silip-chat-state">
      <div class="silip-chat-spinner"></div>
      <p>Loading messages...</p>
    </div>
  `;

    await loadMiniMessages();
    startMessagePolling();
  }

  async function loadMiniMessages(silent = false) {
    if (!selectedInquiry || isLoadingMessages) {
      return;
    }

    isLoadingMessages = true;

    try {
      const result = await apiRequest(
        `${endpoints.messages}?inquiry_id=${encodeURIComponent(
          selectedInquiry.inquiry_id,
        )}`,
      );

      const existingMessageList = document.querySelector(
        "#silip-mini-messages",
      );

      if (silent && existingMessageList) {
        renderMiniMessageList(result.data.messages || []);
      } else {
        renderMiniChat(result.data);
      }

      const hasUnreadMessages = (result.data.messages || []).some((message) => {
        return !message.is_mine && !message.is_read;
      });

      if (hasUnreadMessages) {
        await markMessagesRead();
      }
    } catch (error) {
      if (!silent) {
        const miniChat = document.querySelector("#silip-mini-chat");

        miniChat.innerHTML = `
        <div class="silip-chat-state">
          <div class="silip-chat-state-icon">
            <i class="fa-solid fa-circle-exclamation"></i>
          </div>

          <strong>Unable to load messages</strong>
          <p>${error.message}</p>
        </div>
      `;
      }
    } finally {
      isLoadingMessages = false;
    }
  }

  function renderMiniChat(data) {
    const miniChat = document.querySelector("#silip-mini-chat");

    const inquiry = data.inquiry;
    const otherUser = data.other_user;
    const messages = data.messages || [];

    const isClosed = inquiry.status === "closed";

    const propertyUrl = `/SilipMunti/frontend/pages/properties/details.html?id=${inquiry.listing_id}`;

    const fullConversationUrl = `${MESSAGES_PAGE}?inquiry_id=${inquiry.id}`;

    miniChat.innerHTML = `
      <header class="silip-mini-chat-header">
        <button
          id="silip-mini-back"
          class="silip-chat-icon-button"
          type="button"
          aria-label="Close conversation"
          title="Back to chats"
        >
          <i class="fa-solid fa-arrow-left"></i>
        </button>

        <img
          id="silip-mini-user-image"
          class="silip-mini-chat-user-image"
          alt=""
        />

        <div class="silip-mini-chat-user">
          <strong id="silip-mini-user-name"></strong>
          <span id="silip-mini-user-status"></span>
        </div>

        <a
          class="silip-chat-icon-button"
          href="${fullConversationUrl}"
          aria-label="Open full conversation"
          title="Open full conversation"
        >
          <i
            class="fa-solid fa-up-right-and-down-left-from-center"
          ></i>
        </a>

        <button
          id="silip-mini-close"
          class="silip-chat-icon-button"
          type="button"
          aria-label="Close mini chat"
          title="Close mini chat"
        >
          <i class="fa-solid fa-xmark"></i>
        </button>
      </header>

      <a
        class="silip-mini-property"
        href="${propertyUrl}"
      >
        <img
          id="silip-mini-property-image"
          alt=""
        />

        <div>
          <strong
            id="silip-mini-property-title"
          ></strong>

          <span>
            ${formatPrice(inquiry.price)} / month
          </span>
        </div>

        <i class="fa-solid fa-chevron-right"></i>
      </a>

      <div
        id="silip-mini-messages"
        class="silip-mini-messages"
      ></div>

      ${
        isClosed
          ? `
            <div class="silip-mini-closed">
              <i class="fa-solid fa-lock"></i>
              This inquiry is closed. Open Messages to reopen it.
            </div>
          `
          : `
            <form
              id="silip-mini-form"
              class="silip-mini-composer"
            >
              <div
                id="silip-mini-reply-preview"
                class="silip-mini-reply-preview"
                hidden
              >
                <div>
                  <span>
                    Replying to
                    <strong id="silip-mini-reply-name"></strong>
                  </span>
                  <p id="silip-mini-reply-text"></p>
                </div>

                <button
                  id="silip-mini-cancel-reply"
                  type="button"
                  aria-label="Cancel reply"
                  title="Cancel reply"
                >
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>

              <textarea
                id="silip-mini-input"
                maxlength="2000"
                rows="1"
                placeholder="Write a message..."
                aria-label="Write a message"
                required
              ></textarea>

              <button
                id="silip-mini-send"
                class="silip-mini-send"
                type="submit"
                aria-label="Send message"
              >
                <i class="fa-solid fa-paper-plane"></i>
              </button>
            </form>
          `
      }
    `;

    const userImage = document.querySelector("#silip-mini-user-image");

    const propertyImage = document.querySelector("#silip-mini-property-image");

    setSafeImage(
      userImage,
      createProfileUrl(otherUser.profile_picture),
      getOtherUserPicture(selectedInquiry),
    );

    setSafeImage(
      propertyImage,
      selectedInquiry.primary_image,
      DEFAULT_PROPERTY,
    );

    document.querySelector("#silip-mini-user-name").textContent =
      otherUser.name || "SilipMunti user";

    document.querySelector("#silip-mini-user-status").textContent =
      `${capitalize(otherUser.role)} • ${capitalize(inquiry.status)} inquiry`;

    document.querySelector("#silip-mini-property-title").textContent =
      inquiry.listing_title || "Property inquiry";

    renderMiniMessageList(messages);

    document
      .querySelector("#silip-mini-back")
      .addEventListener("click", closeMiniChat);

    document
      .querySelector("#silip-mini-close")
      .addEventListener("click", closeMiniChat);

    const messageForm = document.querySelector("#silip-mini-form");

    if (messageForm) {
      messageForm.addEventListener("submit", sendMiniMessage);

      const messageInput = document.querySelector("#silip-mini-input");

      messageInput.addEventListener("input", () => {
        messageInput.style.height = "auto";

        messageInput.style.height = `${Math.min(messageInput.scrollHeight, 85)}px`;
      });

      messageInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          messageForm.requestSubmit();
        }
      });

      document
        .querySelector("#silip-mini-cancel-reply")
        .addEventListener("click", () => {
          cancelMiniReply();
          messageInput.focus();
        });
    }
  }

  function renderMiniMessageList(messages) {
    const container = document.querySelector("#silip-mini-messages");

    if (!container) {
      return;
    }

    container.innerHTML = "";

    if (messages.length === 0) {
      container.innerHTML = `
        <div class="silip-chat-state">
          <div class="silip-chat-state-icon">
            <i class="fa-regular fa-message"></i>
          </div>

          <strong>No messages yet</strong>
          <p>Send a message to begin the conversation.</p>
        </div>
      `;

      return;
    }

    messages.forEach((message) => {
      const messageElement = document.createElement("article");

      messageElement.className = "silip-mini-message";
      messageElement.dataset.messageId = message.id;

      messageElement.classList.toggle("mine", Boolean(message.is_mine));

      const bubble = document.createElement("div");

      bubble.className = "silip-mini-message-bubble";

      const messageText = document.createElement("span");

      messageText.className = "silip-mini-message-text";

      messageText.textContent = message.message_text || "";

      const messageTime = document.createElement("time");

      messageTime.className = "silip-mini-message-time";

      messageTime.textContent = formatMessageTime(message.created_at);

      if (message.reply_to) {
        const quote = document.createElement("button");
        quote.className = "silip-mini-reply-quote";
        quote.type = "button";
        quote.dataset.targetMessageId = message.reply_to.id;

        const quoteName = document.createElement("strong");
        quoteName.textContent = message.reply_to.sender_name || "Message";

        const quoteText = document.createElement("span");
        quoteText.textContent =
          message.reply_to.message_text || "Message unavailable";

        quote.appendChild(quoteName);
        quote.appendChild(quoteText);
        quote.addEventListener("click", () => {
          scrollToMiniMessage(message.reply_to.id);
        });
        bubble.appendChild(quote);
      }

      bubble.appendChild(messageText);
      bubble.appendChild(messageTime);

      const replyButton = document.createElement("button");
      replyButton.className = "silip-mini-reply-button";
      replyButton.type = "button";
      replyButton.title = "Reply";
      replyButton.setAttribute("aria-label", "Reply to message");
      replyButton.innerHTML = '<i class="fa-solid fa-reply"></i>';
      replyButton.addEventListener("click", () => startMiniReply(message));

      messageElement.appendChild(bubble);
      messageElement.appendChild(replyButton);
      container.appendChild(messageElement);
    });

    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }

  function startMiniReply(message) {
    replyingToMessage = {
      id: Number(message.id),
      sender_name: message.sender_name || "SilipMunti user",
      message_text: message.message_text || "",
    };

    const preview = document.querySelector("#silip-mini-reply-preview");
    const name = document.querySelector("#silip-mini-reply-name");
    const text = document.querySelector("#silip-mini-reply-text");
    const input = document.querySelector("#silip-mini-input");

    if (!preview || !name || !text || !input) {
      return;
    }

    name.textContent = replyingToMessage.sender_name;
    text.textContent = replyingToMessage.message_text;
    preview.hidden = false;
    input.focus();
  }

  function cancelMiniReply() {
    replyingToMessage = null;

    const preview = document.querySelector("#silip-mini-reply-preview");

    if (preview) {
      preview.hidden = true;
    }
  }

  function scrollToMiniMessage(messageId) {
    const container = document.querySelector("#silip-mini-messages");

    if (!container) {
      return;
    }

    const target = container.querySelector(
      `[data-message-id="${Number(messageId)}"]`,
    );

    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.remove("silip-mini-message-highlight");
    void target.offsetWidth;
    target.classList.add("silip-mini-message-highlight");

    window.setTimeout(() => {
      target.classList.remove("silip-mini-message-highlight");
    }, 1600);
  }

  async function sendMiniMessage(event) {
    event.preventDefault();

    if (!selectedInquiry || isSendingMessage) {
      return;
    }

    const messageInput = document.querySelector("#silip-mini-input");

    const sendButton = document.querySelector("#silip-mini-send");

    const messageText = messageInput.value.trim();

    if (messageText === "") {
      return;
    }

    if (messageText.length > 2000) {
      window.alert("Message must not exceed 2000 characters.");

      return;
    }

    isSendingMessage = true;
    sendButton.disabled = true;
    messageInput.disabled = true;

    try {
      await apiRequest(endpoints.sendMessage, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inquiry_id: selectedInquiry.inquiry_id,
          message_text: messageText,
          reply_to_message_id: replyingToMessage?.id ?? null,
        }),
      });

      messageInput.value = "";
      cancelMiniReply();

      await loadMiniMessages(true);
      await loadConversations(true);
    } catch (error) {
      window.alert(error.message);
    } finally {
      isSendingMessage = false;
      sendButton.disabled = false;
      messageInput.disabled = false;
      messageInput.focus();
    }
  }

  async function markMessagesRead() {
    if (!selectedInquiry) {
      return;
    }

    try {
      await apiRequest(endpoints.markRead, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inquiry_id: selectedInquiry.inquiry_id,
        }),
      });

      const inquiry = inquiries.find(
        (item) =>
          Number(item.inquiry_id) === Number(selectedInquiry.inquiry_id),
      );

      if (inquiry) {
        inquiry.unread_count = 0;
      }

      updateUnreadBadge();
      renderConversations();
    } catch (error) {
      console.error(error);
    }
  }

  function startConversationPolling() {
    stopConversationPolling();

    conversationInterval = window.setInterval(() => {
      if (!document.hidden) {
        loadConversations(true);
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
      if (!document.hidden && selectedInquiry) {
        loadMiniMessages(true);
      }
    }, 5000);
  }

  function stopMessagePolling() {
    if (messageInterval) {
      window.clearInterval(messageInterval);
      messageInterval = null;
    }
  }

  function bindEvents() {
    const bubble = document.querySelector("#silip-chat-bubble");

    const popup = document.querySelector("#silip-chat-popup");

    bubble.addEventListener("click", () => {
      if (popup.classList.contains("open")) {
        closePopup();
      } else {
        openPopup();
      }
    });

    document
      .querySelector("#silip-chat-close")
      .addEventListener("click", closePopup);

    document
      .querySelector("#silip-chat-refresh")
      .addEventListener("click", () => {
        loadConversations();
      });

    document
      .querySelector("#silip-chat-search")
      .addEventListener("input", (event) => {
        searchTerm = event.target.value.trim().toLowerCase();

        renderConversations();
      });

    document
      .querySelector("#silip-chat-tabs")
      .addEventListener("click", (event) => {
        const selectedTab = event.target.closest("[data-filter]");

        if (!selectedTab) {
          return;
        }

        activeFilter = selectedTab.dataset.filter;

        document.querySelectorAll(".silip-chat-tab").forEach((tab) => {
          tab.classList.toggle("active", tab === selectedTab);
        });

        renderConversations();
      });
  }

  async function initializeChatBubble() {
    try {
      const result = await apiRequest(endpoints.user);

      currentUser = result.data.user;

      if (!["renter", "landlord"].includes(currentUser.role)) {
        return;
      }

      createWidget();
      bindEvents();
      await loadConversations();
      startConversationPolling();
    } catch (error) {
      return;
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      loadConversations(true);

      if (selectedInquiry) {
        loadMiniMessages(true);
      }
    }
  });

  window.addEventListener("beforeunload", () => {
    stopConversationPolling();
    stopMessagePolling();
  });

  initializeChatBubble();
})();
