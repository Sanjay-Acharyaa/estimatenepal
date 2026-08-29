"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

type TakeoffGroup = {
  id: string;
  name: string;
  parentId: string | null;
  discipline: { id: string; name: string } | null;
  _count: { items: number };
};

const CATEGORIES = ["Structural", "Civil", "MEP", "Architectural", "Road", "Irrigation"];

export function SaveAsAssemblyButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<TakeoffGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);

  // Fetch top-level groups when the modal opens
  useEffect(() => {
    if (!open) return;
    setLoadingGroups(true);
    fetch(`/api/projects/${projectId}/takeoff-groups`)
      .then(r => r.ok ? r.json() : [])
      .then((all: TakeoffGroup[]) => {
        const topLevel = all.filter(g => g.parentId === null);
        setGroups(topLevel);
        // Default: select all
        setSelectedIds(new Set(topLevel.map(g => g.id)));
      })
      .finally(() => setLoadingGroups(false));
  }, [open, projectId]);

  function toggle(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() { setSelectedIds(new Set(groups.map(g => g.id))); }
  function clearAll() { setSelectedIds(new Set()); }

  async function save() {
    if (!name.trim() || selectedIds.size === 0) return;
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/assemblies/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        category: category || undefined,
        groupIds: Array.from(selectedIds),
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success(`Assembly "${name.trim()}" saved to your library.`);
      setOpen(false);
      setName("");
      setCategory("");
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d?.error?.message ?? "Failed to save assembly.");
    }
  }

  function handleClose() {
    setOpen(false);
    setName("");
    setCategory("");
    setSelectedIds(new Set());
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm px-3 py-1.5 rounded-lg border border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100 transition font-medium"
      >
        Save as Assembly
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <h3 className="font-semibold text-gray-800">Save Groups as Assembly</h3>
              <button onClick={handleClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Assembly name <span className="text-red-500">*</span></label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Standard RCC Frame Structure"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Category (optional)</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option value="">— None —</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Group selector */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-700">Groups to include</label>
                  <div className="flex gap-2">
                    <button onClick={selectAll} className="text-xs text-blue-600 hover:underline">All</button>
                    <button onClick={clearAll} className="text-xs text-gray-500 hover:underline">None</button>
                  </div>
                </div>
                {loadingGroups ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}
                  </div>
                ) : groups.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-6">No takeoff groups found in this project.</p>
                ) : (
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
                    {groups.map(g => (
                      <label key={g.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(g.id)}
                          onChange={() => toggle(g.id)}
                          className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        />
                        <span className="flex-1 text-sm text-gray-800 truncate">{g.name}</span>
                        {g.discipline && (
                          <span className="text-xs text-gray-500 flex-shrink-0">{g.discipline.name}</span>
                        )}
                        <span className="text-xs text-gray-400 flex-shrink-0">{g._count.items} item{g._count.items !== 1 ? "s" : ""}</span>
                      </label>
                    ))}
                  </div>
                )}
                {selectedIds.size > 0 && (
                  <p className="text-xs text-gray-500 mt-1">{selectedIds.size} of {groups.length} group{groups.length !== 1 ? "s" : ""} selected</p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 flex-shrink-0">
              <button onClick={handleClose} className="text-sm px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button
                onClick={save}
                disabled={!name.trim() || selectedIds.size === 0 || saving}
                className="text-sm px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition"
              >
                {saving ? "Saving…" : "Save Assembly"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
