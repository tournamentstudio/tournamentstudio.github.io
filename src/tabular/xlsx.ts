import { Unzip, UnzipInflate, strToU8, zipSync } from "fflate";

const MAX_BYTES = 8 * 1024 * 1024;
const SHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const xmlEscape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[char]!,
  );
function columnName(index: number): string {
  let value = "";
  for (let number = index + 1; number; number = Math.floor((number - 1) / 26))
    value = String.fromCharCode(65 + ((number - 1) % 26)) + value;
  return value;
}
export function writeWorkbook(
  sheets: { name: string; rows: (string | number | boolean)[][] }[],
): Uint8Array {
  if (!sheets.length || sheets.length > 20)
    throw new Error("Use between 1 and 20 worksheets.");
  const names = new Set<string>();
  for (const sheet of sheets) {
    if (
      !sheet.name ||
      sheet.name.length > 31 ||
      /[\\/*?:[\]]/.test(sheet.name) ||
      names.has(sheet.name.toLowerCase())
    )
      throw new Error("Worksheet names must be unique and valid.");
    names.add(sheet.name.toLowerCase());
    if (sheet.rows.length > 20001 || sheet.rows.some((row) => row.length > 64))
      throw new Error("Worksheet exceeds the supported table size.");
  }
  const entries: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${SHEET_NS}" xmlns:r="${REL_NS}"><sheets>${sheets.map((sheet, i) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`,
    ),
  };
  let total = 0;
  sheets.forEach((sheet, sheetIndex) => {
    const data = sheet.rows
      .map(
        (row, rowIndex) =>
          `<row r="${rowIndex + 1}">${row
            .map((value, column) => {
              const ref = `${columnName(column)}${rowIndex + 1}`;
              if (typeof value === "number") {
                if (!Number.isFinite(value))
                  throw new Error("Workbook values must be finite.");
                return `<c r="${ref}"><v>${value}</v></c>`;
              }
              if (typeof value === "boolean")
                return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
              if (
                value.length > 32767 ||
                Array.from(value).some(
                  (char) =>
                    char.charCodeAt(0) < 32 &&
                    ![9, 10, 13].includes(char.charCodeAt(0)),
                )
              )
                throw new Error(
                  "Workbook text contains unsupported characters or is too long.",
                );
              // Explicit string cells keep formula-looking names as data.
              return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
            })
            .join("")}</row>`,
      )
      .join("");
    const bytes = strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${SHEET_NS}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${data}</sheetData></worksheet>`,
    );
    total += bytes.length;
    if (total > MAX_BYTES) throw new Error("Workbook content exceeds 8 MB.");
    entries[`xl/worksheets/sheet${sheetIndex + 1}.xml`] = bytes;
  });
  return zipSync(entries, { level: 6 });
}

export function readWorkbookEntries(
  bytes: Uint8Array,
): Record<string, Uint8Array> {
  if (bytes.length > 2 * 1024 * 1024 || bytes.length < 22)
    throw new Error("XLSX imports must be smaller than 2 MB.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let footer = bytes.length - 22;
  while (
    footer >= Math.max(0, bytes.length - 65557) &&
    view.getUint32(footer, true) !== 0x06054b50
  )
    footer--;
  if (
    footer < 0 ||
    view.getUint32(footer, true) !== 0x06054b50 ||
    footer + 22 + view.getUint16(footer + 20, true) !== bytes.length
  )
    throw new Error("The XLSX archive footer is incomplete.");
  const count = view.getUint16(footer + 10, true),
    offset = view.getUint32(footer + 16, true);
  if (
    !count ||
    count > 100 ||
    view.getUint16(footer + 4, true) ||
    view.getUint16(footer + 6, true) ||
    view.getUint16(footer + 8, true) !== count ||
    offset + view.getUint32(footer + 12, true) !== footer
  )
    throw new Error("Unsupported XLSX archive structure.");
  let cursor = offset,
    declared = 0;
  const directoryNames = new Set<string>();
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > footer || view.getUint32(cursor, true) !== 0x02014b50)
      throw new Error("The XLSX directory is damaged.");
    const length = view.getUint16(cursor + 28, true);
    const end =
      cursor +
      46 +
      length +
      view.getUint16(cursor + 30, true) +
      view.getUint16(cursor + 32, true);
    if (end > footer || view.getUint16(cursor + 8, true) & 1)
      throw new Error("Encrypted or damaged XLSX entries are unsupported.");
    const name = new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(cursor + 46, cursor + 46 + length),
    );
    if (
      directoryNames.has(name) ||
      /(^\/|\\|(^|\/)\.\.?($|\/))/.test(name) ||
      Array.from(name).some((char) => char.charCodeAt(0) < 32) ||
      /vbaProject|externalLinks|embeddings|activeX/i.test(name)
    )
      throw new Error("Unsafe or duplicate XLSX content.");
    directoryNames.add(name);
    declared += view.getUint32(cursor + 24, true);
    if (declared > MAX_BYTES)
      throw new Error("Expanded XLSX content exceeds 8 MB.");
    cursor = end;
  }
  if (cursor !== footer) throw new Error("Invalid XLSX directory size.");
  const entries: Record<string, Uint8Array> = Object.create(null) as Record<
    string,
    Uint8Array
  >;
  const seen = new Set<string>();
  let total = 0;
  const stream = new Unzip((file) => {
    if (seen.has(file.name) || !directoryNames.has(file.name))
      throw new Error("Unexpected XLSX entry.");
    seen.add(file.name);
    const chunks: Uint8Array[] = [];
    let size = 0;
    file.ondata = (error, chunk, final) => {
      if (error) throw new Error("Damaged XLSX content.");
      total += chunk.length;
      size += chunk.length;
      if (total > MAX_BYTES) {
        file.terminate();
        throw new Error("Expanded XLSX content exceeds 8 MB.");
      }
      chunks.push(chunk);
      if (final) {
        const result = new Uint8Array(size);
        let position = 0;
        for (const part of chunks) {
          result.set(part, position);
          position += part.length;
        }
        entries[file.name] = result;
      }
    };
    file.start();
  });
  stream.register(UnzipInflate);
  for (let index = 0; index < bytes.length; index += 1024)
    stream.push(
      bytes.subarray(index, index + 1024),
      index + 1024 >= bytes.length,
    );
  if (seen.size !== count || Object.keys(entries).length !== count)
    throw new Error("Incomplete XLSX content.");
  return entries;
}

function xml(bytes: Uint8Array | undefined): Document {
  if (!bytes) throw new Error("The XLSX workbook is missing a required part.");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw new Error("XLSX entity definitions are not supported.");
  const result = new DOMParser().parseFromString(text, "application/xml");
  if (result.getElementsByTagName("parsererror").length)
    throw new Error("Malformed XLSX XML.");
  return result;
}
const elements = (root: Document | Element, name: string) =>
  Array.from(root.getElementsByTagNameNS("*", name));
export function readFirstWorksheet(bytes: Uint8Array): {
  name: string;
  rows: string[][];
  sheetCount: number;
} {
  const entries = readWorkbookEntries(bytes);
  for (const [name, content] of Object.entries(entries)) {
    if (!name.endsWith(".rels")) continue;
    for (const relation of elements(xml(content), "Relationship")) {
      if (relation.getAttribute("TargetMode")?.toLowerCase() === "external")
        throw new Error("External workbook relationships are unsupported.");
    }
  }
  const sheets = elements(xml(entries["xl/workbook.xml"]), "sheet");
  if (!sheets.length || sheets.length > 20)
    throw new Error("Use between 1 and 20 worksheets.");
  const first = sheets[0],
    relId = first.getAttributeNS(REL_NS, "id") ?? first.getAttribute("r:id");
  const relations = elements(
    xml(entries["xl/_rels/workbook.xml.rels"]),
    "Relationship",
  );
  const relation = relations.find((item) => item.getAttribute("Id") === relId);
  const target = relation?.getAttribute("Target") ?? "";
  if (
    !/\/worksheet$/.test(relation?.getAttribute("Type") ?? "") ||
    !target ||
    target.includes("..") ||
    target.includes("\\")
  )
    throw new Error("Invalid worksheet relationship.");
  const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  const shared = entries["xl/sharedStrings.xml"]
    ? elements(xml(entries["xl/sharedStrings.xml"]), "si").map((item) =>
        elements(item, "t")
          .map((text) => text.textContent ?? "")
          .join(""),
      )
    : [];
  if (shared.length > 40000) throw new Error("Too many XLSX shared strings.");
  const sheet = xml(entries[path]),
    rowElements = elements(sheet, "row");
  if (rowElements.length > 513)
    throw new Error("Participant worksheets support 512 rows plus a header.");
  const used = new Set<string>();
  const rows = rowElements.map((row) => {
    const values: string[] = [];
    let expectedRow = row.getAttribute("r");
    for (const cell of elements(row, "c")) {
      if (elements(cell, "f").length)
        throw new Error(
          "Replace formulas with values before importing participants.",
        );
      const ref = cell.getAttribute("r") ?? "";
      const match = /^([A-Z]{1,2})([1-9][0-9]{0,5})$/.exec(ref);
      if (!match || used.has(ref))
        throw new Error("Invalid or duplicate worksheet cell.");
      expectedRow ??= match[2];
      if (expectedRow !== match[2])
        throw new Error("Cell references do not match their worksheet row.");
      used.add(ref);
      let column = 0;
      for (const char of match[1])
        column = column * 26 + char.charCodeAt(0) - 64;
      if (column > 64)
        throw new Error("Participant worksheets support up to 64 columns.");
      const type = cell.getAttribute("t"),
        raw = elements(cell, "v")[0]?.textContent ?? "";
      let value = raw;
      if (type === "s") {
        if (!/^\d+$/.test(raw) || shared[Number(raw)] === undefined)
          throw new Error("Invalid shared-string reference.");
        value = shared[Number(raw)];
      } else if (type === "inlineStr")
        value = elements(cell, "t")
          .map((text) => text.textContent ?? "")
          .join("");
      else if (type === "b") {
        if (!["0", "1"].includes(raw)) throw new Error("Invalid boolean cell.");
        value = raw === "1" ? "true" : "false";
      } else if (type && !["n", "str", "d"].includes(type))
        throw new Error("Unsupported worksheet cell type.");
      if (value.length > 32767) throw new Error("Worksheet text is too long.");
      values[column - 1] = value;
    }
    return values;
  });
  const width = rows[0]?.length ?? 0;
  return {
    name: first.getAttribute("name") ?? "",
    sheetCount: sheets.length,
    rows: rows
      .map((row) =>
        Array.from(
          { length: Math.max(width, row.length) },
          (_, index) => row[index] ?? "",
        ),
      )
      .filter((row) => row.some((value) => value.trim())),
  };
}
