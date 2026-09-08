(() => {
  const root = document.documentElement;
  const progressBar = document.querySelector("#legal-reading-progress-bar");
  const backToTop = document.querySelector("#legal-back-to-top");
  const sections = [...document.querySelectorAll(".legal-section[id]")];
  const navigationLinks = [...document.querySelectorAll(".legal-navigation a")];
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  root.classList.add("legal-enhanced");

  const updateReadingProgress = () => {
    const scrollableHeight = root.scrollHeight - window.innerHeight;
    const progress =
      scrollableHeight > 0
        ? Math.min(1, Math.max(0, window.scrollY / scrollableHeight))
        : 0;

    if (progressBar) {
      progressBar.style.transform = `scaleX(${progress})`;
    }

    backToTop?.classList.toggle("is-visible", window.scrollY > 540);
  };

  const setActiveSection = (id) => {
    navigationLinks.forEach((link) => {
      const isActive = link.getAttribute("href") === `#${id}`;
      link.classList.toggle("is-active", isActive);

      if (isActive) {
        link.setAttribute("aria-current", "true");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  };

  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.08, rootMargin: "0px 0px -70px" },
  );

  document
    .querySelectorAll(".legal-section, .legal-notice")
    .forEach((element) => {
      revealObserver.observe(element);
    });

  const sectionObserver = new IntersectionObserver(
    (entries) => {
      const visibleEntry = entries
        .filter((entry) => entry.isIntersecting)
        .sort(
          (first, second) => second.intersectionRatio - first.intersectionRatio,
        )[0];

      if (visibleEntry?.target.id) {
        setActiveSection(visibleEntry.target.id);
      }
    },
    { rootMargin: "-18% 0px -65%", threshold: [0.05, 0.25, 0.5] },
  );

  sections.forEach((section) => sectionObserver.observe(section));

  backToTop?.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  });

  window.addEventListener("scroll", updateReadingProgress, { passive: true });
  window.addEventListener("resize", updateReadingProgress);
  updateReadingProgress();
})();
