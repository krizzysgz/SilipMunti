/* Responsive presentation only; values and submissions remain in properties.js. */
(() => {
  const filters = document.getElementById("additional-filters");
  const form = document.getElementById("properties-filter-form");
  const note = document.getElementById("filter-selection-note");
  if (!filters || !form) return;
  const smallScreen = window.matchMedia("(max-width: 767px)");
  const names = ["rental_type_id", "min_price", "bedroom_no"];
  const showCount = (count) => {
    if (!note) return;
    note.hidden = count === 0;
    note.textContent = count ? ` · ${count} selected` : "";
  };
  const updateCount = () =>
    showCount(
      names.filter((name) => form.elements.namedItem(name)?.value !== "")
        .length,
    );
  const initialParameters = new URLSearchParams(window.location.search);
  showCount(names.filter((name) => initialParameters.get(name)).length);
  const syncLayout = () => {
    filters.open =
      !smallScreen.matches || filters.contains(document.activeElement);
  };
  syncLayout();
  smallScreen.addEventListener("change", syncLayout);
  filters.addEventListener(
    "invalid",
    () => {
      filters.open = true;
    },
    true,
  );
  form.addEventListener("input", updateCount);
  form.addEventListener("change", updateCount);
  form.addEventListener("submit", updateCount);
  form.addEventListener("reset", () => {
    if (smallScreen.matches) filters.open = false;
    requestAnimationFrame(updateCount);
  });
})();
