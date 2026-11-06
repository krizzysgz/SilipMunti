/* Presentation-only behavior for the legacy notifications page navigation. */
(() => {
  const toggle = document.getElementById("mobile-menu-button");
  const menu = document.getElementById("navbar-content");
  if (!toggle || !menu) return;
  const close = () => {
    menu.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open navigation menu");
  };
  toggle.addEventListener("click", () => {
    const open = menu.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute(
      "aria-label",
      open ? "Close navigation menu" : "Open navigation menu",
    );
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.classList.contains("open")) {
      close();
      toggle.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (!menu.contains(event.target) && !toggle.contains(event.target)) close();
  });
  menu.addEventListener("click", (event) => {
    if (event.target.closest("a")) close();
  });
  window.matchMedia("(min-width: 851px)").addEventListener("change", close);
})();
