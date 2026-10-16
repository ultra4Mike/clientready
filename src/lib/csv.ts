/** CSV helpers (RFC 4180 quoting) and a browser download. */
export function csvLine(values: (string | number)[]) {
  return values.map((value) => {
    const text = String(value ?? "");
    // Keep spreadsheet apps from treating text as a formula.
    const safe = /^[=+\-@]/.test(text) && !/^-?\d/.test(text) ? `'${text}` : text;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  }).join(",");
}
export function csvText(header: string[], rows: (string | number)[][]) {
  return [csvLine(header), ...rows.map(csvLine)].join("\r\n") + "\r\n";
}
export function downloadCsv(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
