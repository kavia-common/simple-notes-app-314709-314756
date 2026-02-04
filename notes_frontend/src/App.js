import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { createNote, deleteNote, listNotes, updateNote } from "./api";

/**
 * Small helper to format timestamps when available.
 */
function formatUpdatedAt(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function makeNewDraft() {
  return { title: "", content: "" };
}

// PUBLIC_INTERFACE
function App() {
  /** Notes app root component: list notes + detail editor + CRUD. */
  const [notes, setNotes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const [draft, setDraft] = useState(makeNewDraft());
  const [isNew, setIsNew] = useState(true);

  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState({ loading: true, saving: false, deleting: false });
  const [error, setError] = useState("");

  const [lastUsedBasePath, setLastUsedBasePath] = useState(null);

  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedId) || null,
    [notes, selectedId]
  );

  const editorTitleRef = useRef(null);

  useEffect(() => {
    // Light theme only per instructions.
    document.documentElement.setAttribute("data-theme", "light");
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError("");
      setStatus((s) => ({ ...s, loading: true }));
      try {
        const data = await listNotes();
        if (cancelled) return;
        setNotes(data);
        // Auto-select first note if present, otherwise open "New".
        if (data.length > 0) {
          setSelectedId(data[0].id);
          setIsNew(false);
          setDraft({ title: data[0].title, content: data[0].content });
        } else {
          setSelectedId(null);
          setIsNew(true);
          setDraft(makeNewDraft());
        }
      } catch (e) {
        if (cancelled) return;
        setError(
          `Couldn't load notes. ${e?.message || ""}`.trim() +
            " (Check REACT_APP_API_BASE / REACT_APP_BACKEND_URL and backend endpoints.)"
        );
      } finally {
        if (!cancelled) setStatus((s) => ({ ...s, loading: false }));
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep draft synced when selection changes.
  useEffect(() => {
    if (!selectedNote) return;
    setDraft({ title: selectedNote.title, content: selectedNote.content });
    setIsNew(false);
  }, [selectedNote]);

  const filteredNotes = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => {
      const t = (n.title || "").toLowerCase();
      const c = (n.content || "").toLowerCase();
      return t.includes(q) || c.includes(q);
    });
  }, [notes, filter]);

  async function refreshListAndKeepSelection(preferSelectId) {
    // Since backend spec isn't embedded here, keep this simple:
    // re-fetch list after mutations for correctness.
    try {
      const data = await listNotes();
      setNotes(data);

      if (data.length === 0) {
        setSelectedId(null);
        setIsNew(true);
        setDraft(makeNewDraft());
        return;
      }

      const candidate = preferSelectId && data.find((n) => n.id === preferSelectId);
      const nextId = candidate ? candidate.id : data[0].id;
      setSelectedId(nextId);
      setIsNew(false);
      const found = data.find((n) => n.id === nextId);
      setDraft({ title: found?.title || "", content: found?.content || "" });
    } catch (e) {
      setError(`Couldn't refresh notes. ${e?.message || ""}`.trim());
    }
  }

  // PUBLIC_INTERFACE
  function onClickNewNote() {
    /** Switch the right pane into "new note" mode. */
    setError("");
    setSelectedId(null);
    setIsNew(true);
    setDraft(makeNewDraft());
    // focus title on next tick
    setTimeout(() => editorTitleRef.current?.focus(), 0);
  }

  async function onSave() {
    setError("");
    const title = (draft.title || "").trim();
    const content = (draft.content || "").trim();

    if (!title && !content) {
      setError("Please enter a title or some content before saving.");
      return;
    }

    setStatus((s) => ({ ...s, saving: true }));
    try {
      if (isNew) {
        const created = await createNote({ title, content });
        // best-effort: select created if id returned
        await refreshListAndKeepSelection(created?.id || null);
      } else if (selectedId) {
        const updated = await updateNote(selectedId, { title, content });
        await refreshListAndKeepSelection(updated?.id || selectedId);
      }
    } catch (e) {
      setError(`Save failed. ${e?.message || ""}`.trim());
    } finally {
      setStatus((s) => ({ ...s, saving: false }));
    }
  }

  async function onDelete() {
    setError("");
    if (isNew) {
      // Just clear draft
      setDraft(makeNewDraft());
      return;
    }
    if (!selectedId) return;

    const ok = window.confirm("Delete this note? This cannot be undone.");
    if (!ok) return;

    setStatus((s) => ({ ...s, deleting: true }));
    try {
      await deleteNote(selectedId);
      await refreshListAndKeepSelection(null);
    } catch (e) {
      setError(`Delete failed. ${e?.message || ""}`.trim());
    } finally {
      setStatus((s) => ({ ...s, deleting: false }));
    }
  }

  const canSave = !status.loading && !status.saving && !status.deleting;
  const canDelete = !status.loading && !status.saving && !status.deleting && !isNew && !!selectedId;

  return (
    <div className="App">
      <div className="appShell">
        <header className="topbar">
          <div className="brand">
            <div className="brandMark" aria-hidden="true" />
            <div>
              <div className="brandTitle">Notes</div>
              <div className="brandSubtitle">Lightweight notes (no auth)</div>
            </div>
          </div>

          <div className="topbarActions">
            <button className="btn btnSecondary" onClick={onClickNewNote} type="button">
              New note
            </button>
            <button className="btn" onClick={onSave} disabled={!canSave} type="button">
              {status.saving ? "Saving…" : "Save"}
            </button>
          </div>
        </header>

        <main className="layout">
          <aside className="sidebar" aria-label="Notes list">
            <div className="sidebarHeader">
              <div className="searchWrap">
                <input
                  className="input"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Search notes…"
                  aria-label="Search notes"
                />
              </div>
              <div className="sidebarMeta">
                {status.loading ? "Loading…" : `${filteredNotes.length} notes`}
              </div>
            </div>

            <div className="noteList" role="list">
              {error ? (
                <div className="callout calloutError" role="alert">
                  {error}
                </div>
              ) : null}

              {!status.loading && filteredNotes.length === 0 ? (
                <div className="emptyState">
                  <div className="emptyTitle">No notes yet</div>
                  <div className="emptyText">Create your first note to get started.</div>
                  <button className="btn btnSmall" onClick={onClickNewNote} type="button">
                    Create a note
                  </button>
                </div>
              ) : null}

              {filteredNotes.map((n) => {
                const active = !isNew && n.id === selectedId;
                return (
                  <button
                    key={n.id}
                    type="button"
                    role="listitem"
                    className={`noteRow ${active ? "active" : ""}`}
                    onClick={() => {
                      setError("");
                      setSelectedId(n.id);
                      setIsNew(false);
                    }}
                  >
                    <div className="noteRowTitle">{n.title || "Untitled"}</div>
                    <div className="noteRowPreview">{(n.content || "").slice(0, 80) || "—"}</div>
                    <div className="noteRowMeta">{formatUpdatedAt(n.updatedAt)}</div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="detail" aria-label="Note editor">
            <div className="detailHeader">
              <div className="detailTitle">
                {isNew ? "New note" : selectedNote?.title || "Untitled"}
              </div>
              <div className="detailActions">
                <button
                  className="btn btnDanger btnSmall"
                  onClick={onDelete}
                  disabled={!canDelete}
                  type="button"
                >
                  {status.deleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>

            <div className="editor">
              <label className="label" htmlFor="title">
                Title
              </label>
              <input
                id="title"
                ref={editorTitleRef}
                className="input"
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="Note title…"
              />

              <label className="label" htmlFor="content">
                Content
              </label>
              <textarea
                id="content"
                className="textarea"
                value={draft.content}
                onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
                placeholder="Write your note…"
                rows={14}
              />

              <div className="editorFooter">
                <div className="hint">
                  {process.env.REACT_APP_NODE_ENV ? (
                    <span className="pill">{process.env.REACT_APP_NODE_ENV}</span>
                  ) : null}
                  {lastUsedBasePath ? <span className="pill">API: {lastUsedBasePath}</span> : null}
                </div>
                <div className="editorButtons">
                  <button className="btn btnSecondary" onClick={onClickNewNote} type="button">
                    New
                  </button>
                  <button className="btn" onClick={onSave} disabled={!canSave} type="button">
                    Save
                  </button>
                </div>
              </div>

              <div className="finePrint">
                Backend base URL uses <code>REACT_APP_API_BASE</code> or{" "}
                <code>REACT_APP_BACKEND_URL</code>. This UI will try <code>/notes</code>,{" "}
                <code>/api/notes</code>, then <code>/v1/notes</code>.
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;
