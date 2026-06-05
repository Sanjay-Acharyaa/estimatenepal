"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

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

type Discipline = { id: string; name: string };

type Props = {
  projectId: string;
  disciplines: Discipline[];
  activeDisciplineId?: string | null;
  onClose: () => void;
  onApplied: () => void;
};

const CATEGORIES = ["All", "Structural", "Civil", "MEP", "Architectural", "Road", "Irrigation"];
const SOURCES = [
  { value: "all", label: "All" },
  { value: "platform", label: "Platform Templates" },
  { value: "org", label: "My Organisation" },
];

export function AssemblyLibraryModal({ projectId, disciplines, activeDisciplineId, onClose, onApplied }: Props) {
  const [assemblies, setAssemblies] = useState<Assembly[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [source, setSource] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [preview, setPreview] = useState<Assembly | null>(null);
  const [applying, setApplying] = useState(false);
  const [selectedDiscipline, setSelectedDiscipline] = useState(
    activeDisciplineId ?? disciplines[0]?.id ?? ""
  );
  const [applyError, setApplyError] = useState("");
  const [applySuccess, setApplySuccess] = useState("");
  const [duplicating, setDuplicating] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), limit: "12", source });
    if (search) qs.set("search", search);
    if (category !== "All") qs.set("category", category);
    const res = await fetch(`/api/assemblies?${qs}`);
    if (res.ok) {
      const d = await res.json();
      setAssemblies(d.data);
      setTotalPages(d.pagination.totalPages);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [page, category, source]); // eslint-disable-line

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    load();
  }

  async function handleApply() {
    if (!preview || !selectedDiscipline) return;
    setApplying(true); setApplyError(""); setApplySuccess("");
    const res = await fetch(`/api/assemblies/${preview.id}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, disciplineId: selectedDiscipline }),
    });
    const d = await res.json();
    setApplying(false);
    if (!res.ok) { setApplyError(d?.error?.message ?? "Failed to apply."); return; }
    setApplySuccess(`✓ Applied "${d.applied}" — ${d.created} layers created.`);
    onApplied();
  }

  async function handleDuplicate(id: string) {
    setDuplicating(id);
    const res = await fetch(`/api/assemblies/${id}/duplicate`, { method: "POST" });
    setDuplicating(null);
    if (res.ok) { toast.success("Assembly duplicated to your organisation. You can now edit it."); load(); }
    else { const d = await res.json(); toast.error(d?.error?.message ?? "Failed."); }
  }

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

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Assembly Library</h2>
            <p className="text-xs text-gray-500 mt-0.5">Browse templates and apply them to this project</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left — library list */}
          <div className="w-3/5 flex flex-col border-r border-gray-200">
            {/* Filters */}
            <div className="px-4 py-3 border-b border-gray-100 space-y-2 flex-shrink-0">
              <form onSubmit={handleSearch} className="flex gap-2">
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assemblies…"
                  className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                <button type="submit" className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm">Search</button>
              </form>
              <div className="flex gap-2 flex-wrap">
                {SOURCES.map(s => (
                  <button key={s.value} onClick={() => { setSource(s.value); setPage(1); }}
                    className={`text-xs px-3 py-1 rounded-full border ${source === s.value ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
                    {s.label}
                  </button>
                ))}
                <div className="w-px bg-gray-200 mx-1" />
                {CATEGORIES.map(c => (
                  <button key={c} onClick={() => { setCategory(c); setPage(1); }}
                    className={`text-xs px-3 py-1 rounded-full border ${category === c ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Assembly grid */}
            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-3 content-start">
              {loading && Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-28 bg-gray-100 rounded-lg animate-pulse" />
              ))}
              {!loading && assemblies.length === 0 && (
                <div className="col-span-2 text-center text-gray-400 py-12 text-sm">No assemblies found.</div>
              )}
              {assemblies.map(a => (
                <div key={a.id}
                  onClick={() => { setPreview(a); setApplyError(""); setApplySuccess(""); }}
                  className={`cursor-pointer border rounded-lg p-3 hover:border-blue-400 transition ${preview?.id === a.id ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}>
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <p className="font-medium text-gray-800 text-sm leading-tight">{a.name}</p>
                    {!a.orgId && (
                      <span className="flex-shrink-0 text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">Platform</span>
                    )}
                  </div>
                  {a.category && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{a.category}</span>}
                  {a.description && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{a.description}</p>}
                  <p className="text-xs text-gray-400 mt-2">{a._count.groups} groups</p>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 py-3 border-t border-gray-100 flex-shrink-0">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="text-xs px-3 py-1 border rounded disabled:opacity-40">Prev</button>
                <span className="text-xs py-1 text-gray-500">{page} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="text-xs px-3 py-1 border rounded disabled:opacity-40">Next</button>
              </div>
            )}
          </div>

          {/* Right — preview + apply */}
          <div className="w-2/5 flex flex-col overflow-hidden">
            {!preview ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                Select an assembly to preview
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <div>
                    <h3 className="font-semibold text-gray-800">{preview.name}</h3>
                    {preview.category && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{preview.category}</span>}
                    {preview.description && <p className="text-sm text-gray-500 mt-2">{preview.description}</p>}
                  </div>

                  {/* Group tree preview */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Groups & Layers</p>
                    <div className="space-y-2">
                      {preview.groups.map(cat => (
                        <div key={cat.id} className="border border-gray-200 rounded-lg overflow-hidden">
                          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
                            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: cat.colour }} />
                            <span className="text-sm font-medium text-gray-700">{cat.name}</span>
                          </div>
                          <div className="divide-y divide-gray-100">
                            {cat.children.map(layer => (
                              <div key={layer.id} className="flex items-center gap-2 px-3 py-1.5">
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: layer.colour }} />
                                <span className="text-xs text-gray-600 flex-1">{layer.name}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded ${toolBadge(layer.type)}`}>{layer.type}</span>
                                {layer.rateCode && <span className="text-xs text-gray-400 font-mono">{layer.rateCode}</span>}
                              </div>
                            ))}
                            {cat.children.length === 0 && (
                              <div className="px-3 py-1.5 text-xs text-gray-400 italic">No layers</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Apply panel */}
                <div className="flex-shrink-0 border-t border-gray-200 p-4 space-y-3">
                  {applySuccess ? (
                    <p className="text-sm text-green-700 bg-green-50 rounded px-3 py-2">{applySuccess}</p>
                  ) : (
                    <>
                      {applyError && <p className="text-sm text-red-600">{applyError}</p>}
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Apply to discipline</label>
                        <select value={selectedDiscipline} onChange={e => setSelectedDiscipline(e.target.value)}
                          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none">
                          {disciplines.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      </div>
                      <button onClick={handleApply} disabled={applying || !selectedDiscipline}
                        className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                        {applying ? "Applying…" : `Apply "${preview.name}"`}
                      </button>
                    </>
                  )}
                  {/* Duplicate if platform template */}
                  {!preview.orgId && (
                    <button onClick={() => handleDuplicate(preview.id)} disabled={duplicating === preview.id}
                      className="w-full border border-gray-300 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
                      {duplicating === preview.id ? "Duplicating…" : "Duplicate to My Org (to customise)"}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
