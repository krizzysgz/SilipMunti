/* Browser OCR pre-check for SilipMunti. NOT a secure identity verification service.
 * The browser may be modified and text detection may be wrong. Admin retains final control.
 */
(function () {
  "use strict";
  const form = document.querySelector('[data-upload-form="valid_id"]');
  const fileInput = form?.querySelector('input[name="document"]');
  const typeInput = form?.querySelector('select[name="id_type"]');
  const output = document.querySelector("#id-ocr-result");
  const uploadButton = form?.querySelector('button[type="submit"]');
  if (!form || !fileInput || !typeInput || !output) return;

  const labels = {
    national_id: "National ID / PhilID / ePhilID",
    drivers_license: "LTO Driver's License",
    passport: "Philippine Passport",
    prc_id: "PRC Professional ID",
    umid: "UMID Card",
    sss_id: "SSS ID",
    gsis_id: "GSIS e-Card",
    postal_id: "Philippine Postal ID",
    voters_id: "COMELEC Voter’s ID / Certificate",
    senior_citizen_id: "Senior Citizen ID",
    pwd_id: "PWD ID",
    solo_parent_id: "Solo Parent ID",
    philhealth_id: "PhilHealth ID",
    tin_id: "BIR TIN ID",
    owwa_id: "OWWA e-Card / OFW ID",
    seafarer_id: "MARINA Seafarer’s ID / Record Book",
    ibp_id: "Integrated Bar of the Philippines (IBP) ID",
    pagibig_id: "Pag-IBIG / HDMF ID",
  };
  // Distinctive keywords only; generic phrases like "Republic of the Philippines" are ignored.
  // Some valid IDs have variable layouts. Uncertain results are referred to an admin.
  const rules = [
    [
      "national_id",
      [
        /PHILIPPINE\s+IDENTIFICATION/i,
        /PAMBANSANG\s+PAGKAKAKILANLAN/i,
        /PHILSYS/i,
        /PHILIPPINE\s+IDENTITY\s+CARD/i,
      ],
    ],
    [
      "drivers_license",
      [/DRIVER'?S?\s+LICEN[CS]E/i, /LAND\s+TRANSPORTATION\s+OFFICE/i],
    ],
    ["passport", [/\bPASSPORT\b/i, /\bPASAPORTE\b/i]],
    [
      "prc_id",
      [
        /PROFESSIONAL\s+REGULATION\s+COMMISSION/i,
        /PROFESSIONAL\s+IDENTIFICATION\s+CARD/i,
      ],
    ],
    ["umid", [/UNIFIED\s+MULTI.?PURPOSE/i, /\bUMID\b/i]],
    ["sss_id", [/SOCIAL\s+SECURITY\s+SYSTEM/i, /\bSSS\s+(?:ID|CARD)\b/i]],
    ["gsis_id", [/GOVERNMENT\s+SERVICE\s+INSURANCE\s+SYSTEM/i, /\bGSIS\b/i]],
    [
      "postal_id",
      [/PHILIPPINE\s+POSTAL/i, /POSTAL\s+IDENTITY\s+CARD/i, /PHLPOST/i],
    ],
    [
      "voters_id",
      [
        /COMMISSION\s+ON\s+ELECTIONS/i,
        /\bCOMELEC\b/i,
        /VOTER'?S?\s+(?:ID|CERTIFICAT)/i,
      ],
    ],
    [
      "senior_citizen_id",
      [/SENIOR\s+CITIZEN/i, /OFFICE\s+OF\s+SENIOR\s+CITIZEN\s+AFFAIRS/i],
    ],
    [
      "pwd_id",
      [
        /PERSON\s+WITH\s+DISABILIT/i,
        /PERSONS\s+WITH\s+DISABILIT/i,
        /\bPWD\s+(?:ID|CARD)\b/i,
      ],
    ],
    ["solo_parent_id", [/SOLO\s+PARENT/i]],
    ["philhealth_id", [/PHILIPPINE\s+HEALTH\s+INSURANCE/i, /\bPHILHEALTH\b/i]],
    [
      "tin_id",
      [
        /TAXPAYER'?S?\s+IDENTIFICATION/i,
        /BUREAU\s+OF\s+INTERNAL\s+REVENUE/i,
        /\bTIN\s+(?:CARD|ID)\b/i,
      ],
    ],
    ["owwa_id", [/OVERSEAS\s+WORKERS?\s+WELFARE/i, /\bOWWA\b/i]],
    [
      "seafarer_id",
      [
        /SEAFARER'?S?\s+(?:RECORD|IDENTITY)/i,
        /\bMARINA\b/i,
        /SEAMAN'?S?\s+BOOK/i,
      ],
    ],
    ["ibp_id", [/INTEGRATED\s+BAR\s+OF\s+THE\s+PHILIPPINES/i, /\bIBP\b/i]],
    [
      "pagibig_id",
      [/HOME\s+DEVELOPMENT\s+MUTUAL\s+FUND/i, /\bPAG.?IBIG\b/i, /\bHDMF\b/i],
    ],
  ];

  let generation = 0;
  let currentPromise = null;
  let lastKey = null;
  let lastResult = { status: "empty" };

  function keyFor(file) {
    return file && typeInput.value
      ? `${file.name}:${file.size}:${file.lastModified}:${typeInput.value}`
      : null;
  }
  function display(status, message) {
    output.className = `ocr-result ${status}`;
    output.textContent = message;
    if (uploadButton)
      uploadButton.disabled = status === "blocked" || status === "scanning";
  }
  function detect(text) {
    const hits = rules
      .map(([type, patterns]) => ({
        type,
        score: patterns.reduce((n, re) => n + Number(re.test(text)), 0),
      }))
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score);
    if (!hits.length || (hits.length > 1 && hits[0].score === hits[1].score))
      return null;
    return hits[0].type;
  }
  async function scan() {
    const file = fileInput.files?.[0];
    const key = keyFor(file);
    if (key && key === lastKey && !currentPromise) return lastResult;
    const thisRun = ++generation;
    lastKey = key;
    if (!key) {
      lastResult = { status: "empty" };
      display("neutral", "Select the ID type and a clear JPG/PNG image first.");
      return lastResult;
    }
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      lastResult = {
        status: "blocked",
        message:
          "Only JPG and PNG photos can be uploaded for government ID checking.",
      };
      display("blocked", lastResult.message);
      return lastResult;
    }
    if (file.size > 5 * 1024 * 1024) {
      lastResult = {
        status: "blocked",
        message: "Image must not exceed 5 MB.",
      };
      display("blocked", lastResult.message);
      return lastResult;
    }
    display("scanning", "Scanning your ID photo in your browser...");
    const task = (async () => {
      let worker;
      try {
        if (!window.Tesseract?.createWorker) throw new Error("OCR unavailable");
        worker = await window.Tesseract.createWorker("eng");
        const result = await worker.recognize(file);
        const detected = detect(result?.data?.text || "");
        let next;
        if (detected && detected !== typeInput.value) {
          next = {
            status: "blocked",
            detected,
            message: `ID TYPE MISMATCH: You selected ${labels[typeInput.value]}, but the photo appears to be ${labels[detected]}. Please select the matching ID type or choose a different photo before uploading.`,
          };
        } else if (detected) {
          next = {
            status: "match",
            detected,
            message: `Possible match: ${labels[detected]}. Final ID validity is checked by Admin.`,
          };
        } else {
          next = {
            status: "neutral",
            detected: null,
            message:
              "OCR could not confidently identify the ID type. You may submit it for manual Admin review.",
          };
        }
        if (thisRun === generation) {
          lastResult = next;
          display(next.status, next.message);
        }
        return next;
      } catch (err) {
        const next = {
          status: "neutral",
          message:
            "OCR is unavailable or could not read this image. Admin will verify the ID type manually.",
        };
        if (thisRun === generation) {
          lastResult = next;
          display(next.status, next.message);
        }
        return next;
      } finally {
        try {
          await worker?.terminate();
        } catch (_) {}
      }
    })();
    currentPromise = task;
    try {
      return await task;
    } finally {
      if (thisRun === generation) currentPromise = null;
    }
  }
  async function validateBeforeUpload() {
    // Re-evaluate the current file/type. Never trust stale OCR from a different selection.
    const file = fileInput.files?.[0];
    if (!file || !typeInput.value)
      return {
        allowed: false,
        message: "Select your ID type and ID photo first.",
      };
    if (currentPromise) await currentPromise;
    if (keyFor(file) !== lastKey) await scan();
    // If a previous scan finished for exactly this input, use it; otherwise scan now.
    if (keyFor(file) !== lastKey || lastResult.status === "empty") await scan();
    return lastResult.status === "blocked"
      ? { allowed: false, message: lastResult.message }
      : { allowed: true, message: lastResult.message };
  }
  fileInput.addEventListener("change", () => {
    scan();
  });
  typeInput.addEventListener("change", () => {
    scan();
  });
  window.SilipMuntiIdOcr = { validateBeforeUpload };
})();
