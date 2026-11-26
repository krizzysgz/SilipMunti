(() => {
  "use strict";

  const appRoot = new URL("../../../", document.currentScript.src);
  window.SilipMuntiPaths = Object.freeze({
    base: appRoot.pathname.slice(0, -1),
  });
})();
