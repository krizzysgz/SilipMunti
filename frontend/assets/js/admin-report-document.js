(function (global) {
  "use strict";

  const encoder = new TextEncoder();
  const BLUE = "1734C7";
  const GOLD = "F2C438";
  const DARK = "111827";
  const SLATE = "556174";
  const BORDER = "D9D9D9";
  const PALE = "F3F6FC";

  const scopeDefinitions = {
    full: {
      title: "SilipMunti Performance Report",
      filename: "Full-Performance-Report",
      sections: [
        "executive",
        "activity",
        "demand",
        "listings",
        "operations",
        "landlords",
        "reviews",
      ],
    },
    executive: {
      title: "SilipMunti Executive Summary Report",
      filename: "Executive-Summary",
      sections: ["executive"],
    },
    activity: {
      title: "Platform Activity and Listing Health Report",
      filename: "Activity-and-Listing-Health",
      sections: ["activity"],
    },
    demand: {
      title: "Rental Demand and Supply Report",
      filename: "Rental-Demand-and-Supply",
      sections: ["demand"],
    },
    listings: {
      title: "Listing Performance Report",
      filename: "Listing-Performance",
      sections: ["listings"],
    },
    operations: {
      title: "Inquiry and Verification Operations Report",
      filename: "Inquiry-and-Verification-Operations",
      sections: ["operations"],
    },
    landlords: {
      title: "Landlord Performance Report",
      filename: "Landlord-Performance",
      sections: ["landlords"],
    },
    reviews: {
      title: "Customer Reviews and Experience Report",
      filename: "Customer-Reviews-and-Experience",
      sections: ["reviews"],
    },
  };

  function xml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function clean(value) {
    return String(value ?? "").replace(
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,
      " ",
    );
  }

  function number(value) {
    return new Intl.NumberFormat("en-PH").format(Number(value) || 0);
  }

  function currency(value) {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(Number(value) || 0);
  }

  function percent(value) {
    return `${Number(value || 0).toFixed(1)}%`;
  }

  function rating(value, total) {
    return Number(total || 0) > 0
      ? `${Number(value || 0).toFixed(1)} out of 5`
      : "No rating";
  }

  function run(text, options = {}) {
    const properties = [
      options.bold ? "<w:b/>" : "",
      options.italic ? "<w:i/>" : "",
      options.color ? `<w:color w:val="${options.color}"/>` : "",
      options.size
        ? `<w:sz w:val="${options.size}"/><w:szCs w:val="${options.size}"/>`
        : "",
    ].join("");
    return `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ""}<w:t xml:space="preserve">${xml(clean(text))}</w:t></w:r>`;
  }

  function paragraph(content, options = {}) {
    const runs = Array.isArray(content) ? content.join("") : run(content);
    const properties = [
      options.style ? `<w:pStyle w:val="${options.style}"/>` : "",
      options.keepNext ? "<w:keepNext/>" : "",
      options.keepLines ? "<w:keepLines/>" : "",
      options.pageBreakBefore ? "<w:pageBreakBefore/>" : "",
      options.center ? '<w:jc w:val="center"/>' : "",
      options.right ? '<w:jc w:val="right"/>' : "",
      options.before || options.after
        ? `<w:spacing w:before="${options.before || 0}" w:after="${options.after || 0}"/>`
        : "",
      options.bullet
        ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'
        : "",
    ].join("");
    return `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ""}${runs}</w:p>`;
  }

  function bullet(label, value, options = {}) {
    return paragraph([run(`${label}: `, { bold: true }), run(value)], {
      bullet: true,
      after: 70,
      keepLines: true,
      keepNext: Boolean(options.keepNext),
    });
  }

  function heading(title, level = 1) {
    return paragraph(title, {
      style: level === 1 ? "Heading1" : "Heading2",
      keepNext: true,
      before: level === 1 ? 280 : 170,
      after: level === 1 ? 130 : 80,
    });
  }

  function body(text) {
    return paragraph(text, { after: 120, keepLines: true });
  }

  function tableCell(content, width, options = {}) {
    const fill = options.fill ? `<w:shd w:fill="${options.fill}"/>` : "";
    const vertical = '<w:vAlign w:val="center"/>';
    const margins =
      '<w:tcMar><w:top w:w="100" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar>';
    const cellParagraph = paragraph(
      [
        run(content, {
          bold: options.bold,
          color: options.color,
          size: options.size,
        }),
      ],
      { center: options.center, keepLines: true },
    );
    return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${fill}${vertical}${margins}</w:tcPr>${cellParagraph}</w:tc>`;
  }

  function table(headers, rows, widths, centerColumns = []) {
    const borders = `<w:tblBorders><w:top w:val="single" w:sz="4" w:color="${BORDER}"/><w:left w:val="single" w:sz="4" w:color="${BORDER}"/><w:bottom w:val="single" w:sz="4" w:color="${BORDER}"/><w:right w:val="single" w:sz="4" w:color="${BORDER}"/><w:insideH w:val="single" w:sz="4" w:color="${BORDER}"/><w:insideV w:val="single" w:sz="4" w:color="${BORDER}"/></w:tblBorders>`;
    const grid = widths.map((width) => `<w:gridCol w:w="${width}"/>`).join("");
    const header = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${headers
      .map((item, index) =>
        tableCell(item, widths[index], {
          fill: BLUE,
          color: "FFFFFF",
          bold: true,
          size: 18,
        }),
      )
      .join("")}</w:tr>`;
    const bodyRows = rows
      .map(
        (row, rowIndex) =>
          `<w:tr>${row
            .map((item, columnIndex) =>
              tableCell(item, widths[columnIndex], {
                fill: rowIndex % 2 ? PALE : "FFFFFF",
                bold: columnIndex === 0,
                center: centerColumns.includes(columnIndex),
                size: 19,
              }),
            )
            .join("")}</w:tr>`,
      )
      .join("");
    return `<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblLayout w:type="fixed"/>${borders}</w:tblPr><w:tblGrid>${grid}</w:tblGrid>${header}${bodyRows}</w:tbl>${paragraph("", { after: 90 })}`;
  }

  function trendText(value, label) {
    if (value === null || value === undefined)
      return `New ${label} with no previous baseline`;
    const amount = Number(value) || 0;
    if (amount === 0) return "No change from the previous period";
    return `${amount > 0 ? "Increased" : "Decreased"} by ${Math.abs(amount).toFixed(1)}% compared with the previous period`;
  }

  function executiveSection(data, context) {
    const overview = data.overview;
    const listings = data.listing_summary;
    const reviews = data.reviews;
    const inquiries = data.inquiries;
    const verification = data.verification;
    const parts = [
      heading("Executive Summary"),
      body(
        `This report covers ${context.periodLabel} for ${context.scopeLabel}. It summarizes platform activity, rental supply, service responsiveness, verification operations, and customer feedback for administrative decision making.`,
      ),
      table(
        ["Management indicator", "Result", "Interpretation"],
        [
          [
            "New users",
            number(overview.new_users),
            trendText(overview.trends?.new_users, "users"),
          ],
          [
            "Active listings",
            number(overview.active_listings),
            `${number(listings.available)} available and ${number(listings.occupied)} occupied`,
          ],
          [
            "Renter inquiries",
            number(overview.inquiries),
            trendText(overview.trends?.inquiries, "inquiries"),
          ],
          [
            "Saved listings",
            number(overview.favorites),
            "Recorded renter interest during the selected period",
          ],
          [
            "Landlord response rate",
            percent(overview.landlord_response_rate),
            `${number(inquiries.unanswered_over_48_hours)} unanswered after 48 hours`,
          ],
          [
            "Average customer rating",
            rating(overview.average_rating, reviews.total),
            `${number(reviews.total)} published reviews`,
          ],
          [
            "Pending verification",
            number(overview.pending_verifications),
            `${number(verification.pending_over_48_hours)} pending after 48 hours`,
          ],
          [
            "Reviews requiring attention",
            number(reviews.negative),
            "Ratings of 1 or 2 stars",
          ],
        ],
        [2600, 1500, 5260],
        [1],
      ),
      heading("Management Findings and Recommended Actions", 2),
    ];
    const insights = context.insights || [];
    insights.forEach((insight) => {
      parts.push(heading(insight.title, 2));
      parts.push(bullet("Finding", insight.finding));
      parts.push(bullet("Recommended action", insight.action));
    });
    return parts.join("");
  }

  function activitySection(data) {
    const summary = data.listing_summary;
    const parts = [
      heading("Platform Activity and Listing Health"),
      body(
        "This section shows activity recorded during the selected period and the current condition of the verified rental supply.",
      ),
      heading("Listing Health", 2),
      bullet("Total listings", number(summary.total)),
      bullet("Available listings", number(summary.available)),
      bullet("Occupied listings", number(summary.occupied)),
      bullet("Listings without images", number(summary.without_images)),
      bullet(
        "Listings not updated for at least 60 days",
        number(summary.stale),
      ),
      bullet("Average listing price", currency(summary.average_price)),
      heading("Activity Timeline", 2),
    ];
    const trend = data.trend || [];
    if (!trend.length) {
      parts.push(body("No activity was recorded for the selected period."));
    } else {
      trend.forEach((point) => {
        parts.push(
          bullet(
            point.date,
            `${number(point.users)} users, ${number(point.listings)} listings, ${number(point.inquiries)} inquiries, and ${number(point.reviews)} reviews`,
          ),
        );
      });
    }
    return parts.join("");
  }

  function demandSection(data) {
    const parts = [
      heading("Rental Demand and Supply"),
      body(
        "Barangay-level demand combines inquiries and saved listings, then compares that interest with the available rental supply.",
      ),
    ];
    const rows = data.demand_by_barangay || [];
    if (!rows.length)
      return `${parts.join("")}${body("No demand and supply data was available for the selected scope.")}`;
    rows.forEach((item) => {
      parts.push(heading(item.barangay, 2));
      parts.push(bullet("Available supply", number(item.available_listings)));
      parts.push(bullet("Renter inquiries", number(item.inquiries)));
      parts.push(bullet("Saved listings", number(item.favorites)));
      parts.push(bullet("Demand score", number(item.demand_score)));
      parts.push(
        bullet(
          "Demand per available listing",
          item.demand_per_available_listing === null
            ? "No available supply"
            : Number(item.demand_per_available_listing).toFixed(2),
        ),
      );
      parts.push(bullet("Average price", currency(item.average_price)));
    });
    return parts.join("");
  }

  function listingsSection(data) {
    const parts = [
      heading("Listing Performance"),
      body(
        "The following listings are ordered using renter engagement signals recorded in the selected period.",
      ),
    ];
    const rows = data.top_listings || [];
    if (!rows.length)
      return `${parts.join("")}${body("No listing performance data was available for the selected scope.")}`;
    rows.forEach((item) => {
      parts.push(heading(item.title, 2));
      parts.push(bullet("Landlord", item.landlord_name));
      parts.push(bullet("Location", item.barangay));
      parts.push(
        bullet(
          "Rental type and status",
          `${item.rental_type} - ${item.availability_status}`,
        ),
      );
      parts.push(bullet("Monthly price", currency(item.price)));
      parts.push(bullet("Inquiries", number(item.inquiries)));
      parts.push(bullet("Saved listings", number(item.favorites)));
      parts.push(
        bullet(
          "Customer rating",
          rating(item.average_rating, item.total_reviews),
        ),
      );
      parts.push(bullet("Engagement score", number(item.engagement_score)));
    });
    return parts.join("");
  }

  function operationsSection(data) {
    const inquiries = data.inquiries;
    const verification = data.verification;
    const parts = [
      heading("Inquiry and Verification Operations"),
      body(
        "This section summarizes landlord responsiveness and the speed and outcome of administrative document reviews.",
      ),
      heading("Inquiry Operations", 2),
      bullet("Total inquiries", number(inquiries.total)),
      bullet("Pending inquiries", number(inquiries.pending)),
      bullet("Closed inquiries", number(inquiries.closed)),
      bullet("Landlord response rate", percent(inquiries.response_rate)),
      bullet(
        "Average first response time",
        `${Number(inquiries.average_response_hours || 0).toFixed(1)} hours`,
      ),
      bullet(
        "Unanswered after 48 hours",
        number(inquiries.unanswered_over_48_hours),
      ),
      heading("Verification Efficiency", 2),
      bullet("Submitted documents", number(verification.submitted)),
      bullet("Approved documents", number(verification.approved)),
      bullet("Rejected documents", number(verification.rejected)),
      bullet("Current pending backlog", number(verification.pending)),
      bullet(
        "Pending after 48 hours",
        number(verification.pending_over_48_hours),
      ),
      bullet(
        "Average review time",
        `${Number(verification.average_review_hours || 0).toFixed(1)} hours`,
      ),
      heading("Recorded Rejection Reasons", 2),
    ];
    const reasons = verification.rejection_reasons || [];
    if (!reasons.length)
      parts.push(
        body("No rejection reason was recorded for the selected period."),
      );
    reasons.forEach((item) =>
      parts.push(bullet(item.reason, number(item.total))),
    );
    return parts.join("");
  }

  function landlordsSection(data, context) {
    const parts = [
      heading("Landlord Performance"),
      body(
        "Performance combines verification level, active rental supply, inquiry response, and published renter ratings.",
      ),
    ];
    const rows = data.landlords || [];
    if (!rows.length)
      return `${parts.join("")}${body("No landlord performance data was available for the selected scope.")}`;
    rows.forEach((item) => {
      parts.push(heading(item.landlord_name, 2));
      parts.push(
        bullet(
          "Verification",
          context.verificationLabel(item.verification_level),
        ),
      );
      parts.push(bullet("Active listings", number(item.active_listings)));
      parts.push(bullet("Inquiries", number(item.inquiries)));
      parts.push(
        bullet(
          "Response rate",
          Number(item.inquiries) > 0
            ? percent(item.response_rate)
            : "No inquiries",
        ),
      );
      parts.push(
        bullet(
          "Average rating",
          rating(item.average_rating, item.total_reviews),
        ),
      );
      parts.push(bullet("Published reviews", number(item.total_reviews)));
    });
    return parts.join("");
  }

  function reviewsSection(data) {
    const reviews = data.reviews;
    const parts = [
      heading("Customer Reviews and Experience"),
      body(
        "Published customer feedback is summarized to identify service strengths and issues requiring administrative follow-up.",
      ),
      heading("Customer Feedback Summary", 2),
      bullet("Published reviews", number(reviews.total)),
      bullet("Average rating", rating(reviews.average_rating, reviews.total)),
      bullet("Positive reviews", number(reviews.positive)),
      bullet("Neutral reviews", number(reviews.neutral)),
      bullet("Negative reviews", number(reviews.negative)),
      bullet("Platform reviews", number(reviews.platform)),
      bullet("Listing reviews", number(reviews.listing)),
      heading("Rating Distribution", 2),
    ];
    [5, 4, 3, 2, 1].forEach((score) => {
      parts.push(
        bullet(
          `${score} ${score === 1 ? "star" : "stars"}`,
          number(reviews.distribution?.[score] || 0),
        ),
      );
    });
    parts.push(heading("Recurring Feedback Themes", 2));
    const themes = reviews.themes || [];
    if (!themes.length)
      parts.push(body("No recurring review theme was detected."));
    themes.forEach((item) => {
      parts.push(
        bullet(
          item.theme,
          `${number(item.mentions)} mentions, including ${number(item.negative_mentions)} negative mentions`,
        ),
      );
    });
    parts.push(heading("Reviews Requiring Attention", 2));
    const attention = reviews.negative_reviews || [];
    if (!attention.length)
      parts.push(
        body(
          "No negative customer review was recorded for the selected period.",
        ),
      );
    attention.forEach((item) => {
      parts.push(heading(`${item.subject} - ${item.rating} stars`, 2));
      parts.push(bullet("Date", item.created_at, { keepNext: true }));
      parts.push(bullet("Customer", item.customer_name, { keepNext: true }));
      parts.push(bullet("Feedback", item.comment));
    });
    return parts.join("");
  }

  function documentXml(data, context, scope) {
    const builders = {
      executive: () => executiveSection(data, context),
      activity: () => activitySection(data),
      demand: () => demandSection(data),
      listings: () => listingsSection(data),
      operations: () => operationsSection(data),
      landlords: () => landlordsSection(data, context),
      reviews: () => reviewsSection(data),
    };
    const content = scope.sections
      .map((section) => builders[section]())
      .join("");
    const intro = [
      paragraph(scope.title, { style: "Title", keepNext: true, after: 120 }),
      paragraph("Administrative Analytics", {
        style: "Subtitle",
        keepNext: true,
        after: 220,
      }),
      table(
        ["Report detail", "Value"],
        [
          ["Reporting period", context.periodLabel],
          ["Scope", context.scopeLabel],
          ["Generated by", context.adminName],
          ["Generated on", context.generatedLabel],
        ],
        [2500, 6860],
      ),
    ].join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${intro}${content}<w:sectPr><w:headerReference w:type="default" r:id="rId1"/><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="900" w:right="1080" w:bottom="900" w:left="1080" w:header="420" w:footer="420"/><w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr></w:body></w:document>`;
  }

  function stylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:color w:val="${DARK}"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="120"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="000000"/><w:sz w:val="48"/><w:szCs w:val="48"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="${BLUE}"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:caps/><w:spacing w:val="24"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:uiPriority w:val="9"/><w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="000000"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:uiPriority w:val="9"/><w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="000000"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style></w:styles>`;
  }

  function numberingXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="540"/></w:tabs><w:ind w:left="540" w:hanging="240"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
  }

  function headerXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${run("SILIP", { bold: true, color: BLUE, size: 22 })}${run("MUNTI", { bold: true, color: GOLD, size: 22 })}${run("   ADMINISTRATIVE REPORT", { bold: true, color: SLATE, size: 16 })}</w:p></w:hdr>`;
  }

  function footerXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="80" w:after="0"/></w:pPr>${run("Confidential - For administrative use only   |   Page ", { color: SLATE, size: 16 })}<w:fldSimple w:instr="PAGE"><w:r><w:rPr><w:color w:val="${SLATE}"/><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>`;
  }

  function relationshipsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>`;
  }

  function contentTypesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
  }

  function rootRelationshipsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
  }

  function coreXml(data, context, title) {
    const generated = new Date(data.generated_at || Date.now()).toISOString();
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(title)}</dc:title><dc:creator>${xml(context.adminName)}</dc:creator><dc:subject>SilipMunti administrative analytics</dc:subject><dc:description>Selected platform report for administrative decision making</dc:description><dcterms:created xsi:type="dcterms:W3CDTF">${generated}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${generated}</dcterms:modified></cp:coreProperties>`;
  }

  function appXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>SilipMunti</Application><AppVersion>1.0</AppVersion></Properties>`;
  }

  function settingsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="100"/><w:updateFields w:val="true"/><w:defaultTabStop w:val="720"/></w:settings>`;
  }

  function crcTable() {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let current = index;
      for (let bit = 0; bit < 8; bit += 1) {
        current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
      }
      table[index] = current >>> 0;
    }
    return table;
  }

  const crcValues = crcTable();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes)
      crc = crcValues[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function dosDateTime() {
    const current = new Date();
    const year = Math.max(1980, current.getFullYear());
    return {
      time:
        (current.getHours() << 11) |
        (current.getMinutes() << 5) |
        Math.floor(current.getSeconds() / 2),
      date:
        ((year - 1980) << 9) |
        ((current.getMonth() + 1) << 5) |
        current.getDate(),
    };
  }

  function combine(parts) {
    const result = new Uint8Array(
      parts.reduce((total, part) => total + part.length, 0),
    );
    let offset = 0;
    parts.forEach((part) => {
      result.set(part, offset);
      offset += part.length;
    });
    return result;
  }

  function zip(files) {
    const localParts = [];
    const centralParts = [];
    const timestamp = dosDateTime();
    let offset = 0;
    Object.entries(files).forEach(([name, content]) => {
      const nameBytes = encoder.encode(name);
      const dataBytes =
        typeof content === "string" ? encoder.encode(content) : content;
      const checksum = crc32(dataBytes);
      const localHeader = new Uint8Array(30);
      const localView = new DataView(localHeader.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0x0800, true);
      localView.setUint16(8, 0, true);
      localView.setUint16(10, timestamp.time, true);
      localView.setUint16(12, timestamp.date, true);
      localView.setUint32(14, checksum, true);
      localView.setUint32(18, dataBytes.length, true);
      localView.setUint32(22, dataBytes.length, true);
      localView.setUint16(26, nameBytes.length, true);
      localParts.push(localHeader, nameBytes, dataBytes);
      const centralHeader = new Uint8Array(46);
      const centralView = new DataView(centralHeader.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0x0800, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(12, timestamp.time, true);
      centralView.setUint16(14, timestamp.date, true);
      centralView.setUint32(16, checksum, true);
      centralView.setUint32(20, dataBytes.length, true);
      centralView.setUint32(24, dataBytes.length, true);
      centralView.setUint16(28, nameBytes.length, true);
      centralView.setUint32(42, offset, true);
      centralParts.push(centralHeader, nameBytes);
      offset += localHeader.length + nameBytes.length + dataBytes.length;
    });
    const centralDirectory = combine(centralParts);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    const count = Object.keys(files).length;
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, count, true);
    endView.setUint16(10, count, true);
    endView.setUint32(12, centralDirectory.length, true);
    endView.setUint32(16, offset, true);
    return combine([...localParts, centralDirectory, end]);
  }

  function createBytes(data, context = {}, scopeKey = "full") {
    const scope = scopeDefinitions[scopeKey] || scopeDefinitions.full;
    return zip({
      "[Content_Types].xml": contentTypesXml(),
      "_rels/.rels": rootRelationshipsXml(),
      "docProps/core.xml": coreXml(data, context, scope.title),
      "docProps/app.xml": appXml(),
      "word/document.xml": documentXml(data, context, scope),
      "word/styles.xml": stylesXml(),
      "word/numbering.xml": numberingXml(),
      "word/settings.xml": settingsXml(),
      "word/header1.xml": headerXml(),
      "word/footer1.xml": footerXml(),
      "word/_rels/document.xml.rels": relationshipsXml(),
    });
  }

  function download(data, context = {}, scopeKey = "full") {
    const scope = scopeDefinitions[scopeKey] || scopeDefinitions.full;
    const bytes = createBytes(data, context, scopeKey);
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `SilipMunti-${scope.filename}-${data.filters.start_date}-to-${data.filters.end_date}.docx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  global.SilipMuntiReportDocument = { createBytes, download };
})(typeof window !== "undefined" ? window : globalThis);
