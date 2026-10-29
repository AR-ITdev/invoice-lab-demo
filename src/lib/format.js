const euroFormatter = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

export const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100 || 0;
export const money = (value) => euroFormatter.format(Number(value || 0));
export const dateText = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso ?? "") ? `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "Non indicata");
export const compactDate = (iso) => (iso ?? "").replaceAll("-", "");
export const decimalText = (value) => (value === "" || value === null || value === undefined ? "" : round2(value).toFixed(2).replace(".", ","));

export function columnLetter(index) {
  let n = index;
  let letters = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    letters = String.fromCharCode(65 + rest) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export const STATUS = {
  review: { label: "DA VERIFICARE", className: "pending" },
  processed: { label: "ELABORATO", className: "done" },
  discarded: { label: "SCARTATO", className: "skipped" },
  missing: { label: "NON TROVATO", className: "missing" },
  orphan: { label: "SENZA VIM", className: "missing" },
};
