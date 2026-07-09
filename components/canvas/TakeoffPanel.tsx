"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { TakeoffGroupDialog, TOOL_TYPES, COUNT_SHAPES } from "./TakeoffGroupDialog";
import { TakeoffGroupDetail } from "./TakeoffGroupDetail";
import { CopyGroupDialog } from "./CopyGroupDialog";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/useConfirm";
import { CatalogBrowser } from "@/components/rates/CatalogBrowser";
import { AssemblyLibraryModal } from "@/components/assemblies/AssemblyLibraryModal";
import type { Discipline } from "./DrawingCanvas";

export type TakeoffGroup = {
  id: string;
  name: string;
  type: string;
  colour: string;
  lineWidth: number;
  isLocked: boolean;
  isVisible: boolean;
  tag: string | null;
  preamble: string | null;
  rateItemId: string | null;
  rateItem?: { code: string; source: string } | null;
  multiplier: number;
  additionalParams: Record<string, unknown> | null;
  parentId: string | null;
  disciplineId: string | null;
  sortOrder: number;
  assemblyId: string | null;
  assembly?: { id: string; name: string } | null;
  _count: { items: number };
};

type Props = {
  projectId: string;
  initialGroups: TakeoffGroup[];
  allDrawings: { id: string; fileName: string }[];
  disciplines: Discipline[];
  selectedGroupId: string | null;
  activeDisciplineId: string | null;
  onSelectGroup: (id: string | null) => void;
  onGroupsChange: (groups: TakeoffGroup[]) => void;
  groupTotals?: Record<string, { rawQty: number; unit: string }>;
  liveItemCounts?: Record<string, number>;
  allPageGroupTotals?: Record<string, { rawQty: number; unit: string; count: number }>;
  sidebarWidth?: number;
  onRefreshItems?: () => void;
  onItemsAppended?: (items: unknown[]) => void;
};

const TYPE_ICONS: Record<string, string> = {
  LINEAR: "↔", AREA: "▭", VERTICAL_WALL_AREA: "▤",
  COUNT: "●", COUNT_BY_DISTANCE: "⋯", VOLUME: "▬",
};

function getNum(v: unknown) { const n = Number(v); return isNaN(n) ? 0 : n; }

function volumeDisplay(group: TakeoffGroup, rawQty: number): { qty: number; unit: string } {
  const ap = group.additionalParams as Record<string, unknown> | null;
  const method = (ap?.volumeMethod as string) ?? "area_x_h";
  const hObj = ap?.height as Record<string, unknown> | undefined;
  const h = (getNum(hObj?.ft)) + getNum(hObj?.in) / 12;

  if (method === "lbh") {
    const bObj = ap?.breadth as Record<string, unknown> | undefined;
    const b = getNum(bObj?.ft) + getNum(bObj?.in) / 12;
    if (!b || !h) return { qty: rawQty * group.multiplier, unit: "(set b+h)" };
    return { qty: rawQty * b * h * group.multiplier, unit: "cu ft" };
  }
  if (!h) return { qty: rawQty * group.multiplier, unit: "(set height)" };
  return { qty: rawQty * h * group.multiplier, unit: "cu ft" };
}

function countByDistanceDisplay(group: TakeoffGroup, rawLengthFt: number): { qty: number; unit: string } {
  const ap = group.additionalParams as Record<string, unknown> | null;
  const spObj = ap?.spacing as Record<string, unknown> | undefined;
  const spacing = spObj ? getNum(spObj.ft) + getNum(spObj.in) / 12 : 0;
  if (!spacing) return { qty: rawLengthFt * group.multiplier, unit: "ft (set spacing)" };
  return { qty: (Math.floor(rawLengthFt / spacing) + 1) * group.multiplier, unit: "each" };
}

function wallAreaDisplay(group: TakeoffGroup, rawPerimFt: number): { qty: number; unit: string } {
  const ap = group.additionalParams as Record<string, unknown> | null;
  const wObj = ap?.wall as Record<string, unknown> | undefined;
  const wallH = wObj ? getNum(wObj.heightFt) + getNum(wObj.heightIn) / 12 : 0;
  if (!wallH) return { qty: rawPerimFt * group.multiplier, unit: "ft (set wall height)" };
  return { qty: rawPerimFt * wallH * group.multiplier, unit: "sq ft" };
}

function EyeOpen() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}
function EyeClosed() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 10 14">
      <circle cx="3" cy="2" r="1.1" />
      <circle cx="3" cy="6" r="1.1" />
      <circle cx="3" cy="10" r="1.1" />
      <circle cx="7" cy="2" r="1.1" />
      <circle cx="7" cy="6" r="1.1" />
      <circle cx="7" cy="10" r="1.1" />
    </svg>
  );
}

export function TakeoffPanel({
  projectId, initialGroups, allDrawings, disciplines,
  selectedGroupId, activeDisciplineId, onSelectGroup, onGroupsChange,
  groupTotals = {}, liveItemCounts = {}, allPageGroupTotals = {}, sidebarWidth = 224, onRefreshItems, onItemsAppended,
}: Props) {
  const [groups, setGroups] = useState<TakeoffGroup[]>(initialGroups);
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingLayerIn, setCreatingLayerIn] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<TakeoffGroup | null>(null);
  const [detailGroup, setDetailGroup] = useState<TakeoffGroup | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number; flipUp: boolean } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [panelError, setPanelError] = useState("");
  const [copyTarget, setCopyTarget] = useState<{ group: TakeoffGroup; isCategory: boolean; childLayerCount: number } | null>(null);
  const [changeCatalogId, setChangeCatalogId] = useState<string | null>(null);
  const { confirm: confirmDialog_, dialog: confirmDialogEl } = useConfirm();
  const [showAssemblyModal, setShowAssemblyModal] = useState(false);
  const [showSaveAssembly, setShowSaveAssembly] = useState(false);
  const [saveAssemblyForm, setSaveAssemblyForm] = useState({ name: "", description: "", category: "" });
  const [saveAssemblySaving, setSaveAssemblySaving] = useState(false);
  const [selectedForSave, setSelectedForSave] = useState<Set<string>>(new Set());
  const listScrollRef = useRef<HTMLDivElement>(null);
  const layerRowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => { setMounted(true); }, []);

  function openMenu(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (openMenuId === id) { setOpenMenuId(null); setMenuAnchor(null); return; }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const flipUp = rect.bottom + 220 > window.innerHeight;
    setMenuAnchor({ x: rect.right, y: flipUp ? rect.top : rect.bottom, flipUp });
    setOpenMenuId(id);
  }

  function closeMenu() { setOpenMenuId(null); setMenuAnchor(null); }

  // ─── Drag-and-drop reorder state ────────────────────────────────────────────
  const [dragState, setDragState] = useState<{ id: string; type: "cat" | "layer"; parentId: string | null } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; pos: "before" | "after" } | null>(null);
  const dragNodeRefs = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    const ids = groups.filter(g => !g.parentId).map(g => g.id);
    setExpandedIds(new Set(ids));
  }, []); // eslint-disable-line

  // When a canvas shape is selected, auto-expand its parent category and scroll to the layer row
  useEffect(() => {
    if (!selectedGroupId) return;
    const layer = groups.find(g => g.id === selectedGroupId);
    if (!layer?.parentId) return;
    setExpandedIds(prev => { const n = new Set(prev); n.add(layer.parentId!); return n; });
    requestAnimationFrame(() => {
      const el = layerRowRefs.current.get(selectedGroupId);
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, [selectedGroupId]); // eslint-disable-line


  function updateGroups(next: TakeoffGroup[]) { setGroups(next); onGroupsChange(next); }

  async function apiCall(fn: () => Promise<Response>, onOk: (r: Response) => Promise<void>) {
    setPanelError("");
    try {
      const res = await fn();
      if (res.ok) { await onOk(res); }
      else { const d = await res.json().catch(() => ({})); setPanelError(d?.error?.message ?? "Request failed."); }
    } catch { setPanelError("Network error."); }
  }

  async function handleCreateCategory() {
    if (!newCategoryName.trim()) return;
    await apiCall(
      () => fetch(`/api/projects/${projectId}/takeoff-groups`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName.trim(), disciplineId: activeDisciplineId }),
      }),
      async (res) => {
        const created = await res.json();
        updateGroups([...groups, created]);
        setExpandedIds(prev => { const n = new Set(prev); n.add(created.id); return n; });
        setShowCreateCategory(false); setNewCategoryName("");
      }
    );
  }

  async function handleCreateLayer(data: { name: string; type: string; colour: string; lineWidth: number; tag?: string; multiplier: number; rateItemId?: string | null }, parentId: string) {
    await apiCall(
      () => fetch(`/api/projects/${projectId}/takeoff-groups`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, parentId, disciplineId: activeDisciplineId }),
      }),
      async (res) => { const created = await res.json(); updateGroups([...groups, created]); setCreatingLayerIn(null); }
    );
  }

  async function handleChangeCatalog(groupId: string, rateItemId: string | null, rateItem?: { code: string; source: string } | null) {
    await apiCall(
      () => fetch(`/api/projects/${projectId}/takeoff-groups/${groupId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rateItemId }),
      }),
      async () => { updateGroups(groups.map(g => g.id === groupId ? { ...g, rateItemId, rateItem: rateItem ?? null } : g)); }
    );
  }

  async function handleEdit(data: { name: string; type: string; colour: string; lineWidth: number; tag?: string; multiplier: number }) {
    if (!editingGroup) return;
    await apiCall(
      () => fetch(`/api/projects/${projectId}/takeoff-groups/${editingGroup.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      }),
      async (res) => {
        const u = await res.json();
        updateGroups(groups.map(g => g.id === u.id ? { ...g, ...u } : g));
        setEditingGroup(null);
      }
    );
  }

  async function toggleVisibility(g: TakeoffGroup, e: React.MouseEvent) {
    e.stopPropagation();
    await apiCall(
      () => fetch(`/api/projects/${projectId}/takeoff-groups/${g.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isVisible: !g.isVisible }),
      }),
      async () => { updateGroups(groups.map(x => x.id === g.id ? { ...x, isVisible: !g.isVisible } : x)); }
    );
  }

  async function toggleLock(g: TakeoffGroup, e: React.MouseEvent) {
    e.stopPropagation();
    await apiCall(
      () => fetch(`/api/projects/${projectId}/takeoff-groups/${g.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isLocked: !g.isLocked }),
      }),
      async () => { updateGroups(groups.map(x => x.id === g.id ? { ...x, isLocked: !g.isLocked } : x)); }
    );
  }

  function handleCopied(result: { category?: TakeoffGroup; layers?: TakeoffGroup[]; layer?: TakeoffGroup; targetParentId?: string | null; copiedItems?: unknown[] }, withObjects: boolean) {
    setCopyTarget(null);
    const toAdd: TakeoffGroup[] = [];
    if (result.category) toAdd.push({ ...result.category as TakeoffGroup });
    if (result.layers) result.layers.forEach(l => toAdd.push({ ...l as TakeoffGroup }));
    if (result.layer) toAdd.push({ ...result.layer as TakeoffGroup });
    if (toAdd.length > 0) {
      updateGroups([...groups, ...toAdd]);
      if (result.category) {
        setExpandedIds(prev => { const n = new Set(prev); n.add((result.category as TakeoffGroup).id); return n; });
      }
      if (result.layer && result.targetParentId) {
        setExpandedIds(prev => { const n = new Set(prev); n.add(result.targetParentId as string); return n; });
      }
      setTimeout(() => {
        listScrollRef.current?.scrollTo({ top: listScrollRef.current.scrollHeight, behavior: "smooth" });
      }, 50);
    }
    // Append copied items directly to canvas state (no fetch needed)
    if (withObjects && result.copiedItems && result.copiedItems.length > 0) {
      onItemsAppended?.(result.copiedItems);
    }
    // Always refresh totals so the sidebar counts update
    if (withObjects) onRefreshItems?.();
  }

  async function handleDelete(g: TakeoffGroup) {
    const childLayers = groups.filter(x => x.parentId === g.id);
    const totalItems = childLayers.reduce((s, l) => s + l._count.items, g._count.items);
    const msg = childLayers.length > 0
      ? `Delete group "${g.name}"? Its ${childLayers.length} layer(s) and all ${totalItems} shape(s) will be removed.`
      : `Delete "${g.name}"? All ${g._count.items} shape(s) will be removed.`;
    const ok = await confirmDialog_({ title: "Delete Group", message: msg, variant: "danger", confirmLabel: "Delete" });
    if (!ok) return;
    await apiCall(
      () => fetch(`/api/projects/${projectId}/takeoff-groups/${g.id}`, { method: "DELETE" }),
      async () => {
        updateGroups(groups.filter(x => x.id !== g.id && x.parentId !== g.id));
        setOpenMenuId(null);
        if (selectedGroupId === g.id || childLayers.some(l => l.id === selectedGroupId)) onSelectGroup(null);
      }
    );
  }

  // ─── Drag-and-drop helpers ───────────────────────────────────────────────────

  function getDragInsertPos(e: React.DragEvent, id: string): "before" | "after" {
    const el = dragNodeRefs.current.get(id);
    if (!el) return "after";
    const rect = el.getBoundingClientRect();
    return e.clientY < rect.top + rect.height / 2 ? "before" : "after";
  }

  function reorderList(list: TakeoffGroup[], fromId: string, toId: string, pos: "before" | "after"): TakeoffGroup[] {
    const fromIdx = list.findIndex(x => x.id === fromId);
    const toIdx = list.findIndex(x => x.id === toId);
    if (fromIdx === -1 || toIdx === -1) return list;
    const result = [...list];
    const [moved] = result.splice(fromIdx, 1);
    const insertAt = result.findIndex(x => x.id === toId);
    result.splice(pos === "before" ? insertAt : insertAt + 1, 0, moved);
    return result;
  }

  async function persistReorder(items: TakeoffGroup[]) {
    await Promise.all(
      items.map((g, i) =>
        fetch(`/api/projects/${projectId}/takeoff-groups/${g.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: i }),
        })
      )
    ).catch(() => setPanelError("Failed to save order."));
  }

  function handleCategoryDrop(targetId: string) {
    if (!dragState || dragState.type !== "cat" || dragState.id === targetId || !dropTarget) return;
    const reordered = reorderList(categories, dragState.id, targetId, dropTarget.pos);
    const updated = reordered.map((c, i) => ({ ...c, sortOrder: i }));
    updateGroups(groups.map(g => { const u = updated.find(u => u.id === g.id); return u ? { ...g, sortOrder: u.sortOrder } : g; }));
    setDragState(null); setDropTarget(null);
    void persistReorder(updated);
  }

  function handleLayerDrop(targetId: string) {
    if (!dragState || dragState.type !== "layer" || dragState.id === targetId || !dropTarget) return;
    const targetLayer = groups.find(g => g.id === targetId);
    if (!targetLayer || targetLayer.parentId !== dragState.parentId) return;
    const siblings = layersByParent[dragState.parentId ?? ""] ?? [];
    const reordered = reorderList(siblings, dragState.id, targetId, dropTarget.pos);
    const updated = reordered.map((l, i) => ({ ...l, sortOrder: i }));
    updateGroups(groups.map(g => { const u = updated.find(u => u.id === g.id); return u ? { ...g, sortOrder: u.sortOrder } : g; }));
    setDragState(null); setDropTarget(null);
    void persistReorder(updated);
  }

  function startDrag(e: React.DragEvent, id: string, type: "cat" | "layer", parentId: string | null) {
    const t = e.target as HTMLElement;
    if (t.closest("button, input, a")) { e.preventDefault(); return; }
    setDragState({ id, type, parentId });
    e.dataTransfer.effectAllowed = "move";
  }

  function onCatDragOver(e: React.DragEvent, id: string) {
    if (!dragState || dragState.type !== "cat") return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const pos = getDragInsertPos(e, id);
    if (dropTarget?.id !== id || dropTarget.pos !== pos) setDropTarget({ id, pos });
  }

  function onLayerDragOver(e: React.DragEvent, id: string, parentId: string | null) {
    if (!dragState || dragState.type !== "layer" || dragState.parentId !== parentId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const pos = getDragInsertPos(e, id);
    if (dropTarget?.id !== id || dropTarget.pos !== pos) setDropTarget({ id, pos });
  }

  function dropIndicator(id: string) {
    if (dropTarget?.id !== id) return "";
    return dropTarget.pos === "before" ? " border-t-2 border-t-blue-400" : " border-b-2 border-b-blue-400";
  }

  // ─── Derived lists ────────────────────────────────────────────────────────────
  const categories = groups
    .filter(g => !g.parentId && g.disciplineId === activeDisciplineId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const layersByParent: Record<string, TakeoffGroup[]> = {};
  groups.filter(g => g.parentId).forEach(g => {
    if (!layersByParent[g.parentId!]) layersByParent[g.parentId!] = [];
    layersByParent[g.parentId!].push(g);
  });
  // Sort layers within each category
  Object.keys(layersByParent).forEach(pid => {
    layersByParent[pid].sort((a, b) => a.sortOrder - b.sortOrder);
  });

  const q = search.toLowerCase();
  const filtered = categories.filter(c =>
    !q || c.name.toLowerCase().includes(q) ||
    (layersByParent[c.id] || []).some(l => l.name.toLowerCase().includes(q))
  );

  return (
    <div className="flex flex-col h-full text-sm relative">
      {confirmDialogEl}
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <span className="text-xs font-semibold text-gray-600 uppercase">Takeoffs ({categories.length})</span>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowAssemblyModal(true)}
            className="text-xs text-indigo-400 hover:text-indigo-200 px-1.5 py-0.5 rounded border border-indigo-700/50 hover:border-indigo-500 transition"
            aria-label="Apply assembly template">
            🏗️
          </button>
          <button onClick={() => setShowSaveAssembly(true)}
            className="text-xs text-gray-600 hover:text-green-300 px-1.5 py-0.5 rounded border border-gray-700 hover:border-green-700 transition"
            aria-label="Save groups as assembly">
            💾
          </button>
          <button onClick={() => setShowCreateCategory(true)}
            className="text-gray-600 hover:text-white text-lg leading-none transition" aria-label="New group">
            +
          </button>
        </div>
      </div>

      {panelError && (
        <div role="alert" className="mx-3 mt-2 px-2 py-1.5 bg-red-900/60 border border-red-700 text-red-300 text-xs rounded flex items-start justify-between gap-1">
          <span>{panelError}</span>
          <button onClick={() => setPanelError("")} aria-label="Dismiss error" className="flex-shrink-0 text-red-400 hover:text-red-200">×</button>
        </div>
      )}

      {/* Create group inline */}
      {showCreateCategory && (
        <div className="px-3 py-2 bg-gray-700/40 border-b border-gray-700">
          <label htmlFor="new-group-name" className="sr-only">Group name</label>
          <input
            id="new-group-name"
            type="text" autoFocus value={newCategoryName}
            onChange={e => setNewCategoryName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleCreateCategory(); if (e.key === "Escape") { setShowCreateCategory(false); setNewCategoryName(""); } }}
            placeholder="Group name…"
            className="w-full bg-gray-600 text-gray-100 placeholder-gray-400 text-xs rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 mb-1.5"
          />
          <div className="flex gap-1.5">
            <button onClick={handleCreateCategory} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs py-1 rounded transition">Create</button>
            <button onClick={() => { setShowCreateCategory(false); setNewCategoryName(""); }} className="px-3 text-xs text-gray-600 border border-gray-600 rounded hover:bg-gray-700">Cancel</button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="px-3 py-2 border-b border-gray-700">
        <label htmlFor="takeoff-search" className="sr-only">Search layers</label>
        <input
          id="takeoff-search"
          type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
          className="w-full bg-gray-700 text-gray-200 placeholder-gray-500 text-xs rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* List */}
      <div ref={listScrollRef} className="flex-1 overflow-y-auto pb-16 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-track]:bg-transparent">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-xs">
            No groups yet.{" "}
            <button onClick={() => setShowCreateCategory(true)} className="text-blue-400 hover:underline">Create one</button>
          </div>
        ) : (
          filtered.map(cat => {
            const layers = (layersByParent[cat.id] || []).filter(l => !q || l.name.toLowerCase().includes(q));
            const isExpanded = expandedIds.has(cat.id);
            const totalItems = layers.reduce((s, l) => s + l._count.items, 0);
            const isCatDragging = dragState?.id === cat.id;

            return (
              <div key={cat.id}>
                {/* ── Category row ── */}
                <div
                  ref={el => {
                    if (el) { dragNodeRefs.current.set(cat.id, el); }
                    else { dragNodeRefs.current.delete(cat.id); }
                  }}
                  draggable={!search}
                  onDragStart={e => startDrag(e, cat.id, "cat", null)}
                  onDragOver={e => onCatDragOver(e, cat.id)}
                  onDrop={e => { e.preventDefault(); handleCategoryDrop(cat.id); }}
                  onDragEnd={() => { setDragState(null); setDropTarget(null); }}
                  onClick={() => setExpandedIds(prev => { const n = new Set(prev); n.has(cat.id) ? n.delete(cat.id) : n.add(cat.id); return n; })}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpandedIds(prev => { const n = new Set(prev); n.has(cat.id) ? n.delete(cat.id) : n.add(cat.id); return n; }); } }}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  aria-label={`${cat.name} group, ${layers.length} layers`}
                  className={`flex items-center gap-1.5 px-2 py-2 border-b border-gray-700/50 cursor-pointer hover:bg-gray-700/30 focus:outline-none focus:ring-1 focus:ring-blue-500 group/cat${isCatDragging ? " opacity-40" : ""}${dropIndicator(cat.id)}`}
                >
                  {/* Drag handle */}
                  <span aria-hidden="true" className="text-gray-600 opacity-0 group-hover/cat:opacity-100 cursor-grab flex-shrink-0 select-none" title="Drag to reorder">
                    <GripIcon />
                  </span>

                  <span aria-hidden="true" className="text-gray-500 text-xs w-3 flex-shrink-0 select-none">{isExpanded ? "▼" : "▶"}</span>

                  <button
                    onClick={e => toggleVisibility(cat, e)}
                    aria-label={cat.isVisible ? `Hide ${cat.name}` : `Show ${cat.name}`}
                    aria-pressed={cat.isVisible}
                    className={`flex-shrink-0 w-4 h-4 flex items-center justify-center ${cat.isVisible ? "text-gray-600 hover:text-white" : "text-gray-600"}`}>
                    {cat.isVisible ? <EyeOpen /> : <EyeClosed />}
                  </button>

                  <span className="flex-1 text-xs font-semibold text-gray-200 truncate">{cat.name}</span>
                  <span className="text-xs text-gray-600 flex-shrink-0">{totalItems}</span>

                  {/* Add layer */}
                  <button onClick={e => { e.stopPropagation(); setCreatingLayerIn(cat.id); }}
                    className="flex-shrink-0 opacity-0 group-hover/cat:opacity-100 focus-visible:opacity-100 w-5 h-5 flex items-center justify-center text-gray-500 hover:text-blue-400 rounded hover:bg-gray-700 transition text-xs"
                    aria-label={`Add layer to ${cat.name}`}>+</button>

                  {/* 3-dot */}
                  <button onClick={e => openMenu(e, cat.id)}
                    aria-label={`Options for ${cat.name}`}
                    className="opacity-0 group-hover/cat:opacity-100 focus-visible:opacity-100 w-5 h-5 flex items-center justify-center text-gray-600 hover:text-gray-300 transition flex-shrink-0">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                    </svg>
                  </button>
                </div>

                {/* ── Layer rows ── */}
                {isExpanded && (
                  <>
                    {layers.map(layer => {
                      const isLayerDragging = dragState?.id === layer.id;
                      return (
                        <div
                          key={layer.id}
                          ref={el => {
                            if (el) { layerRowRefs.current.set(layer.id, el); dragNodeRefs.current.set(layer.id, el); }
                            else { layerRowRefs.current.delete(layer.id); dragNodeRefs.current.delete(layer.id); }
                          }}
                          draggable={!search}
                          onDragStart={e => startDrag(e, layer.id, "layer", layer.parentId)}
                          onDragOver={e => onLayerDragOver(e, layer.id, layer.parentId)}
                          onDrop={e => { e.preventDefault(); handleLayerDrop(layer.id); }}
                          onDragEnd={() => { setDragState(null); setDropTarget(null); }}
                          onClick={() => onSelectGroup(selectedGroupId === layer.id ? null : layer.id)}
                          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectGroup(selectedGroupId === layer.id ? null : layer.id); } }}
                          role="button"
                          tabIndex={0}
                          aria-pressed={selectedGroupId === layer.id}
                          aria-label={`Select layer ${layer.name}`}
                          className={`flex items-center gap-1.5 pl-3 pr-2 py-1.5 cursor-pointer border-b border-gray-700/30 transition focus:outline-none focus:ring-1 focus:ring-blue-500 group/layer${selectedGroupId === layer.id ? " bg-blue-900/40 border-l-2 border-l-blue-500" : " hover:bg-gray-700/30"}${isLayerDragging ? " opacity-40" : ""}${dropIndicator(layer.id)}`}
                        >
                          {/* Drag handle */}
                          <span aria-hidden="true" className="text-gray-600 opacity-0 group-hover/layer:opacity-100 cursor-grab flex-shrink-0 select-none" title="Drag to reorder">
                            <GripIcon />
                          </span>

                          <button
                            onClick={e => toggleVisibility(layer, e)}
                            aria-label={layer.isVisible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                            aria-pressed={layer.isVisible}
                            className={`flex-shrink-0 w-4 h-4 flex items-center justify-center ${layer.isVisible ? "text-gray-600 hover:text-white" : "text-gray-600"}`}>
                            {layer.isVisible ? <EyeOpen /> : <EyeClosed />}
                          </button>

                          <span aria-hidden="true" className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: layer.colour }} />
                          {(layer.type === "COUNT" || layer.type === "COUNT_BY_DISTANCE") ? (() => {
                            const shapeName = (layer.additionalParams as any)?.countShape ?? "circle";
                            const shape = COUNT_SHAPES.find(s => s.value === shapeName) ?? COUNT_SHAPES[0];
                            return (
                              <span
                                aria-hidden="true"
                                className="text-xs flex-shrink-0 leading-none"
                                style={{ color: layer.colour }}
                              >
                                {shape.label}
                              </span>
                            );
                          })() : (
                            <span aria-hidden="true" className="text-gray-500 text-xs flex-shrink-0">{TYPE_ICONS[layer.type] ?? "○"}</span>
                          )}

                          <div className="flex-1 min-w-0">
                            <p className={`text-xs truncate ${layer.isVisible ? "text-gray-200" : "text-gray-500 line-through"}`}>{layer.name}</p>
                            {layer.rateItemId && (
                              <p className="flex items-center gap-1 text-xs truncate" title="Catalog item linked">
                                <span className="text-gray-500 flex-shrink-0">📎</span>
                                {layer.rateItem ? (
                                  <>
                                    <span className="font-mono text-blue-400 font-semibold flex-shrink-0">{layer.rateItem.code}</span>
                                    <span className={`text-[10px] px-1 py-0.5 rounded flex-shrink-0 ${
                                      layer.rateItem.source === "DUDBC" ? "bg-green-900/40 text-green-400" :
                                      layer.rateItem.source === "DISTRICT" ? "bg-yellow-900/40 text-yellow-400" :
                                      "bg-blue-900/40 text-blue-400"
                                    }`}>{layer.rateItem.source}</span>
                                  </>
                                ) : (
                                  <span className="text-green-400 text-xs">linked</span>
                                )}
                              </p>
                            )}
                            {allPageGroupTotals[layer.id] ? (() => {
                              const raw = allPageGroupTotals[layer.id].rawQty;
                              const { qty, unit } = layer.type === "VOLUME"
                                ? volumeDisplay(layer, raw)
                                : layer.type === "COUNT_BY_DISTANCE"
                                ? countByDistanceDisplay(layer, raw)
                                : layer.type === "VERTICAL_WALL_AREA"
                                ? wallAreaDisplay(layer, raw)
                                : { qty: raw * layer.multiplier, unit: allPageGroupTotals[layer.id].unit.replace(" (set spacing)", "").replace(" (set height)", "").replace(" (set breadth+height)", "").replace(" (set wall height)", "") };
                              return (
                                <p className="text-xs text-blue-400 font-medium truncate" title="All pages total">
                                  {unit === "each" ? Math.round(qty) : qty.toFixed(2)} {unit}
                                  {layer.multiplier !== 1 && <span className="text-gray-500 font-normal"> ×{layer.multiplier}</span>}
                                </p>
                              );
                            })() : layer.tag ? (
                              <p className="text-xs text-gray-500 truncate">{layer.tag}</p>
                            ) : null}
                          </div>

                          <span className="text-xs text-gray-600 flex-shrink-0" title="shapes drawn (all pages)">
                            {allPageGroupTotals[layer.id]?.count ?? liveItemCounts[layer.id] ?? layer._count.items}
                          </span>

                          <button onClick={e => toggleLock(layer, e)}
                            aria-label={layer.isLocked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
                            aria-pressed={layer.isLocked}
                            className={`flex-shrink-0 transition ${layer.isLocked ? "text-red-400" : "text-gray-600 hover:text-gray-600"}`}>
                            {layer.isLocked ? (
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                              </svg>
                            ) : (
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                              </svg>
                            )}
                          </button>

                          <button onClick={e => openMenu(e, layer.id)}
                            aria-label={`Options for ${layer.name}`}
                            className="opacity-0 group-hover/layer:opacity-100 focus-visible:opacity-100 w-4 h-4 flex items-center justify-center text-gray-600 hover:text-gray-300 transition flex-shrink-0">
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                            </svg>
                          </button>
                        </div>
                      );
                    })}

                    {layers.length === 0 && (
                      <div className="pl-5 pr-2 py-2 text-xs text-gray-600 italic border-b border-gray-700/30">
                        No layers.{" "}
                        <button onClick={() => setCreatingLayerIn(cat.id)} className="text-blue-400 hover:underline not-italic">Add one</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Dialogs */}
      {creatingLayerIn && (
        <TakeoffGroupDialog
          title="New Takeoff Layer"
          onSave={data => handleCreateLayer(data, creatingLayerIn)}
          onCancel={() => setCreatingLayerIn(null)}
        />
      )}

      {editingGroup && (
        <TakeoffGroupDialog
          title={editingGroup.parentId ? "Edit Layer" : "Rename Group"}
          initial={{
            name: editingGroup.name,
            type: editingGroup.type as (typeof TOOL_TYPES)[number]["value"],
            colour: editingGroup.colour,
            lineWidth: editingGroup.lineWidth,
            tag: editingGroup.tag ?? undefined,
            multiplier: editingGroup.multiplier,
          }}
          onSave={handleEdit}
          onCancel={() => setEditingGroup(null)}
        />
      )}

      {detailGroup && (
        <TakeoffGroupDetail
          group={detailGroup}
          projectId={projectId}
          allDrawings={allDrawings}
          refreshKey={liveItemCounts?.[detailGroup.id] ?? 0}
          thisPageTotal={groupTotals?.[detailGroup.id]}
          sidebarWidth={sidebarWidth}
          onClose={() => setDetailGroup(null)}
          onGroupUpdated={updated => {
            updateGroups(groups.map(g => g.id === updated.id ? { ...g, ...updated } : g));
            setDetailGroup(null);
          }}
        />
      )}

      {copyTarget && (
        <CopyGroupDialog
          group={copyTarget.group}
          isCategory={copyTarget.isCategory}
          childLayerCount={copyTarget.childLayerCount}
          disciplines={disciplines}
          activeDisciplineId={activeDisciplineId}
          projectId={projectId}
          groups={groups}
          onCopied={(result, withObjects) => handleCopied(result, withObjects)}
          onCancel={() => setCopyTarget(null)}
        />
      )}

      {changeCatalogId && (
        <CatalogBrowser
          onSelect={item => { handleChangeCatalog(changeCatalogId, item.id, { code: item.code, source: item.source }); setChangeCatalogId(null); }}
          onClose={() => setChangeCatalogId(null)}
        />
      )}

      {/* Assembly Library Modal */}
      {showAssemblyModal && activeDisciplineId && (
        <AssemblyLibraryModal
          projectId={projectId}
          disciplines={disciplines}
          activeDisciplineId={activeDisciplineId}
          onClose={() => setShowAssemblyModal(false)}
          onApplied={() => {
            setShowAssemblyModal(false);
            // Reload all groups for this discipline so canvas sees new layers instantly
            fetch(`/api/projects/${projectId}/takeoff-groups?disciplineId=${activeDisciplineId}&limit=200`)
              .then(r => r.json())
              .then(d => { if (Array.isArray(d)) updateGroups(d); })
              .catch(() => {});
            // Reload canvas shapes + totals
            onRefreshItems?.();
          }}
        />
      )}

      {/* Save as Assembly Modal */}
      {showSaveAssembly && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-assembly-title"
          onKeyDown={e => { if (e.key === "Escape") setShowSaveAssembly(false); }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 id="save-assembly-title" className="font-semibold text-gray-800 mb-1">Save as Assembly</h3>
            <p className="text-xs text-gray-600 mb-4">Saves selected category groups as a reusable template in your organisation library.</p>
            <div className="space-y-3">
              <div>
                <label htmlFor="tp-assembly-name" className="block text-xs text-gray-700 mb-1">Assembly Name</label>
                <input id="tp-assembly-name" required value={saveAssemblyForm.name} onChange={e => setSaveAssemblyForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Standard RCC Frame" autoFocus className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="tp-assembly-category" className="block text-xs text-gray-700 mb-1">Category (optional)</label>
                  <select id="tp-assembly-category" value={saveAssemblyForm.category} onChange={e => setSaveAssemblyForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none">
                    <option value="">None</option>
                    {["Structural","Civil","MEP","Architectural","Road","Irrigation"].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Select Groups</label>
                  <p className="text-xs text-gray-600">{selectedForSave.size} selected</p>
                </div>
              </div>
              <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                {categories.map(cat => (
                  <label key={cat.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={selectedForSave.has(cat.id)}
                      onChange={e => setSelectedForSave(prev => { const n = new Set(prev); e.target.checked ? n.add(cat.id) : n.delete(cat.id); return n; })} />
                    <div className="w-2 h-2 rounded-full" style={{ background: cat.colour }} />
                    <span className="text-sm text-gray-700">{cat.name}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-3 pt-1">
                <button disabled={saveAssemblySaving || !saveAssemblyForm.name || selectedForSave.size === 0}
                  onClick={async () => {
                    setSaveAssemblySaving(true);
                    const res = await fetch(`/api/projects/${projectId}/assemblies/save`, {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ ...saveAssemblyForm, groupIds: Array.from(selectedForSave) }),
                    });
                    setSaveAssemblySaving(false);
                    if (res.ok) { toast.success("Assembly saved to your organisation library."); setShowSaveAssembly(false); setSaveAssemblyForm({ name: "", description: "", category: "" }); setSelectedForSave(new Set()); }
                    else { const d = await res.json(); toast.error(d?.error?.message ?? "Failed to save."); }
                  }}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {saveAssemblySaving ? "Saving…" : "Save Assembly"}
                </button>
                <button onClick={() => setShowSaveAssembly(false)}
                  className="px-4 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Viewport-aware context menu portal ── */}
      {mounted && openMenuId && menuAnchor && createPortal(
        <>
          <div className="fixed inset-0 z-[998]" onClick={closeMenu} />
          <div
            className="fixed z-[999] bg-white rounded-xl shadow-2xl border border-gray-200 py-1.5 w-52 text-gray-700 text-xs overflow-hidden"
            style={{
              right: window.innerWidth - menuAnchor.x,
              ...(menuAnchor.flipUp
                ? { bottom: window.innerHeight - menuAnchor.y + 4 }
                : { top: menuAnchor.y + 4 }),
            }}
          >
            {(() => {
              const item = groups.find(g => g.id === openMenuId);
              if (!item) return null;
              const isCat = !item.parentId;
              return isCat ? (
                <>
                  <button onClick={e => { e.stopPropagation(); setCreatingLayerIn(item.id); closeMenu(); }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-gray-50 transition">
                    <span className="text-blue-500">＋</span> Add Layer
                  </button>
                  <button onClick={e => { e.stopPropagation(); setEditingGroup(item); closeMenu(); }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-gray-50 transition">
                    <span>✏️</span> Rename
                  </button>
                  <div className="h-px bg-gray-100 my-1" />
                  <button onClick={e => { e.stopPropagation(); setCopyTarget({ group: item, isCategory: true, childLayerCount: groups.filter(g => g.parentId === item.id).length }); closeMenu(); }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-gray-50 transition">
                    <span>📋</span> Copy group
                  </button>
                  <div className="h-px bg-gray-100 my-1" />
                  <button onClick={e => { e.stopPropagation(); handleDelete(item); closeMenu(); }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-red-50 text-red-600 transition">
                    <span>🗑</span> Delete
                  </button>
                </>
              ) : (
                <>
                  <button onClick={e => { e.stopPropagation(); setDetailGroup(item); closeMenu(); }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-gray-50 transition">
                    <span>📋</span> Main Details
                  </button>
                  <button onClick={e => { e.stopPropagation(); setEditingGroup(item); closeMenu(); }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-gray-50 transition">
                    <span>✏️</span> Rename / Edit
                  </button>
                  <button onClick={e => { e.stopPropagation(); setChangeCatalogId(item.id); closeMenu(); }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-gray-50 transition">
                    <span>{item.rateItemId ? "🔄" : "📎"}</span>
                    {item.rateItemId ? "Change catalog" : "Link catalog"}
                  </button>
                  <div className="h-px bg-gray-100 my-1" />
                  <button onClick={e => { e.stopPropagation(); setCopyTarget({ group: item, isCategory: false, childLayerCount: 0 }); closeMenu(); }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-gray-50 transition">
                    <span>📋</span> Copy layer
                  </button>
                  <div className="h-px bg-gray-100 my-1" />
                  <button onClick={e => { e.stopPropagation(); handleDelete(item); closeMenu(); }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-red-50 text-red-600 transition">
                    <span>🗑</span> Delete
                  </button>
                </>
              );
            })()}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
