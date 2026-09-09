(() => {
  "use strict";

  if (customElements.get("silip-back-to-top")) return;

  const scriptSource =
    document.currentScript?.src ||
    "/SilipMunti/frontend/assets/js/back-to-top.js";
  const stylesheetUrl = new URL("../css/back-to-top.css", scriptSource).href;

  class SilipBackToTop extends HTMLElement {
    constructor() {
      super();

      this.attachShadow({ mode: "open" });
      this.shadowRoot.innerHTML = `
        <link rel="stylesheet" href="${stylesheetUrl}">
        <button type="button" aria-label="Back to top" title="Back to top">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 19V5"></path>
            <path d="m6 11 6-6 6 6"></path>
          </svg>
        </button>
      `;

      this.button = this.shadowRoot.querySelector("button");
      this.reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      this.handleScroll = this.handleScroll.bind(this);
      this.handleClick = this.handleClick.bind(this);
      this.checkChatBubble = this.checkChatBubble.bind(this);
    }

    connectedCallback() {
      this.showAfter = Math.max(
        0,
        Number(this.getAttribute("show-after")) || 420,
      );
      this.button.addEventListener("click", this.handleClick);
      window.addEventListener("scroll", this.handleScroll, { passive: true });
      window.addEventListener("resize", this.handleScroll);

      this.chatObserver = new MutationObserver(this.checkChatBubble);
      this.chatObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });

      this.checkChatBubble();
      this.handleScroll();
    }

    disconnectedCallback() {
      this.button.removeEventListener("click", this.handleClick);
      window.removeEventListener("scroll", this.handleScroll);
      window.removeEventListener("resize", this.handleScroll);
      this.chatObserver?.disconnect();
    }

    handleScroll() {
      this.button.classList.toggle("visible", window.scrollY >= this.showAfter);
    }

    handleClick() {
      window.scrollTo({
        top: 0,
        behavior: this.reduceMotion ? "auto" : "smooth",
      });
    }

    checkChatBubble() {
      const chatBubble = document.querySelector(
        "#silip-chat-bubble, .silip-chat-bubble",
      );
      this.toggleAttribute("data-with-chat", Boolean(chatBubble));
    }
  }

  customElements.define("silip-back-to-top", SilipBackToTop);
})();
