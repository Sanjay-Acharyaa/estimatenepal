"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/useConfirm";

type AssemblyGroup = {
  id: string;
  name: string;
  type: string;
  colour: string;
  rateCode: string | null;
  children: AssemblyGroup[];
};

type Assembly = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  orgId: string | null;
  groups: AssemblyGroup[];
  _count: { groups: number };
};

type RateSuggestion = { id: string; code: string; description: string; unit: string };

const TOOL_TYPES = [
  { value: "LINEAR",             label: "Linear (length)" },
  { value: "AREA",               label: "Area (sqft/sqm)" },
  { value: "VOLUME",             label: "Volume (cft/cum)" },
  { value: "COUNT",              label: "Count (each/no)" },
  { value: "COUNT_BY_DISTANCE",  label: "Count by distance" },
  { value: "VERTICAL_WALL_AREA", label: "Vertical wall area" },
];

const CATEGORIES = ["All", "Structural", "Civil", "MEP", "Architectural", "Road", "Irrigation"];
const SOURCES = [{ value: "all", label: "All" }, { value: "platform", label: "Platform" }, { value: "org", label: "My Org" }];

const typeBadge = (type: string) => {
  const map: Record<string, string> = {
    LINEAR: "bg-blue-100 text-blue-700", AREA: "bg-green-100 text-green-700",
    VOLUME: "bg-purple-100 text-purple-700", COUNT: "bg-orange-100 text-orange-700",
    COUNT_BY_DISTANCE: "bg-yellow-100 text-yellow-700", VERTICAL_WALL_AREA: "bg-pink-100 text-pink-700",
  };
  return map[type] ?? "bg-gray-100 text-gray-600";
};

const typeLabel = (type: string) => TOOL_TYPES.find(t => t.value === type)?.label.split(" ")[0] ?? type;

// ── Rate code picker ─────────────────────────────────────────────────────────
function RateCodePicker({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<RateSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function search(q: string) {
    setQuery(q);
    if (debounce.current) clearTimeout(debounce.current);
    if (!q.trim()) { setResults([]); return; }
    debounce.current = setTimeout(async () => {
      const res = await fetch(`/api/admin/rates?search=${encodeURIComponent(q)}&limit=8&published=true`);
      if (res.ok) { const d = await res.json(); setResults(d.data ?? []); setOpen(true); }
    }, 300);
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={e => search(e.target.value)}
        onFocus={() => query && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search rate code…"
        className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-0.5 max-h-48 overflow-y-auto">
          {results.map(r => (
            <button key={r.id} onMouseDown={() => { onChange(r.code); setQuery(r.code); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 text-xs">
              <span className="font-mono text-blue-700 mr-2">{r.code}</span>
              <span className="text-gray-600">{r.description.slice(0, 50)}</span>
              <span className="ml-1 text-gray-400">· {r.unit}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type ScopeCtx = { assemblyId: string; groupId: string; data: Record<string, unknown>; before: Record<string, unknown> };

// ── Scope dialog (future only vs this + future) ───────────────────────────────
function ScopeDialog({ ctx, onDone }: { ctx: ScopeCtx; onDone: (updated: AssemblyGroup) => void }) {
  const [saving, setSaving] = useState(false);

  async function submit(scope: "template" | "all_projects") {
    setSaving(true);
    const res = await fetch(`/api/assemblies/${ctx.assemblyId}/groups/${ctx.groupId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...ctx.data, scope }),
    });
    setSaving(false);
    if (res.ok) {
      const updated = await res.json();
      const msg = scope === "all_projects"
        ? `Layer updated — applied to ${updated.updatedProjects ?? 0} existing project layer${updated.updatedProjects !== 1 ? "s" : ""} too.`
        : "Layer updated — future projects will use the new values.";
      toast.success(msg);
      onDone(updated);
    } else { toast.error("Failed to save."); }
  }

  const before = ctx.before as { name?: string; type?: string; colour?: string; rateCode?: string | null };
  const after  = ctx.data  as { name?: string; type?: string; colour?: string; rateCode?: string | null };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="font-semibold text-gray-800 mb-1">Apply change to which projects?</h3>

        {/* Before / after diff */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 text-xs space-y-1">
          {before.name !== after.name && <p><span className="text-red-500 line-through">{before.name}</span> → <span className="text-green-600 font-medium">{after.name}</span></p>}
          {before.type !== after.type && <p>Type: <span className="text-red-500 line-through">{before.type}</span> → <span className="text-green-600 font-medium">{after.type}</span></p>}
          {before.colour !== after.colour && (
            <p className="flex items-center gap-1.5">Colour:
              <span className="inline-block w-3 h-3 rounded-full border" style={{ background: before.colour }} />
              → <span className="inline-block w-3 h-3 rounded-full border" style={{ background: after.colour }} />
            </p>
          )}
          {before.rateCode !== after.rateCode && <p>Rate: <span className="text-red-500 line-through">{before.rateCode ?? "none"}</span> → <span className="text-green-600 font-medium">{after.rateCode ?? "none"}</span></p>}
        </div>

        <div className="space-y-2 mb-4">
          <button onClick={() => submit("template")} disabled={saving}
            className="w-full text-left px-4 py-3 border-2 border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition disabled:opacity-50">
            <p className="text-sm font-semibold text-gray-800">Future projects only</p>
            <p className="text-xs text-gray-500 mt-0.5">Template updated. Existing project layers stay as they are.</p>
          </button>
          <button onClick={() => submit("all_projects")} disabled={saving}
            className="w-full text-left px-4 py-3 border-2 border-gray-200 rounded-lg hover:border-orange-400 hover:bg-orange-50 transition disabled:opacity-50">
            <p className="text-sm font-semibold text-gray-800">This + all future projects</p>
            <p className="text-xs text-gray-500 mt-0.5">Updates template and patches all existing projects that used this assembly.</p>
          </button>
        </div>
        {saving && <p className="text-xs text-center text-gray-400">Saving…</p>}
      </div>
    </div>
  );
}

// ── Layer row (editable) ─────────────────────────────────────────────────────
function LayerRow({ layer, assemblyId, categoryId, isOrg, onUpdate, onDelete }: {
  layer: AssemblyGroup; assemblyId: string; categoryId: string;
  isOrg: boolean; onUpdate: (l: AssemblyGroup) => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(layer.name);
  const [type, setType] = useState(layer.type);
  const [colour, setColour] = useState(layer.colour);
  const [rateCode, setRateCode] = useState(layer.rateCode ?? "");
  const [scopeCtx, setScopeCtx] = useState<ScopeCtx | null>(null);

  function openScope() {
    setScopeCtx({
      assemblyId,
      groupId: layer.id,
      data: { name, type, colour, rateCode: rateCode || null },
      before: { name: layer.name, type: layer.type, colour: layer.colour, rateCode: layer.rateCode },
    });
    setEditing(false);
  }

  if (scopeCtx) {
    return <ScopeDialog ctx={scopeCtx} onDone={updated => { onUpdate({ ...layer, ...updated }); setScopeCtx(null); }} />;
  }

  if (editing) {
    return (
      <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 space-y-2">
        <input value={name} onChange={e => setName(e.target.value)}
          className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Layer name" />
        <div className="flex gap-2">
          <select value={type} onChange={e => setType(e.target.value)}
            className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
            {TOOL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input type="color" value={colour} onChange={e => setColour(e.target.value)}
            className="w-8 h-7 rounded border border-gray-300 cursor-pointer" title="Colour" />
        </div>
        <RateCodePicker value={rateCode} onChange={setRateCode} />
        <div className="flex gap-2 justify-end">
          <button onClick={() => setEditing(false)} className="text-xs px-3 py-1 border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
          <button onClick={openScope} className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 group">
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: layer.colour }} />
      <span className="text-sm text-gray-700 flex-1 truncate">{layer.name}</span>
      <span className={`text-xs px-1.5 py-0.5 rounded ${typeBadge(layer.type)}`}>{typeLabel(layer.type)}</span>
      {layer.rateCode && <span className="text-xs font-mono text-gray-400">{layer.rateCode}</span>}
      {isOrg && (
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
          <button onClick={() => setEditing(true)} className="text-xs text-blue-600 hover:text-blue-800 px-1.5 py-0.5 rounded hover:bg-blue-50">Edit</button>
          <button onClick={onDelete} className="text-xs text-red-500 hover:text-red-700 px-1.5 py-0.5 rounded hover:bg-red-50">✕</button>
        </div>
      )}
    </div>
  );
}

// ── Add layer form ───────────────────────────────────────────────────────────
function AddLayerForm({ assemblyId, categoryId, onAdded }: {
  assemblyId: string; categoryId: string; onAdded: (l: AssemblyGroup) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("LINEAR");
  const [colour, setColour] = useState("#3B82F6");
  const [rateCode, setRateCode] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/assemblies/${assemblyId}/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), type, colour, rateCode: rateCode || null, parentId: categoryId }),
    });
    setSaving(false);
    if (res.ok) {
      const g = await res.json();
      onAdded({ ...g, children: [] });
      setName(""); setType("LINEAR"); setColour("#3B82F6"); setRateCode(""); setOpen(false);
      toast.success("Layer added.");
    } else { toast.error("Failed to add layer."); }
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 px-4 py-2 text-xs text-blue-600 hover:bg-blue-50 w-full text-left border-b border-gray-100">
      + Add layer
    </button>
  );

  return (
    <div className="px-4 py-3 bg-green-50 border-b border-green-100 space-y-2">
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Layer name"
        className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-500" />
      <div className="flex gap-2">
        <select value={type} onChange={e => setType(e.target.value)}
          className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-500">
          {TOOL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input type="color" value={colour} onChange={e => setColour(e.target.value)}
          className="w-8 h-7 rounded border border-gray-300 cursor-pointer" />
      </div>
      <RateCodePicker value={rateCode} onChange={setRateCode} />
      <div className="flex gap-2 justify-end">
        <button onClick={() => setOpen(false)} className="text-xs px-3 py-1 border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
        <button onClick={save} disabled={saving || !name.trim()}
          className="text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
          {saving ? "Adding…" : "Add"}
        </button>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function AssembliesPage() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [assemblies, setAssemblies] = useState<Assembly[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [source, setSource] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [preview, setPreview] = useState<Assembly | null>(null);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), limit: "15", source });
    if (search) qs.set("search", search);
    if (category !== "All") qs.set("category", category);
    const res = await fetch(`/api/assemblies?${qs}`);
    if (res.ok) { const d = await res.json(); setAssemblies(d.data); setTotalPages(d.pagination.totalPages); setTotal(d.pagination.total); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [page, category, source]); // eslint-disable-line

  function handleSearch(e: React.FormEvent) { e.preventDefault(); setPage(1); load(); }

  async function handleDuplicate(id: string) {
    setDuplicating(id);
    const res = await fetch(`/api/assemblies/${id}/duplicate`, { method: "POST" });
    setDuplicating(null);
    if (res.ok) { toast.success("Assembly duplicated to your org — you can now edit it."); load(); }
    else { const d = await res.json(); toast.error(d?.error?.message ?? "Failed."); }
  }

  async function handleDelete(id: string, name: string) {
    const ok = await confirm({ title: "Delete Assembly", message: `Delete "${name}"? This cannot be undone.`, variant: "danger", confirmLabel: "Delete" });
    if (!ok) return;
    setDeleting(id);
    await fetch(`/api/assemblies/${id}`, { method: "DELETE" });
    setDeleting(null);
    if (preview?.id === id) setPreview(null);
    load();
  }

  // ── Layer / category mutations (org assemblies only) ───────────────────────
  async function handleDeleteGroup(assemblyId: string, groupId: string, isCategory: boolean) {
    const ok = await confirm({
      title: isCategory ? "Delete Category" : "Delete Layer",
      message: isCategory ? "Delete this category and all its layers?" : "Delete this layer?",
      variant: "danger", confirmLabel: "Delete",
    });
    if (!ok) return;
    const res = await fetch(`/api/assemblies/${assemblyId}/groups/${groupId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(isCategory ? "Category deleted." : "Layer deleted.");
      setPreview(prev => {
        if (!prev) return prev;
        if (isCategory) return { ...prev, groups: prev.groups.filter(g => g.id !== groupId) };
        return { ...prev, groups: prev.groups.map(g => ({ ...g, children: g.children.filter(c => c.id !== groupId) })) };
      });
    } else { toast.error("Failed to delete."); }
  }

  function handleLayerUpdate(categoryId: string, updated: AssemblyGroup) {
    setPreview(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        groups: prev.groups.map(g =>
          g.id === categoryId ? { ...g, children: g.children.map(c => c.id === updated.id ? updated : c) } : g
        ),
      };
    });
  }

  function handleLayerAdded(categoryId: string, newLayer: AssemblyGroup) {
    setPreview(prev => {
      if (!prev) return prev;
      return { ...prev, groups: prev.groups.map(g => g.id === categoryId ? { ...g, children: [...g.children, newLayer] } : g) };
    });
  }

  async function handleAddCategory(assemblyId: string) {
    const name = window.prompt("Category name:");
    if (!name?.trim()) return;
    const res = await fetch(`/api/assemblies/${assemblyId}/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), type: "LINEAR", colour: "#6B7280", parentId: null, sortOrder: preview?.groups.length ?? 0 }),
    });
    if (res.ok) {
      const g = await res.json();
      toast.success("Category added.");
      setPreview(prev => prev ? { ...prev, groups: [...prev.groups, { ...g, children: [] }] } : prev);
    } else { toast.error("Failed to add category."); }
  }

  const isOrg = (a: Assembly | null) => !!a?.orgId;

  return (
    <div className="min-h-screen bg-gray-50">
      {confirmDialog}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Assembly Library</h1>
          <p className="text-sm text-gray-500 mt-0.5">Reusable takeoff templates — apply to any project</p>
        </div>
        <Link href="/dashboard" className="text-sm text-gray-400 hover:text-gray-600">← Dashboard</Link>
      </div>

      <div className="flex h-[calc(100vh-73px)]">
        {/* Left — list */}
        <div className="w-1/2 flex flex-col border-r border-gray-200 bg-white">
          <div className="p-4 border-b border-gray-100 space-y-3">
            <form onSubmit={handleSearch} className="flex gap-2">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assemblies…"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <button type="submit" className="bg-gray-700 text-white px-4 py-2 rounded-lg text-sm">Search</button>
            </form>
            <div className="flex flex-wrap gap-2">
              {SOURCES.map(s => (
                <button key={s.value} onClick={() => { setSource(s.value); setPage(1); }}
                  className={`text-xs px-3 py-1 rounded-full border ${source === s.value ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
                  {s.label}
                </button>
              ))}
              <div className="w-px bg-gray-200 self-stretch" />
              {CATEGORIES.map(c => (
                <button key={c} onClick={() => { setCategory(c); setPage(1); }}
                  className={`text-xs px-3 py-1 rounded-full border ${category === c ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
                  {c}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400">{total} assemblies found</p>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {loading && Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-4 animate-pulse"><div className="h-4 bg-gray-200 rounded w-3/4 mb-2" /><div className="h-3 bg-gray-100 rounded w-1/2" /></div>
            ))}
            {!loading && assemblies.length === 0 && <div className="text-center text-gray-400 py-16 text-sm">No assemblies found.</div>}
            {assemblies.map(a => (
              <div key={a.id} onClick={() => setPreview(a)}
                className={`p-4 cursor-pointer hover:bg-gray-50 transition ${preview?.id === a.id ? "bg-blue-50 border-l-4 border-blue-500" : ""} ${deleting === a.id ? "opacity-40 pointer-events-none" : ""}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-gray-800 text-sm">{a.name}</span>
                  {!a.orgId && <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">Platform</span>}
                  {a.orgId && <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">My Org</span>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {a.category && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{a.category}</span>}
                  <span className="text-xs text-gray-400">{a._count.groups} groups</span>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 py-3 border-t border-gray-100">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="text-xs px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-50">Previous</button>
              <span className="text-xs py-1.5 text-gray-500">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="text-xs px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-50">Next</button>
            </div>
          )}
        </div>

        {/* Right — preview + editor */}
        <div className="w-1/2 flex flex-col bg-white">
          {!preview ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
              <div className="text-5xl mb-4">🏗️</div>
              <h2 className="text-lg font-semibold text-gray-700 mb-2">Assembly Library</h2>
              <p className="text-sm text-gray-400 max-w-sm">Select an assembly to preview or edit its structure.</p>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between flex-shrink-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h2 className="font-semibold text-gray-800">{preview.name}</h2>
                    {!preview.orgId && <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">Platform</span>}
                    {preview.orgId && <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">My Org · Editable</span>}
                  </div>
                  {preview.category && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{preview.category}</span>}
                  {preview.description && <p className="text-sm text-gray-500 mt-2">{preview.description}</p>}
                </div>
                <div className="flex gap-2 flex-shrink-0 ml-3">
                  {!preview.orgId && (
                    <button onClick={() => handleDuplicate(preview.id)} disabled={duplicating === preview.id}
                      className="text-xs border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                      {duplicating === preview.id ? "Duplicating…" : "Duplicate to My Org"}
                    </button>
                  )}
                  {preview.orgId && (
                    <button onClick={() => handleDelete(preview.id, preview.name)} disabled={deleting === preview.id}
                      className="text-xs border border-red-300 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50">
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {/* Groups */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {isOrg(preview) && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Changes affect future applies only — existing project layers are not changed.
                  </p>
                )}
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Group Structure</p>

                {preview.groups.map(cat => (
                  <div key={cat.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: cat.colour }} />
                      <span className="font-medium text-sm text-gray-800 flex-1">{cat.name}</span>
                      <span className="text-xs text-gray-400">{cat.children.length} layers</span>
                      {isOrg(preview) && (
                        <button onClick={() => handleDeleteGroup(preview.id, cat.id, true)}
                          className="text-xs text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded hover:bg-red-50 opacity-0 group-hover:opacity-100">✕</button>
                      )}
                    </div>
                    <div>
                      {cat.children.map(layer => (
                        <LayerRow key={layer.id} layer={layer} assemblyId={preview.id} categoryId={cat.id}
                          isOrg={isOrg(preview)}
                          onUpdate={updated => handleLayerUpdate(cat.id, updated)}
                          onDelete={() => handleDeleteGroup(preview.id, layer.id, false)}
                        />
                      ))}
                      {cat.children.length === 0 && !isOrg(preview) && (
                        <div className="px-4 py-2 text-xs text-gray-400 italic">No layers defined</div>
                      )}
                      {isOrg(preview) && (
                        <AddLayerForm assemblyId={preview.id} categoryId={cat.id}
                          onAdded={layer => handleLayerAdded(cat.id, layer)} />
                      )}
                    </div>
                  </div>
                ))}

                {isOrg(preview) && (
                  <button onClick={() => handleAddCategory(preview.id)}
                    className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition">
                    + Add category
                  </button>
                )}
              </div>

              <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex-shrink-0">
                <p className="text-xs text-gray-500 text-center">
                  {isOrg(preview)
                    ? "Edit layers above · Apply from Takeoff tab → Apply Assembly"
                    : <>Platform template — <button onClick={() => handleDuplicate(preview.id)} className="text-blue-600 hover:underline">Duplicate to My Org</button> to edit it</>
                  }
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
