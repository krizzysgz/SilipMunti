(() => {
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  if (reducedMotion) {
    return;
  }

  document.documentElement.classList.add("motion-ready");

  const revealGroups = [
    {
      selector: ".trust-grid",
      children: ".trust-item",
      delay: 90,
    },
    {
      selector: ".story-layout",
      children: ".section-heading, .story-copy",
      delay: 130,
    },
    {
      selector: ".difference-section .about-container",
      children: ".section-heading, .feature-card",
      delay: 90,
    },
    {
      selector: ".process-layout",
      children: ".process-intro, .process-list li",
      delay: 110,
    },
    {
      selector: ".community-section .about-container",
      children: ".community-heading, .audience-card",
      delay: 120,
    },
    {
      selector: ".about-cta .about-container",
      children: ".cta-card",
      delay: 0,
    },
  ];

  revealGroups.forEach((group) => {
    const container = document.querySelector(group.selector);

    if (!container) {
      return;
    }

    container.querySelectorAll(group.children).forEach((element, index) => {
      element.classList.add("reveal-item");
      element.style.setProperty("--reveal-delay", `${index * group.delay}ms`);
    });
  });

  document
    .querySelectorAll(".story-layout > :first-child, .process-intro")
    .forEach((element) => element.classList.add("reveal-from-left"));

  document
    .querySelectorAll(".story-copy, .process-list li")
    .forEach((element) => element.classList.add("reveal-from-right"));

  const revealElements = document.querySelectorAll(".reveal-item");

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
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
        threshold: 0.14,
        rootMargin: "0px 0px -8% 0px",
      },
    );

    revealElements.forEach((element) => observer.observe(element));
  } else {
    revealElements.forEach((element) => element.classList.add("is-visible"));
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.add("about-motion-loaded");
    });
  });
})();
