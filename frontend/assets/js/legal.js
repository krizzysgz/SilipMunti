(() => {
  const root = document.documentElement;
  const progressBar = document.querySelector("#legal-reading-progress-bar");
  const backToTop = document.querySelector("#legal-back-to-top");
  const pageSwitch = document.querySelector(".legal-page-switch");
  const pageSwitchLinks = [
    ...document.querySelectorAll(".legal-page-switch a"),
  ];
  const sections = [...document.querySelectorAll(".legal-section[id]")];
  const navigationLinks = [...document.querySelectorAll(".legal-navigation a")];
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  pageSwitchLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      if (
        link.classList.contains("active") ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      event.preventDefault();
      const targetPage = link.textContent.trim().toLowerCase();
      pageSwitch.classList.add("is-switching");

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          pageSwitchLinks.forEach((item) => {
            const isTarget = item === link;
            item.classList.toggle("active", isTarget);

            if (isTarget) {
              item.setAttribute("aria-current", "page");
            } else {
              item.removeAttribute("aria-current");
            }
          });
          pageSwitch.dataset.activePage = targetPage;

          window.setTimeout(
            () => window.location.assign(link.href),
            reduceMotion ? 0 : 500,
          );
        });
      });
    });
  });

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
