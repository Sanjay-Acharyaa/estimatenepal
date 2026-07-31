"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useConfirm } from "@/hooks/useConfirm";
import type { Discipline } from "./DrawingCanvas";
import { fmtNPRDecimal } from "@/lib/format";

type Props = {
  projectId: string;
  disciplines: Discipline[];
  activeDisciplineId: string | null;
  disciplineTotals?: Record<string, number>;
  unitErrorDisciplines?: string[];
  onSwitch: (id: string) => void;
  onCreated: (d: Discipline) => void;
  onUpdated: (d: Discipline) => void;
  onDeleted: (id: string) => void;
  onGroupsRefreshNeeded?: () => void;
};

const NRS = (n: number) => fmtNPRDecimal(n, 2);

export function EstimateTabBar({
  projectId, disciplines, activeDisciplineId, disciplineTotals = {},
  unitErrorDisciplines = [],
  onSwitch, onCreated, onUpdated, onDeleted, onGroupsRefreshNeeded,
}: Props) {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  const renameRef = useRef<HTMLInputElement>(null);
  const newNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (renamingId) renameRef.current?.focus(); }, [renamingId]);
  useEffect(() => { if (creating) newNameRef.current?.focus(); }, [creating]);

  function openMenu(e: React.MouseEvent<HTMLButtonElement>, id: string) {
    e.stopPropagation();
    if (openMenuId === id) { setOpenMenuId(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPos({ x: rect.left, y: rect.top });
    setOpenMenuId(id);
  }

  async function apiCall(url: string, method: string, body?: unknown) {
    setError("");
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d?.error?.message ?? "Request failed.");
      return null;
    }
    return res.json();
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    const d = await apiCall(`/api/projects/${projectId}/disciplines`, "POST", { name: newName.trim() });
    if (d) { onCreated(d); setCreating(false); setNewName(""); onSwitch(d.id); }
  }

  async function handleRename(id: string) {
    if (!renameValue.trim()) { setRenamingId(null); return; }
    const d = await apiCall(`/api/projects/${projectId}/disciplines/${id}`, "PUT", { name: renameValue.trim() });
    if (d) { onUpdated(d); setRenamingId(null); }
  }

  async function handleSetPrimary(id: string) {
    setOpenMenuId(null);
    const d = await apiCall(`/api/projects/${projectId}/disciplines/${id}`, "PUT", { isPrimary: true });
    if (d) onUpdated(d);
  }

  async function handleCopy(id: string) {
    setOpenMenuId(null);
    const d = await apiCall(`/api/projects/${projectId}/disciplines/${id}`, "PUT", { copy: true });
    if (d) {
      onCreated(d);
      onSwitch(d.id);
      // Refresh canvas group state — copied groups exist in DB but not in client state
      onGroupsRefreshNeeded?.();
    }
  }

  async function handleDelete(id: string, name: string, groupCount: number) {
    setOpenMenuId(null);
    const msg = groupCount > 0
      ? `Delete tab "${name}"? Its ${groupCount} layer(s) and all shapes will be permanently removed.`
      : `Delete tab "${name}"?`;
    const ok = await confirm({ title: "Delete Tab", message: msg, variant: "danger", confirmLabel: "Delete" });
    if (!ok) return;
    const result = await apiCall(`/api/projects/${projectId}/disciplines/${id}`, "DELETE");
    if (result) {
      onDeleted(id);
      const remaining = disciplines.filter(x => x.id !== id);
      if (remaining.length > 0) onSwitch(remaining[0].id);
    }
  }

  const openDiscipline = openMenuId ? disciplines.find(d => d.id === openMenuId) ?? null : null;

  return (
    <div className="flex items-stretch bg-gray-900 border-t border-gray-700 flex-shrink-0 h-[34px]">
      {confirmDialog}
      {error && (
        <div role="alert" className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-red-900 text-red-200 text-xs px-3 py-1.5 rounded shadow-lg z-50 whitespace-nowrap">
          {error}
          <button onClick={() => setError("")} aria-label="Dismiss error" className="ml-2 text-red-400 hover:text-red-200">×</button>
        </div>
      )}

      {/* Scrollable tab list */}
      <div role="tablist" aria-label="Discipline tabs" className="flex items-stretch overflow-x-auto max-w-[calc(100%-44px)]">
        {disciplines.map((d) => {
          const isActive = d.id === activeDisciplineId;
          const isRenaming = renamingId === d.id;

          return (
            <div
              key={d.id}
              className={`flex items-center flex-shrink-0 group border-r border-gray-700 ${
                isActive ? "bg-gray-700 border-t-2 border-t-blue-500" : "bg-gray-900 hover:bg-gray-800"
              }`}
            >
              {isRenaming ? (
                <input
                  ref={renameRef}
                  value={renameValue}
                  aria-label={`Rename discipline — currently ${d.name}`}
                  onChange={e => setRenameValue(e.target.value)}
                  onBlur={() => handleRename(d.id)}
                  onKeyDown={e => {
                    if (e.key === "Enter") handleRename(d.id);
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  className="w-28 px-2 py-0.5 mx-1 text-xs bg-gray-600 text-white border border-blue-500 rounded outline-none"
                />
              ) : (
                <button
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onSwitch(d.id)}
                  onDoubleClick={() => { setRenamingId(d.id); setRenameValue(d.name); }}
                  className={`px-3 h-full flex items-center gap-2 whitespace-nowrap transition ${
                    isActive ? "text-white" : "text-gray-500 hover:text-gray-200"
                  }`}
                >
                  <span className="text-xs font-medium leading-none">
                    {d.name}
                    {d.isPrimary && <span aria-hidden="true" className="ml-1 text-blue-400">★</span>}
                    {d.isPrimary && <span className="sr-only"> (primary)</span>}
                  </span>
                  {disciplineTotals[d.id] !== undefined ? (
                    <span className={`text-[10px] font-semibold leading-none ${
                      isActive ? "text-emerald-400" : "text-gray-600 group-hover:text-gray-500"
                    }`}>
                      {NRS(disciplineTotals[d.id])}
                    </span>
                  ) : null}
                  {unitErrorDisciplines.includes(d.id) && (
                    <span
                      title="One or more layers have an unrecognised unit — check the rate catalogue unit matches the takeoff unit"
                      className="text-[10px] leading-none text-yellow-400"
                      aria-label="Unit mismatch warning"
                    >
                      ⚠
                    </span>
                  )}
                </button>
              )}

              <button
                onClick={e => openMenu(e, d.id)}
                className={`px-1.5 py-2 transition ${
                  isActive
                    ? "text-gray-600 hover:text-white"
                    : "text-gray-600 hover:text-gray-300 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                }`}
                aria-label={`Options for ${d.name}`}
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {/* Add tab button — always visible, fixed 44px width */}
      {creating ? (
        <div className="flex items-center px-2 gap-1.5 border-l border-gray-700 flex-shrink-0">
          <input
            ref={newNameRef}
            value={newName}
            aria-label="New discipline name"
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") { setCreating(false); setNewName(""); }
            }}
            onBlur={() => { if (!newName.trim()) { setCreating(false); setNewName(""); } }}
            placeholder="Tab name…"
            className="w-28 px-2 py-0.5 text-xs bg-gray-700 text-white border border-blue-500 rounded outline-none"
          />
          <button onClick={handleCreate} className="text-blue-400 hover:text-blue-300 text-xs font-semibold">Add</button>
          <button onClick={() => { setCreating(false); setNewName(""); }} aria-label="Cancel new tab" className="text-gray-500 hover:text-gray-300 text-xs">✕</button>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          aria-label="New tab"
          className="w-11 flex items-center justify-center border-l border-gray-700 text-gray-600 hover:text-white hover:bg-gray-700 transition text-xl flex-shrink-0"
        >
          +
        </button>
      )}

      {/* Dropdown rendered in document.body via portal — escapes all overflow/z-index */}
      {mounted && openDiscipline && createPortal(
        <>
          <div className="fixed inset-0 z-[998]" onClick={() => setOpenMenuId(null)} />
          <div
            className="fixed z-[999] bg-white rounded-lg shadow-xl border border-gray-200 py-1 w-44 text-gray-700 text-xs"
            style={{ left: menuPos.x, top: menuPos.y, transform: "translateY(-100%) translateY(-6px)" }}
          >
            <button
              onClick={() => { setRenamingId(openDiscipline.id); setRenameValue(openDiscipline.name); setOpenMenuId(null); }}
              className="flex items-center gap-2 w-full px-3 py-2 hover:bg-gray-50"
            >
              ✏️ Rename
            </button>
            <button
              onClick={() => handleCopy(openDiscipline.id)}
              className="flex items-center gap-2 w-full px-3 py-2 hover:bg-gray-50"
            >
              📋 Copy
            </button>
            {!openDiscipline.isPrimary && (
              <button
                onClick={() => handleSetPrimary(openDiscipline.id)}
                className="flex items-center gap-2 w-full px-3 py-2 hover:bg-gray-50"
              >
                ★ Set as primary
              </button>
            )}
            <div className="border-t border-gray-100 my-1" />
            <button
              onClick={() => handleDelete(openDiscipline.id, openDiscipline.name, openDiscipline._count.groups)}
              className="flex items-center gap-2 w-full px-3 py-2 hover:bg-red-50 text-red-600"
            >
              🗑 Delete
            </button>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
