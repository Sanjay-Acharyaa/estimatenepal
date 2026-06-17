"use client";

import { useState, useEffect } from "react";

type Note = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string; email: string };
};

type Props = {
  projectId: string;
  currentUserId: string;
  isAdmin: boolean;
};

function initials(name: string) {
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
}

function timeAgo(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `Today, ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function groupByMonth(notes: Note[]): { month: string; notes: Note[] }[] {
  const map = new Map<string, Note[]>();
  for (const n of notes) {
    const key = new Date(n.createdAt).toLocaleDateString([], { year: "numeric", month: "long" });
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(n);
  }
  return Array.from(map.entries()).map(([month, notes]) => ({ month, notes }));
}

export function NotesPanel({ projectId, currentUserId, isAdmin }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/notes?limit=50`)
      .then(r => { if (!r.ok) throw new Error("fetch failed"); return r.json(); })
      .then(d => { setNotes(d.data ?? []); setTotal(d.pagination?.total ?? 0); })
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, [projectId]);

  async function addNote() {
    if (!newContent.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newContent.trim() }),
    });
    if (res.ok) {
      const n = await res.json();
      setNotes(prev => [n, ...prev]);
      setTotal(t => t + 1);
      setNewContent("");
      setAdding(false);
    }
    setSaving(false);
  }

  async function deleteNote(id: string) {
    await fetch(`/api/projects/${projectId}/notes/${id}`, { method: "DELETE" });
    setNotes(prev => prev.filter(n => n.id !== id));
    setTotal(t => t - 1);
    setMenuId(null);
  }

  async function saveEdit(id: string) {
    if (!editContent.trim()) return;
    const res = await fetch(`/api/projects/${projectId}/notes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editContent.trim() }),
    });
    if (res.ok) {
      const updated = await res.json();
      setNotes(prev => prev.map(n => n.id === id ? updated : n));
    }
    setEditId(null);
  }

  const groups = groupByMonth(notes);

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800">Notes ({total})</h3>
        <button
          onClick={() => setAdding(a => !a)}
          aria-label="Add note"
          className="w-6 h-6 rounded-full bg-blue-600 text-white text-lg flex items-center justify-center hover:bg-blue-700 leading-none"
        >
          +
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="mb-3 space-y-2">
          <label htmlFor="note-new-content" className="sr-only">Note content</label>
          <textarea
            id="note-new-content"
            autoFocus
            rows={3}
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            placeholder="Write a note visible to all project members…"
            aria-label="Note content"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <div className="flex gap-2">
            <button onClick={addNote} disabled={saving || !newContent.trim()}
              className="px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? "Saving…" : "Add Note"}
            </button>
            <button onClick={() => { setAdding(false); setNewContent(""); }}
              className="px-3 py-1 text-xs text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {fetchError && (
        <div role="alert" className="text-xs text-red-600 text-center py-4">
          Could not load notes.{" "}
          <button
            onClick={() => {
              setFetchError(false);
              setLoading(true);
              fetch(`/api/projects/${projectId}/notes?limit=50`)
                .then(r => { if (!r.ok) throw new Error(); return r.json(); })
                .then(d => { setNotes(d.data ?? []); setTotal(d.pagination?.total ?? 0); })
                .catch(() => setFetchError(true))
                .finally(() => setLoading(false));
            }}
            className="underline hover:no-underline"
          >Try again</button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-4" aria-label="Loading notes">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" aria-hidden />
          <p className="text-xs text-gray-600">Loading…</p>
        </div>
      )}

      {!loading && !fetchError && notes.length === 0 && (
        <div className="text-center py-6">
          <p className="text-xs text-gray-600">No notes yet.</p>
          <button onClick={() => setAdding(true)} className="text-xs text-blue-600 hover:underline mt-1">
            Add the first note
          </button>
        </div>
      )}

      {/* Note groups */}
      {groups.map(({ month, notes: gNotes }) => (
        <div key={month} className="mb-4">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">{month}</p>
          <div className="space-y-3">
            {gNotes.map(note => (
              <div key={note.id} className="relative">
                <div className="flex items-start gap-2">
                  {/* Avatar */}
                  <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center flex-shrink-0 font-semibold">
                    {initials(note.user.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-semibold text-gray-800">{note.user.name}</span>
                      <span className="text-xs text-gray-600">{timeAgo(note.createdAt)}</span>
                    </div>
                    {editId === note.id ? (
                      <div className="space-y-1.5">
                        <label htmlFor={`note-edit-${note.id}`} className="sr-only">Edit note content</label>
                        <textarea id={`note-edit-${note.id}`} rows={2} value={editContent} onChange={e => setEditContent(e.target.value)}
                          autoFocus aria-label="Edit note content"
                          className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                        <div className="flex gap-1.5">
                          <button onClick={() => saveEdit(note.id)}
                            className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
                          <button onClick={() => setEditId(null)}
                            className="px-2 py-0.5 text-xs border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{note.content}</p>
                    )}
                  </div>

                  {/* ⋮ menu */}
                  {(note.user.id === currentUserId || isAdmin) && editId !== note.id && (
                    <div className="relative flex-shrink-0">
                      <button
                        onClick={() => setMenuId(menuId === note.id ? null : note.id)}
                        aria-label={`Note options for ${note.user.name}`}
                        className="text-gray-600 hover:text-gray-600 text-base leading-none px-1"
                      >⋮</button>
                      {menuId === note.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />
                          <div className="absolute right-0 top-5 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-32 text-xs">
                            {note.user.id === currentUserId && (
                              <button onClick={() => { setEditId(note.id); setEditContent(note.content); setMenuId(null); }}
                                className="flex items-center gap-1.5 w-full px-3 py-1.5 hover:bg-gray-50">
                                ✏️ Edit
                              </button>
                            )}
                            <button onClick={() => deleteNote(note.id)}
                              className="flex items-center gap-1.5 w-full px-3 py-1.5 hover:bg-red-50 text-red-600">
                              🗑 Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
