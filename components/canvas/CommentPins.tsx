"use client";

import { useEffect, useState } from "react";

export interface DrawingComment {
  id: string;
  x: number;
  y: number;
  text: string;
  parentId: string | null;
  resolvedAt: string | null;
  createdAt: string;
  author: { id: string; name: string };
}

interface Props {
  projectId: string;
  drawingId: string;
  pageId: string;
  currentUserId: string;
  /** Konva stage transform: maps canvas coords to screen px */
  stagePos: { x: number; y: number };
  stageScale: number;
  /** Canvas container dimensions */
  containerWidth: number;
  containerHeight: number;
  /** When comment mode active and user clicks canvas, fires with canvas coords */
  pendingPin: { x: number; y: number } | null;
  onPendingPinConsumed: () => void;
}

export function CommentPins({
  projectId, drawingId, pageId, currentUserId,
  stagePos, stageScale,
  containerWidth, containerHeight,
  pendingPin, onPendingPinConsumed,
}: Props) {
  const [comments, setComments] = useState<DrawingComment[]>([]);
  const [activeRootId, setActiveRootId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // For new pin placement panel
  const [newPinDraft, setNewPinDraft] = useState<{ x: number; y: number } | null>(null);
  const [newPinText, setNewPinText] = useState("");
  // Load comments for this page
  useEffect(() => {
    fetch(`/api/projects/${projectId}/drawings/${drawingId}/pages/${pageId}/comments`)
      .then(r => r.ok ? r.json() : [])
      .then(setComments)
      .catch(() => {});
  }, [projectId, drawingId, pageId]);

  // When a new pin is placed (from DrawingCanvas in comment mode)
  useEffect(() => {
    if (pendingPin) {
      setNewPinDraft(pendingPin);
      setNewPinText("");
      setActiveRootId(null);
      onPendingPinConsumed();
    }
  }, [pendingPin, onPendingPinConsumed]);

  // Convert canvas coord to screen offset within container
  function toScreen(cx: number, cy: number) {
    return {
      x: stagePos.x + cx * stageScale,
      y: stagePos.y + cy * stageScale,
    };
  }

  async function submitNewPin() {
    if (!newPinDraft || !newPinText.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/drawings/${drawingId}/pages/${pageId}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x: newPinDraft.x, y: newPinDraft.y, text: newPinText.trim() }),
        }
      );
      if (res.ok) {
        const c = await res.json();
        setComments(prev => [...prev, c]);
        setNewPinDraft(null);
        setNewPinText("");
        setActiveRootId(c.id);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReply(rootId: string) {
    if (!replyText.trim()) return;
    const root = comments.find(c => c.id === rootId);
    if (!root) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/drawings/${drawingId}/pages/${pageId}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x: root.x, y: root.y, text: replyText.trim(), parentId: rootId }),
        }
      );
      if (res.ok) {
        const c = await res.json();
        setComments(prev => [...prev, c]);
        setReplyText("");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleResolve(comment: DrawingComment) {
    const res = await fetch(
      `/api/projects/${projectId}/drawings/${drawingId}/pages/${pageId}/comments/${comment.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved: !comment.resolvedAt }),
      }
    );
    if (res.ok) {
      const updated = await res.json();
      setComments(prev => prev.map(c => c.id === updated.id ? updated : c));
    }
  }

  async function deleteComment(id: string) {
    const res = await fetch(
      `/api/projects/${projectId}/drawings/${drawingId}/pages/${pageId}/comments/${id}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setComments(prev => prev.filter(c => c.id !== id && c.parentId !== id));
      if (activeRootId === id) setActiveRootId(null);
    }
  }

  // Root comments (no parentId) — group replies under them
  const roots = comments.filter(c => !c.parentId);
  const repliesFor = (rootId: string) => comments.filter(c => c.parentId === rootId);

  const activeRoot = activeRootId ? comments.find(c => c.id === activeRootId) : null;
  const activeReplies = activeRootId ? repliesFor(activeRootId) : [];

  return (
    <>
      {/* Pin markers */}
      {roots.map(pin => {
        const { x, y } = toScreen(pin.x, pin.y);
        const isActive = activeRootId === pin.id;
        const isResolved = !!pin.resolvedAt;
        const replyCount = repliesFor(pin.id).length;
        // Don't render pins outside the visible container
        if (x < -20 || x > containerWidth + 20 || y < -20 || y > containerHeight + 20) return null;
        return (
          <button
            key={pin.id}
            onClick={() => {
              setActiveRootId(prev => prev === pin.id ? null : pin.id);
              setNewPinDraft(null);
            }}
            style={{ left: x, top: y, transform: "translate(-50%, -100%)" }}
            className={`absolute z-30 flex flex-col items-center transition-transform ${isActive ? "scale-125" : "hover:scale-110"}`}
            title={pin.text}
          >
            <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-white text-[11px] font-bold shadow-lg
              ${isResolved ? "bg-gray-400 border-gray-300" : "bg-blue-600 border-blue-400"}
              ${isActive ? "ring-2 ring-offset-1 ring-yellow-400" : ""}`}>
              {isResolved ? "✓" : replyCount > 0 ? replyCount + 1 : "?"}
            </div>
            <div className={`w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px]
              ${isResolved ? "border-t-gray-400" : "border-t-blue-600"}`} />
          </button>
        );
      })}

      {/* New pin draft marker */}
      {newPinDraft && (() => {
        const { x, y } = toScreen(newPinDraft.x, newPinDraft.y);
        return (
          <div
            style={{ left: x, top: y, transform: "translate(-50%, -100%)" }}
            className="absolute z-30 flex flex-col items-center pointer-events-none"
          >
            <div className="w-7 h-7 rounded-full border-2 border-dashed border-amber-500 bg-amber-100 flex items-center justify-center text-amber-700 text-[11px] font-bold shadow-lg">+</div>
            <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-amber-500" />
          </div>
        );
      })()}

      {/* New pin input panel */}
      {newPinDraft && (() => {
        const { x, y } = toScreen(newPinDraft.x, newPinDraft.y);
        const panelX = Math.min(x + 12, containerWidth - 260);
        const panelY = Math.max(y - 140, 8);
        return (
          <div
            style={{ left: panelX, top: panelY }}
            className="absolute z-40 w-60 bg-white rounded-xl shadow-xl border border-gray-200 p-3 space-y-2"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-xs font-semibold text-gray-700">Add comment</p>
            <textarea
              autoFocus
              rows={3}
              value={newPinText}
              onChange={e => setNewPinText(e.target.value)}
              placeholder="Type a comment…"
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitNewPin(); } }}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setNewPinDraft(null)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">Cancel</button>
              <button
                onClick={submitNewPin}
                disabled={submitting || !newPinText.trim()}
                className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "…" : "Post"}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Thread panel */}
      {activeRoot && (() => {
        const { x, y } = toScreen(activeRoot.x, activeRoot.y);
        const panelX = Math.min(x + 12, containerWidth - 270);
        const panelY = Math.max(y - 200, 8);
        return (
          <div
            style={{ left: panelX, top: panelY }}
            className="absolute z-40 w-64 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
              <span className="text-xs font-semibold text-gray-700">
                {activeRoot.resolvedAt ? "✓ Resolved" : "Comment"}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => toggleResolve(activeRoot)}
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition
                    ${activeRoot.resolvedAt ? "bg-gray-200 text-gray-600 hover:bg-gray-300" : "bg-green-100 text-green-700 hover:bg-green-200"}`}
                >
                  {activeRoot.resolvedAt ? "Reopen" : "Resolve"}
                </button>
                <button onClick={() => setActiveRootId(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1">×</button>
              </div>
            </div>

            {/* Thread */}
            <div className="max-h-52 overflow-y-auto p-3 space-y-3">
              {/* Root comment */}
              <div className={`space-y-0.5 ${activeRoot.resolvedAt ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-blue-700">{activeRoot.author.name}</span>
                  <span className="text-[9px] text-gray-400">{new Date(activeRoot.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
                </div>
                <p className="text-xs text-gray-800 whitespace-pre-wrap">{activeRoot.text}</p>
                {activeRoot.author.id === currentUserId && (
                  <button onClick={() => deleteComment(activeRoot.id)} className="text-[9px] text-red-400 hover:text-red-600">Delete</button>
                )}
              </div>

              {/* Replies */}
              {activeReplies.map(reply => (
                <div key={reply.id} className="pl-3 border-l-2 border-gray-200 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-gray-600">{reply.author.name}</span>
                    <span className="text-[9px] text-gray-400">{new Date(reply.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
                  </div>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap">{reply.text}</p>
                  {reply.author.id === currentUserId && (
                    <button onClick={() => deleteComment(reply.id)} className="text-[9px] text-red-400 hover:text-red-600">Delete</button>
                  )}
                </div>
              ))}
            </div>

            {/* Reply input */}
            {!activeRoot.resolvedAt && (
              <div className="border-t border-gray-100 p-2 flex gap-2">
                <input
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitReply(activeRoot.id); } }}
                  placeholder="Reply…"
                  className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <button
                  onClick={() => submitReply(activeRoot.id)}
                  disabled={submitting || !replyText.trim()}
                  className="text-[11px] bg-blue-600 text-white px-2 py-1 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >→</button>
              </div>
            )}
          </div>
        );
      })()}
    </>
  );
}
