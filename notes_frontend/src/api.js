//
// Notes API client helpers.
// Uses existing environment variables for backend base URL.
//

/**
 * Resolve the API base URL from environment variables.
 *
 * Preference order:
 * 1) REACT_APP_API_BASE
 * 2) REACT_APP_BACKEND_URL
 *
 * Falls back to empty string (same-origin) if neither is set.
 *
 * Keeping this centralized prevents hardcoding URLs throughout the app.
 */
function getApiBaseUrl() {
  const base =
    (process.env.REACT_APP_API_BASE || process.env.REACT_APP_BACKEND_URL || "").trim();

  // Normalize trailing slash
  if (!base) return "";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

/**
 * Attempt common notes endpoints in order. Since backend spec is not present
 * in this repo, we support the most typical paths.
 */
const NOTES_ENDPOINT_CANDIDATES = ["/notes", "/api/notes", "/v1/notes"];

/**
 * Low-level JSON fetch helper with consistent error reporting.
 */
async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => "");

  if (!res.ok) {
    const detail =
      (body && typeof body === "object" && (body.detail || body.message)) ||
      (typeof body === "string" && body) ||
      `Request failed with status ${res.status}`;
    const err = new Error(detail);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return body;
}

/**
 * Try a request against multiple candidate base paths.
 * Returns {data, basePathUsed}.
 */
async function tryNotesRequest(pathBuilder, options) {
  const apiBase = getApiBaseUrl();
  let lastErr = null;

  for (const basePath of NOTES_ENDPOINT_CANDIDATES) {
    const url = `${apiBase}${pathBuilder(basePath)}`;
    try {
      const data = await fetchJson(url, options);
      return { data, basePathUsed: basePath };
    } catch (e) {
      lastErr = e;
      // Continue trying other candidates only for 404 (not found).
      if (e && e.status !== 404) break;
    }
  }

  throw lastErr || new Error("Unable to reach notes API.");
}

/**
 * Normalize note shape coming from backend.
 * Supports: {id,title,content,updated_at} or {_id,...} or {noteId,...}
 */
function normalizeNote(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = raw.id ?? raw._id ?? raw.noteId ?? raw.uuid ?? raw.key;
  return {
    id: String(id),
    title: raw.title ?? "",
    content: raw.content ?? raw.body ?? "",
    updatedAt: raw.updated_at ?? raw.updatedAt ?? raw.modified_at ?? raw.modifiedAt ?? null,
    createdAt: raw.created_at ?? raw.createdAt ?? null,
  };
}

/**
 * Normalize list response. Supports arrays or {items:[...]} / {notes:[...]}.
 */
function normalizeNotesList(raw) {
  const arr = Array.isArray(raw) ? raw : raw?.items || raw?.notes || [];
  return (arr || []).map(normalizeNote).filter(Boolean);
}

// PUBLIC_INTERFACE
export async function listNotes() {
  /** Fetch all notes. Returns array of normalized notes. */
  const { data } = await tryNotesRequest((basePath) => `${basePath}`, { method: "GET" });
  return normalizeNotesList(data);
}

// PUBLIC_INTERFACE
export async function createNote(payload) {
  /** Create a note. payload: {title, content}. Returns normalized note. */
  const { data } = await tryNotesRequest((basePath) => `${basePath}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return normalizeNote(data) || normalizeNote(data?.note) || normalizeNote(data?.item);
}

// PUBLIC_INTERFACE
export async function updateNote(id, payload) {
  /** Update a note by id. payload: {title, content}. Returns normalized note. */
  const { data } = await tryNotesRequest((basePath) => `${basePath}/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return normalizeNote(data) || normalizeNote(data?.note) || normalizeNote(data?.item);
}

// PUBLIC_INTERFACE
export async function deleteNote(id) {
  /** Delete a note by id. Returns void (or backend response ignored). */
  await tryNotesRequest((basePath) => `${basePath}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
