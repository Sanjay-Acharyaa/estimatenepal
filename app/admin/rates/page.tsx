"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/useConfirm";

type RateItem = {
  id: string;
  code: string;
  description: string;
  unit: string;
  baseRate: number;
  fiscalYear: string;
  isPublished: boolean;
};

type DistrictRow = { district: string; rate: number | null };

type Page = { data: RateItem[]; pagination: { page: number; limit: number; total: number; totalPages: number }; fiscalYears: string[] };

const EMPTY_FORM = { code: "", description: "", unit: "", baseRate: "", fiscalYear: "" };

export default function AdminRatesPage() {
  const { confirm: confirmAction, dialog: confirmDialog } = useConfirm();
  const [page, setPage] = useState(1);
  const [fiscalYear, setFiscalYear] = useState("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<Page | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importFY, setImportFY] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; imported: number; skipped: number; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [publishing, setPublishing] = useState(false);
  const [publishFY, setPublishFY] = useState("");

  const [deleteFY, setDeleteFY] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);

  // District rates modal
  const [districtRate, setDistrictRate] = useState<RateItem | null>(null);
  const [districtRows, setDistrictRows] = useState<DistrictRow[]>([]);
  const [districtLoading, setDistrictLoading] = useState(false);
  const [districtSaving, setDistrictSaving] = useState(false);
  const [districtError, setDistrictError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const qs = new URLSearchParams({ page: String(page), limit: "50" });
    if (fiscalYear) qs.set("fiscalYear", fiscalYear);
    if (search) qs.set("search", search);
    const res = await fetch(`/api/admin/rates?${qs}`);
    if (!res.ok) { setError("Failed to load rates."); setLoading(false); return; }
    setData(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, [page, fiscalYear]); // eslint-disable-line

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    load();
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setFormError("");
    const res = await fetch("/api/admin/rates", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, baseRate: parseFloat(form.baseRate) }),
    });
    if (!res.ok) { const d = await res.json(); setFormError(d?.error?.message ?? "Failed."); setSaving(false); return; }
    setSaving(false); setShowAdd(false); setForm(EMPTY_FORM); load();
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setFormError("");
    const res = await fetch(`/api/admin/rates/${editId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...editForm, baseRate: parseFloat(editForm.baseRate) }),
    });
    if (!res.ok) { const d = await res.json(); setFormError(d?.error?.message ?? "Failed."); setSaving(false); return; }
    setSaving(false); setEditId(null); load();
  }

  async function handleDelete(id: string, code: string) {
    const ok = await confirmAction({ title: "Delete Rate", message: `Delete rate "${code}"?`, variant: "danger", confirmLabel: "Delete" });
    if (!ok) return;
    const res = await fetch(`/api/admin/rates/${id}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json(); toast.error(d?.error?.message ?? "Failed."); return; }
    toast.success("Rate deleted.");
    load();
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!importFile || !importFY) return;
    setImporting(true); setImportResult(null);
    const fd = new FormData();
    fd.append("file", importFile);
    fd.append("fiscalYear", importFY);
    const res = await fetch("/api/admin/rates/import", { method: "POST", body: fd });
    const d = await res.json();
    setImportResult(d);
    setImporting(false);
    if (d.success) { setImportFile(null); if (fileRef.current) fileRef.current.value = ""; load(); }
  }

  async function openDistrictModal(rate: RateItem) {
    setDistrictRate(rate);
    setDistrictError("");
    setDistrictLoading(true);
    const res = await fetch(`/api/admin/rates/${rate.id}/district-rates`);
    if (res.ok) setDistrictRows(await res.json());
    else setDistrictError("Failed to load district rates.");
    setDistrictLoading(false);
  }

  function updateDistrictRow(district: string, value: string) {
    setDistrictRows(rows => rows.map(r =>
      r.district === district
        ? { ...r, rate: value === "" ? null : parseFloat(value) }
        : r
    ));
  }

  async function saveDistrictRates() {
    if (!districtRate) return;
    setDistrictSaving(true); setDistrictError("");
    const payload = districtRows
      .filter(r => r.rate !== null && r.rate >= 0)
      .map(r => ({ district: r.district, rate: r.rate as number }));
    const res = await fetch(`/api/admin/rates/${districtRate.id}/district-rates`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rates: payload }),
    });
    setDistrictSaving(false);
    if (!res.ok) { const d = await res.json(); setDistrictError(d?.error?.message ?? "Failed to save."); return; }
    setDistrictRate(null);
  }

  async function handleDeleteFY() {
    if (deleteConfirm !== deleteFY) return;
    const ok2 = await confirmAction({ title: `Delete FY ${deleteFY}`, message: `Delete ALL DUDBC rates for FY ${deleteFY}? This includes district rates, analyses and BOQ overrides.`, variant: "danger", confirmLabel: "Delete All" });
    if (!ok2) return;
    setDeleting(true);
    const res = await fetch(`/api/admin/rates?fiscalYear=${encodeURIComponent(deleteFY)}`, { method: "DELETE" });
    const d = await res.json();
    setDeleting(false);
    if (!res.ok) { toast.error(d?.error?.message ?? "Failed."); return; }
    toast.success(`Deleted ${d.deleted} rates for FY ${deleteFY}.`);
    setDeleteFY(""); setDeleteConfirm(""); load();
  }

  async function handlePublish() {
    if (!publishFY) return;
    const ok3 = await confirmAction({ title: "Publish Rates", message: `Publish all DUDBC rates for FY ${publishFY}? This is irreversible — published rates cannot be edited or deleted.`, variant: "warning", confirmLabel: "Publish All" });
    if (!ok3) return;
    setPublishing(true);
    const res = await fetch("/api/admin/rates/publish", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fiscalYear: publishFY }),
    });
    const d = await res.json();
    setPublishing(false);
    if (!res.ok) { toast.error(d?.error?.message ?? "Failed."); return; }
    toast.success(`Published ${d.published} rates for FY ${publishFY}.`);
    load();
  }

  const inputCls = "border border-gray-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-500";

  return (
    <div className="min-h-screen bg-gray-50">
      {confirmDialog}
      {/* Header */}
      <div className="bg-red-600 text-white px-8 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-red-200 hover:text-white text-sm">← Super Admin</Link>
        <span className="font-bold text-lg">DUDBC Rate Database</span>
      </div>

      <div className="p-6 max-w-7xl mx-auto space-y-6">

        {/* Toolbar */}
        <div className="flex flex-wrap gap-3 items-end">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search code or description…"
              className="border border-gray-300 rounded px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            <button type="submit" className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm hover:bg-gray-600">Search</button>
          </form>
          <select value={fiscalYear} onChange={e => { setFiscalYear(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none">
            <option value="">All fiscal years</option>
            {data?.fiscalYears.map(fy => <option key={fy} value={fy}>{fy}</option>)}
          </select>
          <button onClick={() => setShowAdd(true)} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">+ Add Rate</button>
        </div>

        {/* Import panel */}
        <details className="bg-white border border-gray-200 rounded-lg p-4">
          <summary className="cursor-pointer font-medium text-sm text-gray-700">Import from Excel (.xlsx)</summary>
          <form onSubmit={handleImport} className="mt-3 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Fiscal Year</label>
              <input value={importFY} onChange={e => setImportFY(e.target.value)} placeholder="e.g. 2081/82"
                className={inputCls + " w-32"} required />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Excel file</label>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" required
                onChange={e => setImportFile(e.target.files?.[0] ?? null)}
                className="text-sm" />
            </div>
            <button type="submit" disabled={importing || !importFile || !importFY}
              className="bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700 disabled:opacity-50">
              {importing ? "Importing…" : "Import"}
            </button>
          </form>
          {importResult && (
            <div className={`mt-3 text-sm p-3 rounded ${importResult.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {importResult.success
                ? `✓ Imported ${importResult.imported} rows, skipped ${importResult.skipped} duplicates.`
                : `Validation failed:`}
              {importResult.errors?.map((e, i) => <p key={i} className="mt-1">{e}</p>)}
            </div>
          )}
        </details>

        {/* Publish panel */}
        <details className="bg-white border border-orange-200 rounded-lg p-4">
          <summary className="cursor-pointer font-medium text-sm text-orange-700">Publish Rates (Irreversible)</summary>
          <div className="mt-3 flex gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Fiscal Year to publish</label>
              <select value={publishFY} onChange={e => setPublishFY(e.target.value)}
                className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none">
                <option value="">Select fiscal year…</option>
                {data?.fiscalYears.map(fy => <option key={fy} value={fy}>{fy}</option>)}
              </select>
            </div>
            <button onClick={handlePublish} disabled={publishing || !publishFY}
              className="bg-orange-600 text-white px-4 py-1.5 rounded text-sm hover:bg-orange-700 disabled:opacity-50">
              {publishing ? "Publishing…" : "Publish All"}
            </button>
          </div>
          <p className="mt-2 text-xs text-orange-600">Once published, rates cannot be edited or deleted. This makes them available to all organisations.</p>
        </details>

        {/* Danger Zone — delete fiscal year */}
        <details className="bg-white border border-red-300 rounded-lg p-4">
          <summary className="cursor-pointer font-medium text-sm text-red-700">Danger Zone — Delete Fiscal Year</summary>
          <div className="mt-3 space-y-3">
            <p className="text-xs text-red-600">
              Permanently deletes <strong>all</strong> rates for a fiscal year — including district overrides, rate analyses, and BOQ overrides. Works on both Draft and Published rates. Cannot be undone.
            </p>
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Fiscal Year to delete</label>
                <select value={deleteFY} onChange={e => { setDeleteFY(e.target.value); setDeleteConfirm(""); }}
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none">
                  <option value="">Select fiscal year…</option>
                  {data?.fiscalYears.map(fy => <option key={fy} value={fy}>{fy}</option>)}
                </select>
              </div>
              {deleteFY && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Type <span className="font-mono font-bold text-red-700">{deleteFY}</span> to confirm
                  </label>
                  <input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)}
                    placeholder={deleteFY}
                    className="border border-red-300 rounded px-3 py-1.5 text-sm w-36 focus:outline-none focus:ring-1 focus:ring-red-500" />
                </div>
              )}
              <button onClick={handleDeleteFY} disabled={deleting || !deleteFY || deleteConfirm !== deleteFY}
                className="bg-red-600 text-white px-4 py-1.5 rounded text-sm hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed">
                {deleting ? "Deleting…" : "Delete All"}
              </button>
            </div>
          </div>
        </details>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        {/* Rate table */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-600 w-24">Code</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Description</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600 w-20">Unit</th>
                <th className="px-4 py-2 text-right font-medium text-gray-600 w-28">Base Rate</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600 w-24">FY</th>
                <th className="px-4 py-2 text-center font-medium text-gray-600 w-24">Status</th>
                <th className="px-4 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
              )}
              {!loading && data?.data.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No rates found.</td></tr>
              )}
              {data?.data.map(rate => (
                <tr key={rate.id} className="hover:bg-gray-50">
                  {editId === rate.id ? (
                    <>
                      <td className="px-4 py-1"><input value={editForm.code} onChange={e => setEditForm(f => ({ ...f, code: e.target.value }))} className={inputCls} /></td>
                      <td className="px-4 py-1"><input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} className={inputCls} /></td>
                      <td className="px-4 py-1"><input value={editForm.unit} onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))} className={inputCls} /></td>
                      <td className="px-4 py-1"><input type="number" min="0" step="0.01" value={editForm.baseRate} onChange={e => setEditForm(f => ({ ...f, baseRate: e.target.value }))} className={inputCls} /></td>
                      <td className="px-4 py-1"><input value={editForm.fiscalYear} onChange={e => setEditForm(f => ({ ...f, fiscalYear: e.target.value }))} className={inputCls} /></td>
                      <td></td>
                      <td className="px-4 py-1">
                        <form onSubmit={handleEdit} className="flex gap-1">
                          <button type="submit" disabled={saving} className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded">Save</button>
                          <button type="button" onClick={() => setEditId(null)} className="text-xs text-gray-500 px-2 py-0.5 rounded border">Cancel</button>
                        </form>
                        {formError && <p className="text-red-500 text-xs mt-1">{formError}</p>}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2 font-mono text-xs text-gray-700">{rate.code}</td>
                      <td className="px-4 py-2 text-gray-800">{rate.description}</td>
                      <td className="px-4 py-2 text-gray-500">{rate.unit}</td>
                      <td className="px-4 py-2 text-right font-mono text-gray-700">
                        {rate.baseRate.toLocaleString("en-NP", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2 text-gray-500">{rate.fiscalYear}</td>
                      <td className="px-4 py-2 text-center">
                        {rate.isPublished
                          ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Published</span>
                          : <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Draft</span>}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          <button onClick={() => openDistrictModal(rate)}
                            className="text-xs text-purple-600 hover:underline">Districts</button>
                          {!rate.isPublished && (
                            <>
                              <button onClick={() => { setEditId(rate.id); setEditForm({ code: rate.code, description: rate.description, unit: rate.unit, baseRate: String(rate.baseRate), fiscalYear: rate.fiscalYear }); setFormError(""); }}
                                className="text-xs text-blue-600 hover:underline">Edit</button>
                              <button onClick={() => handleDelete(rate.id, rate.code)}
                                className="text-xs text-red-500 hover:underline">Delete</button>
                            </>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {data && data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-600">
              <span>{data.pagination.total} rates</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50">Previous</button>
                <span className="px-2 py-1">Page {page} / {data.pagination.totalPages}</span>
                <button onClick={() => setPage(p => Math.min(data.pagination.totalPages, p + 1))} disabled={page === data.pagination.totalPages}
                  className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50">Next</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* District rates modal */}
      {districtRate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="font-semibold text-gray-800">District Rates — {districtRate.code}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{districtRate.description} · FY {districtRate.fiscalYear}</p>
              </div>
              <button onClick={() => setDistrictRate(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4">
              {districtLoading && <p className="text-center text-gray-400 py-8">Loading…</p>}
              {districtError && <p className="text-red-600 text-sm mb-3">{districtError}</p>}
              {!districtLoading && (
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  {districtRows.map(row => (
                    <div key={row.district} className="flex items-center gap-2">
                      <span className="text-sm text-gray-700 w-36 flex-shrink-0">{row.district}</span>
                      {districtRate.isPublished ? (
                        <span className="text-sm font-mono text-gray-600">
                          {row.rate !== null ? row.rate.toLocaleString("en-NP", { minimumFractionDigits: 2 }) : <span className="text-gray-300">—</span>}
                        </span>
                      ) : (
                        <input
                          type="number" min="0" step="0.01"
                          value={row.rate ?? ""}
                          onChange={e => updateDistrictRow(row.district, e.target.value)}
                          placeholder="Same as base"
                          className="border border-gray-300 rounded px-2 py-0.5 text-sm w-28 focus:outline-none focus:ring-1 focus:ring-purple-500"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {!districtRate.isPublished && (
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between flex-shrink-0">
                <p className="text-xs text-gray-400">Leave blank to use the base rate for that district.</p>
                <div className="flex gap-3">
                  <button onClick={() => setDistrictRate(null)} className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">Cancel</button>
                  <button onClick={saveDistrictRates} disabled={districtSaving}
                    className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
                    {districtSaving ? "Saving…" : "Save District Rates"}
                  </button>
                </div>
              </div>
            )}
            {districtRate.isPublished && (
              <div className="px-6 py-4 border-t border-gray-200 flex-shrink-0">
                <p className="text-xs text-gray-400">Published rates are read-only.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="font-semibold text-gray-800 mb-4">Add DUDBC Rate</h3>
            <form onSubmit={handleAdd} className="space-y-3">
              {formError && <p className="text-red-600 text-sm">{formError}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Code</label>
                  <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} required className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Fiscal Year</label>
                  <input value={form.fiscalYear} onChange={e => setForm(f => ({ ...f, fiscalYear: e.target.value }))} placeholder="2081/82" required className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Unit</label>
                  <input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} required className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Base Rate (NRS)</label>
                  <input type="number" min="0" step="0.01" value={form.baseRate} onChange={e => setForm(f => ({ ...f, baseRate: e.target.value }))} required className={inputCls} />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "Saving…" : "Add Rate"}
                </button>
                <button type="button" onClick={() => { setShowAdd(false); setFormError(""); }} className="px-4 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
