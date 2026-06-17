"use client";

import { useState } from "react";
import { formatBS } from "@/lib/bs-date";
import { NotesPanel } from "@/components/projects/NotesPanel";
import { TasksPanel } from "@/components/projects/TasksPanel";
import { RateMigrationBanner } from "@/components/projects/RateMigrationBanner";

type OrgUser = { id: string; name: string; email: string };
type Project = {
  id: string;
  name: string;
  description: string | null;
  clientName: string | null;
  clientCompany: string | null;
  bidDueDate: string | null;
  estimatedValue: number | null;
  district: string | null;
  seismicZone: string | null;
  unitSystem: string;
  dateFormat: string;
  contingencyPct: number | null;
  provisionalSum: number | null;
  vatEnabled: boolean;
  vatRate: number;
  tdsEnabled: boolean;
  tdsRate: number;
  status: string;
  priority: string;
  squareFootage: number | null;
  office: string | null;
  isPricingLocked: boolean;
  dueTime: string | null;
  projectNumber: string | null;
  scopeOfWork: string | null;
  members: { userId: string; user: { id: string; name: string; email: string } }[];
};

type Props = {
  project: Project;
  orgUsers: OrgUser[];
  isAdmin: boolean;
  currentUserId: string;
};

const PRIORITY_OPTS = [
  { value: "HIGH",   label: "High",   cls: "bg-red-100 text-red-700" },
  { value: "MEDIUM", label: "Medium", cls: "bg-amber-100 text-amber-700" },
  { value: "LOW",    label: "Low",    cls: "bg-gray-100 text-gray-600" },
];

const STATUS_OPTS = [
  "ESTIMATING","BID_SUBMITTED","ACCEPTED","IN_PROGRESS","COMPLETE","LOST","ARCHIVED"
];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <label className="block text-xs font-medium text-gray-600">{label}</label>
        {hint && <span className="text-xs text-gray-600 italic">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function inputCls(disabled = false) {
  return `w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${disabled ? "bg-gray-50 text-gray-600 cursor-not-allowed" : ""}`;
}

export function OverviewTab({ project, orgUsers, isAdmin, currentUserId }: Props) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState("");

  // Editable fields
  const [name,            setName]            = useState(project.name);
  const [projectNumber,   setProjectNumber]   = useState(project.projectNumber ?? "");
  const [description,     setDescription]     = useState(project.description ?? "");
  const [clientCompany,   setClientCompany]   = useState(project.clientCompany ?? "");
  const [clientName,      setClientName]      = useState(project.clientName ?? "");
  const [office,          setOffice]          = useState(project.office ?? "");
  const [district,        setDistrict]        = useState(project.district ?? "");
  const [unitSystem,      setUnitSystem]      = useState(project.unitSystem);
  const [squareFootage,   setSquareFootage]   = useState(project.squareFootage?.toString() ?? "");
  const [bidDueDate,      setBidDueDate]      = useState(
    project.bidDueDate ? new Date(project.bidDueDate).toISOString().slice(0, 10) : ""
  );
  const [dueTime,         setDueTime]         = useState(
    project.dueTime ? new Date(project.dueTime).toISOString().slice(11, 16) : ""
  );
  const [status,          setStatus]          = useState(project.status);
  const [priority,        setPriority]        = useState(project.priority ?? "MEDIUM");
  const [isPricingLocked, setIsPricingLocked] = useState(project.isPricingLocked);
  const [contingencyPct,  setContingencyPct]  = useState(project.contingencyPct?.toString() ?? "");
  const [vatEnabled,      setVatEnabled]      = useState(project.vatEnabled);
  const [vatRate,         setVatRate]         = useState(project.vatRate.toString());
  const [tdsEnabled,      setTdsEnabled]      = useState(project.tdsEnabled);
  const [tdsRate,         setTdsRate]         = useState(project.tdsRate.toString());
  const [scopeOfWork,     setScopeOfWork]     = useState(project.scopeOfWork ?? "");

  async function handleSave() {
    setSaving(true); setError(""); setSaved(false);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        projectNumber: projectNumber.trim() || null,
        description: description.trim() || null,
        clientCompany: clientCompany.trim() || null,
        clientName: clientName.trim() || null,
        office: office.trim() || null,
        district: district.trim() || null,
        unitSystem,
        squareFootage: squareFootage ? parseFloat(squareFootage) : null,
        status,
        priority,
        isPricingLocked,
        vatEnabled,
        vatRate: parseFloat(vatRate),
        tdsEnabled,
        tdsRate: parseFloat(tdsRate),
        contingencyPct: contingencyPct ? parseFloat(contingencyPct) : null,
        scopeOfWork: scopeOfWork.trim() || null,
      };
      if (bidDueDate) {
        const dt = dueTime ? `${bidDueDate}T${dueTime}:00.000Z` : `${bidDueDate}T00:00:00.000Z`;
        body.bidDueDate = dt;
        body.dueTime = dueTime ? `${bidDueDate}T${dueTime}:00.000Z` : null;
      } else {
        body.bidDueDate = null;
        body.dueTime = null;
      }

      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error?.message ?? "Failed to save.");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } catch { setError("Network error."); }
    setSaving(false);
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: form ── */}
      <div className="flex-1 overflow-y-auto p-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300">
        <div className="max-w-2xl space-y-5">

          <RateMigrationBanner projectId={project.id} />

          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-800">Estimate Overview</h2>
            <div className="flex items-center gap-2">
              {saved && <span className="text-xs text-green-600 font-medium">Saved ✓</span>}
              {error && <span className="text-xs text-red-600">{error}</span>}
              {isAdmin && (
                <button onClick={async () => {
                  const name = window.prompt("Template name:");
                  if (!name?.trim()) return;
                  const res = await fetch("/api/project-templates", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: name.trim(), sourceProjectId: project.id }),
                  });
                  if (res.ok) { const { toast } = await import("sonner"); toast.success(`Template "${name}" saved.`); }
                }}
                  className="px-3 py-1.5 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition">
                  Save as Template
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Estimate Name *">
              <input value={name} onChange={e => setName(e.target.value)} disabled={!isAdmin}
                className={inputCls(!isAdmin)} />
            </Field>
            <Field label="Project Number">
              <input value={projectNumber} onChange={e => setProjectNumber(e.target.value)} disabled={!isAdmin}
                placeholder="e.g. PRJ-2026-001" className={inputCls(!isAdmin)} />
            </Field>
          </div>

          <Field label="Project Description">
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              disabled={!isAdmin} rows={3}
              className={inputCls(!isAdmin) + " resize-none"}
              placeholder="Brief project description…" />
          </Field>

          <Field label="Scope of Work" hint="Printed in the Tender Bundle PDF">
            <textarea value={scopeOfWork} onChange={e => setScopeOfWork(e.target.value)}
              disabled={!isAdmin} rows={5}
              className={inputCls(!isAdmin) + " resize-y"}
              placeholder="Describe the full scope of work — works included, exclusions, special conditions…" />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Customer Company">
              <input value={clientCompany} onChange={e => setClientCompany(e.target.value)} disabled={!isAdmin}
                className={inputCls(!isAdmin)} />
            </Field>
            <Field label="Contact Name">
              <input value={clientName} onChange={e => setClientName(e.target.value)} disabled={!isAdmin}
                className={inputCls(!isAdmin)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Office">
              <input value={office} onChange={e => setOffice(e.target.value)} disabled={!isAdmin}
                placeholder="e.g. DKA Construction" className={inputCls(!isAdmin)} />
            </Field>
            <Field label="District">
              <input value={district} onChange={e => setDistrict(e.target.value)} disabled={!isAdmin}
                className={inputCls(!isAdmin)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Measurement System">
              <select value={unitSystem} onChange={e => setUnitSystem(e.target.value)} disabled={!isAdmin}
                className={inputCls(!isAdmin)}>
                <option value="METRIC">Metric</option>
                <option value="IMPERIAL">Imperial (US)</option>
              </select>
            </Field>
            <Field label="Square Footage">
              <input type="number" min="0" value={squareFootage} onChange={e => setSquareFootage(e.target.value)}
                disabled={!isAdmin} placeholder="e.g. 15558" className={inputCls(!isAdmin)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Due Date">
              <input type="date" value={bidDueDate} onChange={e => setBidDueDate(e.target.value)}
                disabled={!isAdmin} className={inputCls(!isAdmin)} />
              {bidDueDate && (
                <p className="text-xs text-gray-600 mt-0.5">
                  BS: {formatBS(new Date(bidDueDate))}
                </p>
              )}
            </Field>
            <Field label="Due Time (optional)">
              <input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)}
                disabled={!isAdmin} className={inputCls(!isAdmin)} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Status">
              <select value={status} onChange={e => setStatus(e.target.value)} disabled={!isAdmin}
                className={inputCls(!isAdmin)}>
                {STATUS_OPTS.map(s => (
                  <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select value={priority} onChange={e => setPriority(e.target.value)} disabled={!isAdmin}
                className={inputCls(!isAdmin)}>
                {PRIORITY_OPTS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Estimate Pricing">
              <select
                value={isPricingLocked ? "locked" : "unlocked"}
                onChange={e => setIsPricingLocked(e.target.value === "locked")}
                disabled={!isAdmin}
                className={inputCls(!isAdmin)}
              >
                <option value="unlocked">🔓 Unlocked</option>
                <option value="locked">🔒 Locked</option>
              </select>
            </Field>
          </div>

          {/* Financial settings */}
          <div className="border border-gray-200 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Financial Settings</h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Contingency %">
                <input type="number" min="0" max="100" step="0.5" value={contingencyPct}
                  onChange={e => setContingencyPct(e.target.value)} disabled={!isAdmin}
                  placeholder="e.g. 5" className={inputCls(!isAdmin)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <input type="checkbox" id="vat" checked={vatEnabled}
                  onChange={e => setVatEnabled(e.target.checked)} disabled={!isAdmin}
                  className="w-4 h-4 accent-blue-600" />
                <label htmlFor="vat" className="text-sm text-gray-700">VAT</label>
                {vatEnabled && (
                  <input type="number" min="0" max="100" value={vatRate}
                    onChange={e => setVatRate(e.target.value)} disabled={!isAdmin}
                    className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none" />
                )}
                {vatEnabled && <span className="text-sm text-gray-500">%</span>}
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="tds" checked={tdsEnabled}
                  onChange={e => setTdsEnabled(e.target.checked)} disabled={!isAdmin}
                  className="w-4 h-4 accent-blue-600" />
                <label htmlFor="tds" className="text-sm text-gray-700">TDS</label>
                {tdsEnabled && (
                  <input type="number" min="0" max="100" value={tdsRate}
                    onChange={e => setTdsRate(e.target.value)} disabled={!isAdmin}
                    className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none" />
                )}
                {tdsEnabled && <span className="text-sm text-gray-500">%</span>}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Right: Notes + Tasks ── */}
      <aside className="w-80 border-l border-gray-200 flex flex-col overflow-hidden flex-shrink-0">
        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300">
          <NotesPanel projectId={project.id} currentUserId={currentUserId} isAdmin={isAdmin} />
          <div className="border-t border-gray-200" />
          <TasksPanel projectId={project.id} orgUsers={orgUsers} currentUserId={currentUserId} isAdmin={isAdmin} />
        </div>
      </aside>
    </div>
  );
}
