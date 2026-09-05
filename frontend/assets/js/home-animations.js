(() => {
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  if (reducedMotion) {
    return;
  }

  document.documentElement.classList.add("home-motion-ready");

  const observer =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) {
                return;
              }

              entry.target.classList.add("is-visible");
              observer.unobserve(entry.target);
            });
          },
          {
            threshold: 0.12,
            rootMargin: "0px 0px -7% 0px",
          },
        )
      : null;

  function observeElement(element, className, delay = 0) {
    if (!element || element.dataset.homeMotionReady === "true") {
      return;
    }

    element.dataset.homeMotionReady = "true";
    element.classList.add(className);
    element.style.setProperty("--home-reveal-delay", `${delay}ms`);

    if (observer) {
      observer.observe(element);
    } else {
      element.classList.add("is-visible");
    }
  }

  document
    .querySelectorAll(".home-section .section-heading")
    .forEach((heading, index) => {
      observeElement(
        heading,
        index % 2 === 0 ? "home-reveal-left" : "home-reveal-right",
      );
    });

  observeElement(document.querySelector(".review-carousel"), "home-reveal-up");

  const dynamicGroups = [
    {
      container: "#newly-added-listings",
      selector: ".property-card",
      stagger: 80,
      cycle: 4,
    },
    {
      container: "#featured-listings",
      selector: ".property-card",
      stagger: 80,
      cycle: 4,
    },
    {
      container: "#popular-locations",
      selector: ".location-card",
      stagger: 55,
      cycle: 9,
    },
    {
      container: "#verified-landlords",
      selector: ".home-landlord-card",
      stagger: 90,
      cycle: 4,
    },
  ];

  dynamicGroups.forEach((group) => {
    const container = document.querySelector(group.container);

    if (!container) {
      return;
    }

    const registerChildren = () => {
      container.querySelectorAll(group.selector).forEach((element, index) => {
        observeElement(
          element,
          "home-card-reveal",
          (index % group.cycle) * group.stagger,
        );
      });
    };

    registerChildren();

    const mutationObserver = new MutationObserver(() => {
      requestAnimationFrame(registerChildren);
    });

    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
    });
  });

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.add("home-motion-loaded");
    });
  });
})();
