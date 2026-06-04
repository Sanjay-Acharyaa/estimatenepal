"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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

const CATEGORIES = ["All", "Structural", "Civil", "MEP", "Architectural", "Road", "Irrigation"];
const SOURCES = [
  { value: "all", label: "All" },
  { value: "platform", label: "Platform" },
  { value: "org", label: "My Org" },
];

const toolBadge = (type: string) => {
  const map: Record<string, string> = {
    LINEAR: "bg-blue-100 text-blue-700",
    AREA: "bg-green-100 text-green-700",
    VOLUME: "bg-purple-100 text-purple-700",
    COUNT: "bg-orange-100 text-orange-700",
    COUNT_BY_DISTANCE: "bg-yellow-100 text-yellow-700",
    VERTICAL_WALL_AREA: "bg-pink-100 text-pink-700",
  };
  return map[type] ?? "bg-gray-100 text-gray-600";
};

export default function AssembliesPage() {
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
    if (res.ok) {
      const d = await res.json();
      setAssemblies(d.data);
      setTotalPages(d.pagination.totalPages);
      setTotal(d.pagination.total);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [page, category, source]); // eslint-disable-line

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    load();
  }

  async function handleDuplicate(id: string) {
    setDuplicating(id);
    const res = await fetch(`/api/assemblies/${id}/duplicate`, { method: "POST" });
    setDuplicating(null);
    if (res.ok) { alert("Assembly duplicated to your organisation."); load(); }
    else { const d = await res.json(); alert(d?.error?.message ?? "Failed."); }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete assembly "${name}"? This cannot be undone.`)) return;
    setDeleting(id);
    await fetch(`/api/assemblies/${id}`, { method: "DELETE" });
    setDeleting(null);
    if (preview?.id === id) setPreview(null);
    load();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Assembly Library</h1>
          <p className="text-sm text-gray-500 mt-0.5">Reusable takeoff group templates — apply to any project</p>
        </div>
        <Link href="/dashboard" className="text-sm text-gray-400 hover:text-gray-600">← Dashboard</Link>
      </div>

      <div className="flex h-[calc(100vh-73px)]">
        {/* Left panel — list */}
        <div className="w-1/2 flex flex-col border-r border-gray-200 bg-white">
          {/* Filters */}
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

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {loading && Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            ))}
            {!loading && assemblies.length === 0 && (
              <div className="text-center text-gray-400 py-16 text-sm">No assemblies found.</div>
            )}
            {assemblies.map(a => (
              <div key={a.id}
                onClick={() => setPreview(a)}
                className={`p-4 cursor-pointer hover:bg-gray-50 transition ${preview?.id === a.id ? "bg-blue-50 border-l-4 border-blue-500" : ""}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-gray-800 text-sm">{a.name}</span>
                  {!a.orgId && (
                    <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">Platform</span>
                  )}
                  {a.orgId && (
                    <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">My Org</span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {a.category && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{a.category}</span>}
                  <span className="text-xs text-gray-400">{a._count.groups} groups</span>
                </div>
                {a.description && <p className="text-xs text-gray-400 mt-1 line-clamp-1">{a.description}</p>}
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 py-3 border-t border-gray-100">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="text-xs px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-50">Previous</button>
              <span className="text-xs py-1.5 text-gray-500">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="text-xs px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-50">Next</button>
            </div>
          )}
        </div>

        {/* Right panel — preview */}
        <div className="w-1/2 flex flex-col bg-white">
          {!preview ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
              <div className="text-5xl mb-4">🏗️</div>
              <h2 className="text-lg font-semibold text-gray-700 mb-2">Assembly Library</h2>
              <p className="text-sm text-gray-400 max-w-sm">
                Select an assembly to preview its group structure. Apply it to any project from the Takeoff tab.
              </p>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="font-semibold text-gray-800">{preview.name}</h2>
                    {!preview.orgId && <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">Platform</span>}
                    {preview.orgId && <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">My Org</span>}
                  </div>
                  {preview.category && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{preview.category}</span>}
                  {preview.description && <p className="text-sm text-gray-500 mt-2">{preview.description}</p>}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {!preview.orgId && (
                    <button onClick={() => handleDuplicate(preview.id)} disabled={duplicating === preview.id}
                      className="text-xs border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                      {duplicating === preview.id ? "Duplicating…" : "Duplicate to My Org"}
                    </button>
                  )}
                  {preview.orgId && (
                    <button onClick={() => handleDelete(preview.id, preview.name)} disabled={deleting === preview.id}
                      className="text-xs border border-red-300 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50">
                      {deleting === preview.id ? "Deleting…" : "Delete"}
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Group Structure</p>
                {preview.groups.map(cat => (
                  <div key={cat.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: cat.colour }} />
                      <span className="font-medium text-sm text-gray-800">{cat.name}</span>
                      <span className="ml-auto text-xs text-gray-400">{cat.children.length} layers</span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {cat.children.map(layer => (
                        <div key={layer.id} className="flex items-center gap-2 px-4 py-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: layer.colour }} />
                          <span className="text-sm text-gray-700 flex-1">{layer.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded ${toolBadge(layer.type)}`}>{layer.type.replace(/_/g, " ")}</span>
                          {layer.rateCode && <span className="text-xs text-gray-300 font-mono">{layer.rateCode}</span>}
                        </div>
                      ))}
                      {cat.children.length === 0 && (
                        <div className="px-4 py-2 text-xs text-gray-400 italic">No layers defined</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
                <p className="text-xs text-gray-500 text-center">
                  To apply this assembly to a project, open the project → Takeoff tab → click <strong>Apply Assembly</strong>.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
