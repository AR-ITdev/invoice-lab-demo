export const PAGE_PATHS = { home: "/", documents: "/fatture", vim: "/vim", suppliers: "/anagrafica", rules: "/regole" };

export function routePath({ page, documentId, view = "main", column, link }) {
  const base = PAGE_PATHS[page];
  if (!base) throw new Error("Pagina non riconosciuta.");
  if (page === "documents" && documentId) {
    return `${base}/${encodeURIComponent(documentId)}${view === "trace" ? "/tracciato" : view === "document" ? "/documento" : ""}`;
  }
  if (page === "rules" && column) return `${base}/${encodeURIComponent(column)}`;
  if (page === "vim" && link) return `${base}?collegamento=${encodeURIComponent(link)}`;
  return base;
}

export function parseRoute(pathname, search = "") {
  const path = pathname.replace(/\/+$/, "") || "/";
  const page = Object.keys(PAGE_PATHS).find((key) => PAGE_PATHS[key] === path);
  if (page) return { page, link: page === "vim" ? new URLSearchParams(search).get("collegamento") : null };
  const invoice = path.match(/^\/fatture\/([^/]+)(?:\/(tracciato|documento))?$/);
  if (invoice) {
    try {
      return { page: "documents", documentId: decodeURIComponent(invoice[1]), view: invoice[2] === "tracciato" ? "trace" : invoice[2] === "documento" ? "document" : "main" };
    } catch (error) {
      if (!(error instanceof URIError)) throw error;
      return { page: "not-found" };
    }
  }
  const rule = path.match(/^\/regole\/([A-Z]+)$/);
  if (rule) return { page: "rules", column: rule[1] };
  return { page: "not-found" };
}
