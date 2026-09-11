(function (global) {
  "use strict";

  const encoder = new TextEncoder();
  const styleIds = {
    default: 0,
    title: 1,
    eyebrow: 2,
    section: 3,
    header: 4,
    text: 5,
    integer: 6,
    percent: 7,
    currency: 8,
    decimal: 9,
    note: 10,
    metaLabel: 11,
    metaValue: 12,
    alert: 13,
    success: 14,
    wrapped: 15,
    date: 16,
    highlight: 17,
    rating: 18,
    strong: 19,
  };

  function xml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function cleanText(value) {
    return String(value ?? "").replace(
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,
      " ",
    );
  }

  function text(value, style = "text") {
    return { value: cleanText(value), style, type: "string" };
  }

  function value(value, style = "integer") {
    const amount = Number(value);
    return {
      value: Number.isFinite(amount) ? amount : 0,
      style,
      type: "number",
    };
  }

  function date(valueToParse) {
    const parsed = new Date(String(valueToParse || "").replace(" ", "T"));
    if (Number.isNaN(parsed.getTime())) return text("Not available");
    const serial = parsed.getTime() / 86400000 + 25569;
    return { value: serial, style: "date", type: "number" };
  }

  function row(cells, height) {
    return { cells, height };
  }

  function percentage(valueToFormat) {
    return value((Number(valueToFormat) || 0) / 100, "percent");
  }

  function rating(valueToFormat) {
    return value(Number(valueToFormat) || 0, "rating");
  }

  function columnName(index) {
    let result = "";
    let number = index + 1;
    while (number > 0) {
      const remainder = (number - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      number = Math.floor((number - 1) / 26);
    }
    return result;
  }

  function sheetCell(cell, rowIndex, columnIndex) {
    if (cell === null || cell === undefined) return "";
    const normalized =
      typeof cell === "object" && "value" in cell ? cell : text(cell);
    const reference = `${columnName(columnIndex)}${rowIndex}`;
    const style = styleIds[normalized.style] ?? styleIds.default;
    if (normalized.type === "number") {
      return `<c r="${reference}" s="${style}"><v>${Number(normalized.value) || 0}</v></c>`;
    }
    return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(normalized.value)}</t></is></c>`;
  }

  function sheetXml(sheet) {
    const rows = sheet.rows
      .map((currentRow, rowOffset) => {
        const rowIndex = rowOffset + 1;
        const height = currentRow.height
          ? ` ht="${currentRow.height}" customHeight="1"`
          : "";
        const cells = currentRow.cells
          .map((cell, columnIndex) => sheetCell(cell, rowIndex, columnIndex))
          .join("");
        return `<row r="${rowIndex}"${height}>${cells}</row>`;
      })
      .join("");
    const columns = sheet.widths
      .map(
        (width, index) =>
          `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
      )
      .join("");
    const mergeCells = sheet.merges?.length
      ? `<mergeCells count="${sheet.merges.length}">${sheet.merges
          .map((reference) => `<mergeCell ref="${reference}"/>`)
          .join("")}</mergeCells>`
      : "";
    const freeze = sheet.freezeRow
      ? `<pane ySplit="${sheet.freezeRow}" topLeftCell="A${sheet.freezeRow + 1}" activePane="bottomLeft" state="frozen"/>`
      : "";
    const autoFilter = sheet.autoFilter
      ? `<autoFilter ref="${sheet.autoFilter}"/>`
      : "";
    const lastColumn = columnName(Math.max(0, sheet.widths.length - 1));
    const lastRow = Math.max(1, sheet.rows.length);

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  <dimension ref="A1:${lastColumn}${lastRow}"/>
  <sheetViews><sheetView showGridLines="0" workbookViewId="0">${freeze}</sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>${columns}</cols>
  <sheetData>${rows}</sheetData>
  ${autoFilter}
  ${mergeCells}
  <printOptions horizontalCentered="1"/>
  <pageMargins left="0.35" right="0.35" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="${sheet.fitToHeight ?? 0}"/>
</worksheet>`;
  }

  function stylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="5">
    <numFmt numFmtId="164" formatCode="&quot;₱&quot;#,##0"/>
    <numFmt numFmtId="165" formatCode="0.0%"/>
    <numFmt numFmtId="166" formatCode="0.0"/>
    <numFmt numFmtId="167" formatCode="mmm d, yyyy"/>
    <numFmt numFmtId="168" formatCode="0.0 &quot;/ 5&quot;"/>
  </numFmts>
  <fonts count="8">
    <font><sz val="10"/><color rgb="FF273245"/><name val="Arial"/><family val="2"/></font>
    <font><b/><sz val="16"/><color rgb="FF111827"/><name val="Arial"/><family val="2"/></font>
    <font><b/><sz val="9"/><color rgb="FF1734C7"/><name val="Arial"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FF172033"/><name val="Arial"/><family val="2"/></font>
    <font><sz val="9"/><color rgb="FF6B7280"/><name val="Arial"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FFB42335"/><name val="Arial"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FF0C7A49"/><name val="Arial"/><family val="2"/></font>
  </fonts>
  <fills count="8">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1734C7"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEFF3FF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF4F6F9"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF5D6"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFE7EA"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE4F5ED"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="4">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left/><right/><top/><bottom style="thin"><color rgb="FFDDE3EC"/></bottom><diagonal/></border>
    <border><left style="thin"><color rgb="FFD3DAE5"/></left><right style="thin"><color rgb="FFD3DAE5"/></right><top style="thin"><color rgb="FFD3DAE5"/></top><bottom style="thin"><color rgb="FFD3DAE5"/></bottom><diagonal/></border>
    <border><left/><right/><top/><bottom style="medium"><color rgb="FF1734C7"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="20">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="3" xfId="0" applyFont="1" applyBorder="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="3" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment vertical="center"/></xf>
    <xf numFmtId="3" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="165" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="166" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="6" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="7" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment vertical="top" wrapText="1" indent="1"/></xf>
    <xf numFmtId="167" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="168" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  }

  function workbookXml(sheets) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews>
  <sheets>${sheets
    .map(
      (sheet, index) =>
        `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join("")}</sheets>
  <calcPr calcId="191029" fullCalcOnLoad="1"/>
</workbook>`;
  }

  function workbookRelationships(sheets) {
    const sheetRelations = sheets
      .map(
        (_, index) =>
          `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
      )
      .join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRelations}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  }

  function contentTypes(sheets) {
    const worksheetTypes = sheets
      .map(
        (_, index) =>
          `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  ${worksheetTypes}
</Types>`;
  }

  function documentRelationships() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
  }

  function coreProperties(generatedAt) {
    const parsed = new Date(String(generatedAt || "").replace(" ", "T"));
    const timestamp = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>SilipMunti Performance Report</dc:title>
  <dc:subject>Administrative analytics and stakeholder report</dc:subject>
  <dc:creator>SilipMunti</dc:creator>
  <cp:lastModifiedBy>SilipMunti</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${timestamp.toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp.toISOString()}</dcterms:modified>
</cp:coreProperties>`;
  }

  function appProperties(sheets) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>SilipMunti</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${sheets.length}</vt:i4></vt:variant></vt:vector></HeadingPairs>
  <TitlesOfParts><vt:vector size="${sheets.length}" baseType="lpstr">${sheets.map((sheet) => `<vt:lpstr>${xml(sheet.name)}</vt:lpstr>`).join("")}</vt:vector></TitlesOfParts>
</Properties>`;
  }

  function makeMetaRows(data, context, columns) {
    const period =
      context.periodLabel ||
      `${data.filters.start_date} to ${data.filters.end_date}`;
    const scope = context.scopeLabel || "All barangays and all rental types";
    return {
      rows: [
        row([], 9),
        row([text("ADMINISTRATIVE ANALYTICS", "eyebrow")], 16),
        row([text("SilipMunti Performance Report", "title")], 28),
        row([], 8),
        row(
          [
            text("Reporting period", "metaLabel"),
            text(period, "metaValue"),
            null,
            text("Scope", "metaLabel"),
            text(scope, "metaValue"),
          ],
          18,
        ),
        row(
          [
            text("Generated by", "metaLabel"),
            text(
              data.generated_by || context.adminName || "Administrator",
              "metaValue",
            ),
            null,
            text("Generated on", "metaLabel"),
            text(context.generatedLabel || data.generated_at, "metaValue"),
          ],
          18,
        ),
        row([], 10),
      ],
      merges: [
        `A2:${columns}2`,
        `A3:${columns}3`,
        `E5:${columns}5`,
        `E6:${columns}6`,
      ],
    };
  }

  function headlineInterpretations(data) {
    const overview = data.overview;
    const inquiries = data.inquiries;
    const reviews = data.reviews;
    const listingSummary = data.listing_summary;
    const unanswered = Number(inquiries.unanswered_over_48_hours) || 0;
    const delayedDocuments =
      Number(data.verification.pending_over_48_hours) || 0;
    const negativeReviews = Number(reviews.negative) || 0;
    const trend = (amount, subject) => {
      if (amount === null || amount === undefined)
        return `No previous-period baseline is available for ${subject}.`;
      const change = Number(amount) || 0;
      if (change === 0) return `No change from the previous comparable period.`;
      return `${subject} ${change > 0 ? "increased" : "decreased"} by ${Math.abs(change).toFixed(1)}% from the previous comparable period.`;
    };
    return [
      [
        "New users",
        value(overview.new_users),
        trend(overview.trends?.new_users, "User registration"),
      ],
      [
        "Active listings",
        value(overview.active_listings),
        `${Number(listingSummary.available) || 0} available and ${Number(listingSummary.occupied) || 0} occupied listings are currently recorded.`,
      ],
      [
        "Inquiries",
        value(overview.inquiries),
        trend(overview.trends?.inquiries, "Renter inquiries"),
      ],
      [
        "Favorites",
        value(overview.favorites),
        "Saved listings indicate renter interest within the selected period.",
      ],
      [
        "Landlord response rate",
        percentage(overview.landlord_response_rate),
        inquiries.total > 0
          ? `${unanswered} ${unanswered === 1 ? "inquiry remained" : "inquiries remained"} unanswered for more than 48 hours.`
          : "No inquiry response baseline is available for this period.",
      ],
      [
        "Average customer rating",
        rating(overview.average_rating),
        `${Number(reviews.total) || 0} published customer reviews were included in the selected period.`,
      ],
      [
        "Pending verification",
        value(overview.pending_verifications),
        `${delayedDocuments} ${delayedDocuments === 1 ? "document has" : "documents have"} remained pending for more than 48 hours.`,
      ],
      [
        "Customer reviews",
        value(overview.total_reviews),
        `${negativeReviews} negative ${negativeReviews === 1 ? "review requires" : "reviews require"} administrative attention.`,
      ],
    ];
  }

  function executiveSheet(data, context) {
    const base = makeMetaRows(data, context, "F");
    const rows = [...base.rows];
    const merges = [...base.merges];
    rows.push(row([text("EXECUTIVE SUMMARY", "section")], 20));
    merges.push(`A${rows.length}:F${rows.length}`);
    rows.push(
      row(
        [
          text("Management indicator", "header"),
          null,
          text("Result", "header"),
          text("Interpretation", "header"),
        ],
        24,
      ),
    );
    const tableHeaderRow = rows.length;
    merges.push(
      `A${tableHeaderRow}:B${tableHeaderRow}`,
      `D${tableHeaderRow}:F${tableHeaderRow}`,
    );
    headlineInterpretations(data).forEach(
      ([label, metricValue, interpretation]) => {
        rows.push(
          row(
            [
              text(label, "strong"),
              null,
              metricValue,
              text(interpretation, "wrapped"),
            ],
            27,
          ),
        );
        const rowNumber = rows.length;
        merges.push(
          `A${rowNumber}:B${rowNumber}`,
          `D${rowNumber}:F${rowNumber}`,
        );
      },
    );
    rows.push(row([], 10));
    rows.push(
      row([text("MANAGEMENT FINDINGS AND RECOMMENDED ACTIONS", "section")], 20),
    );
    merges.push(`A${rows.length}:F${rows.length}`);
    rows.push(
      row(
        [
          text("Priority", "header"),
          text("Finding", "header"),
          null,
          text("Interpretation", "header"),
          text("Recommended action", "header"),
        ],
        24,
      ),
    );
    merges.push(
      `B${rows.length}:C${rows.length}`,
      `E${rows.length}:F${rows.length}`,
    );
    (context.insights || []).forEach((insight, index) => {
      const priority =
        insight.type === "critical"
          ? "High"
          : insight.type === "warning"
            ? "Moderate"
            : "Monitor";
      const priorityStyle =
        insight.type === "critical"
          ? "alert"
          : insight.type === "success"
            ? "success"
            : "text";
      rows.push(
        row(
          [
            text(`${index + 1}. ${priority}`, priorityStyle),
            text(insight.title, "strong"),
            null,
            text(insight.finding, "wrapped"),
            text(insight.action, "wrapped"),
          ],
          42,
        ),
      );
      const rowNumber = rows.length;
      merges.push(`B${rowNumber}:C${rowNumber}`, `E${rowNumber}:F${rowNumber}`);
    });
    rows.push(row([], 8));
    rows.push(
      row(
        [
          text("Scope note", "metaLabel"),
          text(
            "This workbook presents management indicators, aggregate results, and prioritized records from the selected SilipMunti report scope.",
            "note",
          ),
        ],
        30,
      ),
    );
    merges.push(`B${rows.length}:F${rows.length}`);

    return {
      name: "Executive Summary",
      widths: [20, 19, 14, 30, 28, 26],
      rows,
      merges,
      freezeRow: tableHeaderRow,
      fitToHeight: 1,
    };
  }

  function operationsSheet(data, context) {
    const base = makeMetaRows(data, context, "F");
    const rows = [...base.rows];
    const merges = [...base.merges];
    const addMetricSection = (title, metrics) => {
      rows.push(row([text(title, "section")], 20));
      merges.push(`A${rows.length}:F${rows.length}`);
      rows.push(
        row(
          [
            text("Indicator", "header"),
            null,
            null,
            text("Result", "header"),
            null,
            null,
          ],
          22,
        ),
      );
      merges.push(
        `A${rows.length}:C${rows.length}`,
        `D${rows.length}:F${rows.length}`,
      );
      metrics.forEach(([label, metricValue]) => {
        rows.push(row([text(label, "strong"), null, null, metricValue], 22));
        merges.push(
          `A${rows.length}:C${rows.length}`,
          `D${rows.length}:F${rows.length}`,
        );
      });
      rows.push(row([], 9));
    };

    addMetricSection("INQUIRY OPERATIONS", [
      ["Total inquiries", value(data.inquiries.total)],
      ["Pending inquiries", value(data.inquiries.pending)],
      ["Closed inquiries", value(data.inquiries.closed)],
      ["Landlord response rate", percentage(data.inquiries.response_rate)],
      [
        "Average first response",
        text(
          `${Number(data.inquiries.average_response_hours || 0).toFixed(1)} hours`,
          "metaValue",
        ),
      ],
      [
        "Unanswered after 48 hours",
        value(data.inquiries.unanswered_over_48_hours),
      ],
    ]);
    addMetricSection("VERIFICATION OPERATIONS", [
      ["Submitted this period", value(data.verification.submitted)],
      ["Approved", value(data.verification.approved)],
      ["Rejected", value(data.verification.rejected)],
      ["Current pending backlog", value(data.verification.pending)],
      [
        "Pending after 48 hours",
        value(data.verification.pending_over_48_hours),
      ],
      [
        "Average review time",
        text(
          `${Number(data.verification.average_review_hours || 0).toFixed(1)} hours`,
          "metaValue",
        ),
      ],
    ]);
    addMetricSection("LISTING HEALTH", [
      ["Total listings", value(data.listing_summary.total)],
      ["Available", value(data.listing_summary.available)],
      ["Occupied", value(data.listing_summary.occupied)],
      ["Without images", value(data.listing_summary.without_images)],
      ["Stale for 60 days or more", value(data.listing_summary.stale)],
      [
        "Average listed price",
        value(data.listing_summary.average_price, "currency"),
      ],
    ]);

    rows.push(row([text("PLATFORM ACTIVITY TREND", "section")], 20));
    merges.push(`A${rows.length}:F${rows.length}`);
    rows.push(
      row(
        [
          text("Date", "header"),
          text("New users", "header"),
          text("New listings", "header"),
          text("Inquiries", "header"),
          text("Reviews", "header"),
        ],
        22,
      ),
    );
    const filterStart = rows.length;
    (data.trend || []).forEach((item) => {
      rows.push(
        row(
          [
            date(item.date),
            value(item.users),
            value(item.listings),
            value(item.inquiries),
            value(item.reviews),
          ],
          20,
        ),
      );
    });

    return {
      name: "Operations",
      widths: [24, 17, 17, 17, 19, 18],
      rows,
      merges,
      autoFilter: (data.trend || []).length
        ? `A${filterStart}:E${rows.length}`
        : null,
      freezeRow: filterStart,
    };
  }

  function demandSheet(data, context) {
    const base = makeMetaRows(data, context, "G");
    const rows = [...base.rows];
    const merges = [...base.merges];
    rows.push(
      row([text("RENTAL DEMAND AND SUPPLY BY BARANGAY", "section")], 20),
    );
    merges.push(`A${rows.length}:G${rows.length}`);
    rows.push(
      row(
        [
          text("Barangay", "header"),
          text("Available listings", "header"),
          text("Inquiries", "header"),
          text("Favorites", "header"),
          text("Demand score", "header"),
          text("Demand per listing", "header"),
          text("Average price", "header"),
        ],
        29,
      ),
    );
    const headerRow = rows.length;
    (data.demand_by_barangay || []).forEach((item) => {
      rows.push(
        row(
          [
            text(item.barangay, "strong"),
            value(item.available_listings),
            value(item.inquiries),
            value(item.favorites),
            value(item.demand_score, "highlight"),
            item.demand_per_available_listing === null
              ? text("No available supply", "alert")
              : value(item.demand_per_available_listing, "decimal"),
            value(item.average_price, "currency"),
          ],
          23,
        ),
      );
    });
    rows.push(row([], 10));
    rows.push(
      row(
        [
          text("Interpretation", "metaLabel"),
          text(
            "Higher demand per available listing indicates areas where renter interest may exceed current rental supply.",
            "note",
          ),
        ],
        28,
      ),
    );
    merges.push(`B${rows.length}:G${rows.length}`);
    return {
      name: "Demand and Supply",
      widths: [24, 19, 14, 14, 17, 21, 18],
      rows,
      merges,
      autoFilter: (data.demand_by_barangay || []).length
        ? `A${headerRow}:G${headerRow + data.demand_by_barangay.length}`
        : null,
      freezeRow: headerRow,
    };
  }

  function listingsSheet(data, context) {
    const base = makeMetaRows(data, context, "I");
    const rows = [...base.rows];
    const merges = [...base.merges];
    rows.push(row([text("LISTING PERFORMANCE", "section")], 20));
    merges.push(`A${rows.length}:I${rows.length}`);
    rows.push(
      row(
        [
          text("Listing", "header"),
          text("Landlord", "header"),
          text("Barangay", "header"),
          text("Rental type", "header"),
          text("Price", "header"),
          text("Inquiries", "header"),
          text("Favorites", "header"),
          text("Average rating", "header"),
          text("Engagement score", "header"),
        ],
        30,
      ),
    );
    const headerRow = rows.length;
    (data.top_listings || []).forEach((item) => {
      rows.push(
        row(
          [
            text(item.title, "strong"),
            text(item.landlord_name),
            text(item.barangay),
            text(item.rental_type),
            value(item.price, "currency"),
            value(item.inquiries),
            value(item.favorites),
            Number(item.total_reviews) > 0
              ? rating(item.average_rating)
              : text("No rating"),
            value(item.engagement_score, "highlight"),
          ],
          32,
        ),
      );
    });
    rows.push(row([], 10));
    rows.push(
      row(
        [
          text("Scope note", "metaLabel"),
          text(
            "The table contains the highest-performing listings returned by the administrative report for the selected scope.",
            "note",
          ),
        ],
        28,
      ),
    );
    merges.push(`B${rows.length}:I${rows.length}`);
    return {
      name: "Listing Performance",
      widths: [36, 25, 18, 18, 17, 14, 14, 18, 19],
      rows,
      merges,
      autoFilter: (data.top_listings || []).length
        ? `A${headerRow}:I${headerRow + data.top_listings.length}`
        : null,
      freezeRow: headerRow,
    };
  }

  function landlordSheet(data, context) {
    const base = makeMetaRows(data, context, "G");
    const rows = [...base.rows];
    const merges = [...base.merges];
    rows.push(row([text("LANDLORD PERFORMANCE", "section")], 20));
    merges.push(`A${rows.length}:G${rows.length}`);
    rows.push(
      row(
        [
          text("Landlord", "header"),
          text("Verification", "header"),
          text("Active listings", "header"),
          text("Inquiries", "header"),
          text("Response rate", "header"),
          text("Average rating", "header"),
          text("Reviews", "header"),
        ],
        28,
      ),
    );
    const headerRow = rows.length;
    (data.landlords || []).forEach((item) => {
      rows.push(
        row(
          [
            text(item.landlord_name, "strong"),
            text(
              context.verificationLabel?.(item.verification_level) ||
                item.verification_level,
            ),
            value(item.active_listings),
            value(item.inquiries),
            percentage(item.response_rate),
            Number(item.total_reviews) > 0
              ? rating(item.average_rating)
              : text("No rating"),
            value(item.total_reviews),
          ],
          24,
        ),
      );
    });
    rows.push(row([], 10));
    rows.push(
      row(
        [
          text("Management use", "metaLabel"),
          text(
            "Use response performance and customer ratings together when identifying landlords who may need service reminders or closer monitoring.",
            "note",
          ),
        ],
        30,
      ),
    );
    merges.push(`B${rows.length}:G${rows.length}`);
    return {
      name: "Landlord Performance",
      widths: [31, 22, 18, 16, 18, 18, 14],
      rows,
      merges,
      autoFilter: (data.landlords || []).length
        ? `A${headerRow}:G${headerRow + data.landlords.length}`
        : null,
      freezeRow: headerRow,
    };
  }

  function customerFeedbackSheet(data, context) {
    const reviews = data.reviews;
    const base = makeMetaRows(data, context, "F");
    const rows = [...base.rows];
    const merges = [...base.merges];
    rows.push(row([text("CUSTOMER FEEDBACK SUMMARY", "section")], 20));
    merges.push(`A${rows.length}:F${rows.length}`);
    rows.push(
      row(
        [
          text("Indicator", "header"),
          null,
          text("Result", "header"),
          text("Interpretation", "header"),
        ],
        24,
      ),
    );
    merges.push(
      `A${rows.length}:B${rows.length}`,
      `D${rows.length}:F${rows.length}`,
    );
    const summaryRows = [
      [
        "Published reviews",
        value(reviews.total),
        "Customer reviews included in the selected reporting period.",
      ],
      [
        "Average rating",
        rating(reviews.average_rating),
        "Overall rating across published reviews.",
      ],
      ["Positive reviews", value(reviews.positive), "Ratings of 4 or 5 stars."],
      ["Neutral reviews", value(reviews.neutral), "Ratings of 3 stars."],
      [
        "Negative reviews",
        value(reviews.negative),
        "Ratings of 1 or 2 stars requiring attention.",
      ],
    ];
    summaryRows.forEach(([label, metricValue, interpretation]) => {
      rows.push(
        row(
          [
            text(label, "strong"),
            null,
            metricValue,
            text(interpretation, "wrapped"),
          ],
          24,
        ),
      );
      merges.push(
        `A${rows.length}:B${rows.length}`,
        `D${rows.length}:F${rows.length}`,
      );
    });
    rows.push(row([], 9));
    rows.push(row([text("RECURRING FEEDBACK THEMES", "section")], 20));
    merges.push(`A${rows.length}:F${rows.length}`);
    rows.push(
      row(
        [
          text("Theme", "header"),
          null,
          text("Total mentions", "header"),
          text("Negative mentions", "header"),
        ],
        23,
      ),
    );
    merges.push(
      `A${rows.length}:B${rows.length}`,
      `D${rows.length}:F${rows.length}`,
    );
    (reviews.themes || []).forEach((item) => {
      rows.push(
        row(
          [
            text(item.theme, "strong"),
            null,
            value(item.mentions),
            value(item.negative_mentions),
          ],
          22,
        ),
      );
      merges.push(
        `A${rows.length}:B${rows.length}`,
        `D${rows.length}:F${rows.length}`,
      );
    });
    rows.push(row([], 9));
    rows.push(
      row([text("CUSTOMER REVIEWS REQUIRING ATTENTION", "section")], 20),
    );
    merges.push(`A${rows.length}:F${rows.length}`);
    rows.push(
      row(
        [
          text("Date", "header"),
          text("Customer", "header"),
          text("Subject", "header"),
          text("Rating", "header"),
          text("Feedback", "header"),
        ],
        24,
      ),
    );
    const reviewHeaderRow = rows.length;
    (reviews.negative_reviews || []).forEach((item) => {
      rows.push(
        row(
          [
            date(item.created_at),
            text(item.customer_name),
            text(item.subject, "strong"),
            rating(item.rating),
            text(item.comment, "wrapped"),
          ],
          42,
        ),
      );
    });
    rows.push(row([], 8));
    rows.push(
      row(
        [
          text("Privacy note", "metaLabel"),
          text(
            "Customer names are abbreviated in administrative reports. Feedback should be handled only for legitimate service-improvement and moderation purposes.",
            "note",
          ),
        ],
        30,
      ),
    );
    merges.push(`B${rows.length}:F${rows.length}`);
    return {
      name: "Customer Feedback",
      widths: [24, 20, 31, 14, 58, 3],
      rows,
      merges,
      autoFilter: (reviews.negative_reviews || []).length
        ? `A${reviewHeaderRow}:E${reviewHeaderRow + reviews.negative_reviews.length}`
        : null,
      freezeRow: reviewHeaderRow,
    };
  }

  function buildSheets(data, context) {
    return [
      executiveSheet(data, context),
      operationsSheet(data, context),
      demandSheet(data, context),
      listingsSheet(data, context),
      landlordSheet(data, context),
      customerFeedbackSheet(data, context),
    ];
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
    for (const byte of bytes) {
      crc = crcValues[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(dateValue) {
    const current = dateValue || new Date();
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
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(total);
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
    let offset = 0;
    const timestamp = dosDateTime(new Date());

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
      localView.setUint16(28, 0, true);
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
      centralView.setUint16(30, 0, true);
      centralView.setUint16(32, 0, true);
      centralView.setUint16(34, 0, true);
      centralView.setUint16(36, 0, true);
      centralView.setUint32(38, 0, true);
      centralView.setUint32(42, offset, true);
      centralParts.push(centralHeader, nameBytes);
      offset += localHeader.length + nameBytes.length + dataBytes.length;
    });

    const centralDirectory = combine(centralParts);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    const fileCount = Object.keys(files).length;
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(4, 0, true);
    endView.setUint16(6, 0, true);
    endView.setUint16(8, fileCount, true);
    endView.setUint16(10, fileCount, true);
    endView.setUint32(12, centralDirectory.length, true);
    endView.setUint32(16, offset, true);
    endView.setUint16(20, 0, true);

    return combine([...localParts, centralDirectory, end]);
  }

  function createBytes(data, context = {}) {
    const sheets = buildSheets(data, context);
    const files = {
      "[Content_Types].xml": contentTypes(sheets),
      "_rels/.rels": documentRelationships(),
      "docProps/core.xml": coreProperties(data.generated_at),
      "docProps/app.xml": appProperties(sheets),
      "xl/workbook.xml": workbookXml(sheets),
      "xl/_rels/workbook.xml.rels": workbookRelationships(sheets),
      "xl/styles.xml": stylesXml(),
    };
    sheets.forEach((sheet, index) => {
      files[`xl/worksheets/sheet${index + 1}.xml`] = sheetXml(sheet);
    });
    return zip(files);
  }

  function download(data, context = {}) {
    const bytes = createBytes(data, context);
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `SilipMunti-Performance-Report-${data.filters.start_date}-to-${data.filters.end_date}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  global.SilipMuntiReportWorkbook = { createBytes, download };
})(typeof window !== "undefined" ? window : globalThis);
