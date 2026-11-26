(() => {
  "use strict";
  if (window.SilipMuntiMorePropertiesInitialized) return;
  window.SilipMuntiMorePropertiesInitialized = true;

  const API = "/SilipMunti/backend";
  const FRONTEND = "/SilipMunti/frontend";
  const placeholder = `${FRONTEND}/assets/images/property-placeholder.svg`;
  let section, rail, status, browse, previous, next;
  let requestVersion = 0;
  let current = null;
  let user = null;
  let favorites = new Set();
  const pending = new Set();

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function imageUrl(value) {
    if (typeof value !== "string" || !value.trim()) return placeholder;
    try {
      const url = new URL(value, window.location.origin);
      return ["http:", "https:"].includes(url.protocol)
        ? url.href
        : placeholder;
    } catch {
      return placeholder;
    }
  }

  function updateArrows() {
    if (!rail) return;
    const maximum = Math.max(0, rail.scrollWidth - rail.clientWidth);
    previous.disabled = rail.scrollLeft <= 2;
    next.disabled = rail.scrollLeft >= maximum - 2;
  }

  function scrollCards(direction) {
    const card = rail.querySelector(".same-barangay-card");
    if (!card) return;
    const gap = parseFloat(getComputedStyle(rail).gap) || 18;
    rail.scrollBy({
      left: direction * (card.getBoundingClientRect().width + gap),
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }

  function ensureSection() {
    if (section) return true;
    const container = document.querySelector(
      "#property-page > .property-container",
    );
    if (!container) return false;
    section = createElement("section", "same-barangay-section");
    section.id = "same-barangay-properties";
    section.setAttribute("aria-labelledby", "same-barangay-title");
    section.innerHTML = `
      <header class="same-barangay-heading">
        <div>
          <h2 id="same-barangay-title"></h2>
          <p>Explore other available rentals in this barangay.</p>
        </div>
        <a class="same-barangay-browse">Browse all <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
      </header>
      <div class="same-barangay-carousel">
        <button class="same-barangay-arrow same-barangay-prev" type="button" aria-label="Previous properties" disabled><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
        <div class="same-barangay-rail" role="list" tabindex="0" aria-label="More properties in this barangay"></div>
        <button class="same-barangay-arrow same-barangay-next" type="button" aria-label="Next properties" disabled><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
      </div>
      <div class="same-barangay-status" role="status" aria-live="polite"></div>`;
    container.appendChild(section);
    rail = section.querySelector(".same-barangay-rail");
    status = section.querySelector(".same-barangay-status");
    browse = section.querySelector(".same-barangay-browse");
    previous = section.querySelector(".same-barangay-prev");
    next = section.querySelector(".same-barangay-next");
    previous.addEventListener("click", () => scrollCards(-1));
    next.addEventListener("click", () => scrollCards(1));
    rail.addEventListener("scroll", updateArrows, { passive: true });
    rail.addEventListener("keydown", (event) => {
      if (
        event.target !== rail ||
        !["ArrowLeft", "ArrowRight"].includes(event.key)
      )
        return;
      event.preventDefault();
      scrollCards(event.key === "ArrowRight" ? 1 : -1);
    });
    window.addEventListener("resize", updateArrows);
    return true;
  }

  function updateHeart(button, id) {
    const saved = favorites.has(id);
    button.classList.toggle("is-saved", saved);
    button.setAttribute("aria-pressed", String(saved));
    button.setAttribute(
      "aria-label",
      saved ? "Remove property from favorites" : "Save property to favorites",
    );
    button.innerHTML = `<i class="${saved ? "fa-solid" : "fa-regular"} fa-heart" aria-hidden="true"></i>`;
    button.disabled = pending.has(id);
  }

  async function toggleFavorite(id, button) {
    if (!user) {
      window.SilipMuntiSession?.showLoginPrompt?.({
        title: "Save this property",
        message: "Sign in using a renter account to save properties.",
      });
      return;
    }
    if (user.role !== "renter") {
      await window.SilipModal?.warning?.({
        title: "Renter account required",
        message: "Only renter accounts can save properties.",
      });
      return;
    }
    if (pending.has(id)) return;
    pending.add(id);
    updateHeart(button, id);
    try {
      if (!window.SilipMuntiSession?.secureFetch)
        throw new Error("Refresh the page to initialize request security.");
      const removing = favorites.has(id);
      const response = await window.SilipMuntiSession.secureFetch(
        `${API}/renter/${removing ? "remove-favorite" : "add-favorite"}.php`,
        {
          method: removing ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listing_id: id }),
        },
      );
      const result = await response.json();
      if (response.status === 401) {
        user = null;
        window.SilipMuntiSession?.showLoginPrompt?.({
          title: "Your session has ended",
          message: "Sign in again to save properties.",
        });
        return;
      }
      // Another tab may already have saved this property.
      if (!removing && response.status === 409) favorites.add(id);
      else {
        if (!response.ok || !result.success)
          throw new Error(result.message || "Unable to update favorites.");
        if (removing) favorites.delete(id);
        else favorites.add(id);
      }
    } catch (error) {
      await window.SilipModal?.error?.({
        title: "Favorite not updated",
        message: error.message || "Please try again.",
      });
    } finally {
      pending.delete(id);
      updateHeart(button, id);
    }
  }

  function createCard(listing) {
    const id = Number(listing.id);
    const article = createElement("article", "same-barangay-card");
    article.setAttribute("role", "listitem");
    const href = `${FRONTEND}/pages/properties/details.html?id=${encodeURIComponent(id)}`;
    const media = createElement("div", "same-barangay-image-wrap");
    const imageLink = createElement("a", "same-barangay-image-link");
    imageLink.href = href;
    imageLink.setAttribute("aria-label", `View ${listing.title || "property"}`);
    const image = createElement("img", "same-barangay-image");
    image.src = imageUrl(
      listing.primary_image || listing.images?.[0]?.image_url,
    );
    image.alt = listing.title || "Rental property";
    image.loading = "lazy";
    image.addEventListener(
      "error",
      () => {
        image.src = placeholder;
      },
      { once: true },
    );
    imageLink.appendChild(image);
    const type = createElement(
      "span",
      "same-barangay-type",
      listing.rental_type || "Rental",
    );
    const heart = createElement("button", "same-barangay-heart");
    heart.type = "button";
    updateHeart(heart, id);
    heart.addEventListener("click", () => toggleFavorite(id, heart));
    const verified =
      listing.property_verified === true ||
      listing.property_verified === 1 ||
      listing.property_verified === "1";
    const badge = createElement(
      "span",
      `same-barangay-proof ${verified ? "is-verified" : "is-unverified"}`,
    );
    badge.innerHTML = `<i class="fa-solid ${verified ? "fa-shield-halved" : "fa-circle-info"}" aria-hidden="true"></i>`;
    badge.appendChild(
      document.createTextNode(
        verified ? " Property Verified" : " Property Unverified",
      ),
    );
    media.append(imageLink, badge, type, heart);

    const content = createElement("div", "same-barangay-content");
    const title = createElement("a", "same-barangay-title-link");
    title.href = href;
    title.appendChild(
      createElement("h3", "", listing.title || "Rental property"),
    );
    const location = createElement("p", "same-barangay-location");
    const locationIcon = createElement("i", "fa-solid fa-location-dot");
    locationIcon.setAttribute("aria-hidden", "true");
    location.append(
      locationIcon,
      document.createTextNode(
        `${listing.barangay}, ${listing.city || "Muntinlupa"}`,
      ),
    );
    const amount = Number(listing.price);
    const price = createElement(
      "p",
      "same-barangay-price",
      Number.isFinite(amount)
        ? new Intl.NumberFormat("en-PH", {
            style: "currency",
            currency: "PHP",
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
          }).format(amount)
        : "Price not specified",
    );
    price.appendChild(createElement("small", "", " / month"));
    const details = createElement("div", "same-barangay-specs");
    const addSpec = (iconClass, text) => {
      const item = createElement("span", "same-barangay-spec");
      const icon = createElement("i", iconClass);
      icon.setAttribute("aria-hidden", "true");
      item.append(icon, document.createTextNode(text));
      details.appendChild(item);
    };
    if (listing.bedroom_no !== null && listing.bedroom_no !== undefined) {
      const beds = Number(listing.bedroom_no);
      addSpec(
        "fa-solid fa-bed",
        beds === 0
          ? "Studio"
          : `${beds} ${beds === 1 ? "bedroom" : "bedrooms"}`,
      );
    }
    if (listing.occupancy_limit)
      addSpec("fa-solid fa-users", `Up to ${listing.occupancy_limit}`);
    if (listing.listing_size)
      addSpec("fa-solid fa-ruler-combined", `${listing.listing_size} m²`);
    const description = createElement(
      "p",
      "same-barangay-description",
      listing.description || "No description available.",
    );
    const amenities = createElement("ul", "same-barangay-amenities");
    let values = listing.amenities;
    if (typeof values === "string") {
      try {
        values = JSON.parse(values);
      } catch {
        values = values.split(/[,;|]/);
      }
    }
    const labels = Array.isArray(values)
      ? values
          .filter((item) => typeof item === "string" && item.trim())
          .map((item) => item.trim())
          .slice(0, 4)
      : [];
    (labels.length ? labels : ["No amenities listed"]).forEach((label) => {
      amenities.appendChild(createElement("li", "", label));
    });
    content.append(price, title, location, details, description, amenities);
    article.append(media, content);
    return article;
  }

  async function loadMoreProperties() {
    if (!current || !ensureSection()) return;
    const version = ++requestVersion;
    const barangay = String(current.barangay || "").trim();
    if (!barangay) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    section.querySelector("h2").textContent = `More properties in ${barangay}`;
    const query = new URLSearchParams({ barangay, sort: "newest", limit: "9" });
    browse.href = `${FRONTEND}/pages/properties/index.html?${new URLSearchParams({ barangay })}`;
    browse.setAttribute("aria-label", `Browse all properties in ${barangay}`);
    rail.replaceChildren();
    rail.setAttribute("aria-busy", "true");
    status.textContent = "Loading other properties...";
    previous.disabled = next.disabled = true;
    try {
      const response = await fetch(`${API}/listings/get-all.php?${query}`, {
        credentials: "include",
        cache: "no-store",
      });
      const result = await response.json();
      if (version !== requestVersion) return;
      if (
        !response.ok ||
        !result.success ||
        !Array.isArray(result.data?.listings)
      )
        throw new Error("Unable to load properties.");
      const seen = new Set();
      const rows = result.data.listings
        .filter((item) => {
          const id = Number(item.id);
          if (
            !Number.isSafeInteger(id) ||
            id < 1 ||
            id === Number(current.id) ||
            seen.has(id)
          )
            return false;
          if (
            String(item.barangay || "")
              .trim()
              .toLowerCase() !== barangay.toLowerCase()
          )
            return false;
          if (item.availability_status !== "available") return false;
          seen.add(id);
          return true;
        })
        .slice(0, 8);
      rows.forEach((item) => rail.appendChild(createCard(item)));
      rail.scrollLeft = 0;
      status.textContent = rows.length
        ? ""
        : `No other available properties in ${barangay} yet.`;
      requestAnimationFrame(updateArrows);
    } catch {
      if (version !== requestVersion) return;
      status.textContent = "Other properties could not be loaded. ";
      const retry = createElement("button", "same-barangay-retry", "Try again");
      retry.type = "button";
      retry.addEventListener("click", loadMoreProperties);
      status.appendChild(retry);
    } finally {
      if (version === requestVersion) rail.setAttribute("aria-busy", "false");
    }
  }

  window.addEventListener("silipmunti:property-loaded", async (event) => {
    if (!event.detail?.listing) return;
    current = event.detail.listing;
    favorites = new Set((event.detail.favoriteIds || []).map(Number));
    user = await window.SilipMuntiSession?.getCurrentUser?.();
    await loadMoreProperties();
  });
})();
