"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface PortfolioProject {
  id: number;
  project_name: string;
  client_type: string;
  contract_value_range: string;
  year_of_completion: number;
  role: string;
  description: string | null;
  source: string;
  related_tender_id: number | null;
  created_at: string;
}

const CLIENT_TYPE_LABELS: Record<string, string> = {
  GOVERNMENT: "Government",
  PRIVATE: "Private",
  NGO: "NGO",
  RESIDENTIAL: "Residential",
};

const RANGE_LABELS: Record<string, string> = {
  BELOW_1M: "Below NPR 1M",
  M1_TO_5M: "NPR 1M – 5M",
  M5_TO_25M: "NPR 5M – 25M",
  M25_TO_100M: "NPR 25M – 100M",
  M100_TO_500M: "NPR 100M – 500M",
  ABOVE_500M: "Above NPR 500M",
};

const ROLE_LABELS: Record<string, string> = {
  MAIN_CONTRACTOR: "Main Contractor",
  SUB_CONTRACTOR: "Sub Contractor",
  JOINT_VENTURE: "Joint Venture",
};

const CURRENT_YEAR = new Date().getFullYear();

const EMPTY_FORM = {
  project_name: "",
  client_type: "GOVERNMENT",
  contract_value_range: "BELOW_1M",
  year_of_completion: String(CURRENT_YEAR),
  role: "MAIN_CONTRACTOR",
  description: "",
};

export default function PortfolioPanel({ initialProjects }: { initialProjects: PortfolioProject[] }) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function set(field: keyof typeof EMPTY_FORM) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function addProject() {
    const year = parseInt(form.year_of_completion, 10);
    if (!form.project_name.trim()) { setSaveError("Project name is required."); return; }
    if (isNaN(year) || year < 1950 || year > CURRENT_YEAR) {
      setSaveError(`Year must be between 1950 and ${CURRENT_YEAR}.`);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const body: Record<string, unknown> = {
        project_name: form.project_name.trim(),
        client_type: form.client_type,
        contract_value_range: form.contract_value_range,
        year_of_completion: year,
        role: form.role,
      };
      if (form.description.trim()) body.description = form.description.trim();

      const res = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) { router.push("/login"); return; }
        setSaveError(data.error?.message ?? "Failed to add project.");
        return;
      }
      setProjects((prev) => [data.project, ...prev]);
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteProject(id: number) {
    setDeletingId(id);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/portfolio/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        if (res.status === 401) { router.push("/login"); return; }
        const data = await res.json();
        setDeleteError(data.error?.message ?? "Delete failed.");
        return;
      }
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch {
      setDeleteError("Network error. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  const input =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
        <button
          onClick={() => { setShowForm((v) => !v); setSaveError(null); }}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          {showForm ? "Cancel" : "+ Add project"}
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-800">New portfolio project</p>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Project name *</label>
            <input type="text" value={form.project_name} onChange={set("project_name")} className={input} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Client type *</label>
              <select value={form.client_type} onChange={set("client_type")} className={input}>
                {Object.entries(CLIENT_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Your role *</label>
              <select value={form.role} onChange={set("role")} className={input}>
                {Object.entries(ROLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Contract value range *</label>
              <select value={form.contract_value_range} onChange={set("contract_value_range")} className={input}>
                {Object.entries(RANGE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Year of completion *</label>
              <input
                type="number"
                min="1950"
                max={CURRENT_YEAR}
                value={form.year_of_completion}
                onChange={set("year_of_completion")}
                className={input}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
            <textarea rows={3} value={form.description} onChange={set("description")} className={input} />
          </div>

          {saveError && <p className="text-xs text-red-600">{saveError}</p>}

          <button
            onClick={addProject}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Add project"}
          </button>
        </div>
      )}

      {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center">
          <p className="text-sm text-gray-400">No portfolio projects yet.</p>
          <p className="text-xs text-gray-400 mt-1">Add past projects to build your profile.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900">{p.project_name}</p>
                    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      {ROLE_LABELS[p.role] ?? p.role}
                    </span>
                    {p.source === "TENDER_AWARD" && (
                      <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        From tender
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 flex-wrap text-xs text-gray-500">
                    <span>{CLIENT_TYPE_LABELS[p.client_type] ?? p.client_type}</span>
                    <span>·</span>
                    <span>{RANGE_LABELS[p.contract_value_range] ?? p.contract_value_range}</span>
                    <span>·</span>
                    <span>{p.year_of_completion}</span>
                  </div>
                  {p.description && (
                    <p className="mt-2 text-xs text-gray-500 leading-relaxed">{p.description}</p>
                  )}
                </div>
                {p.source === "SELF_REPORTED" && (
                  <button
                    onClick={() => deleteProject(p.id)}
                    disabled={deletingId === p.id}
                    className="shrink-0 text-xs text-gray-400 hover:text-red-500 disabled:opacity-50"
                  >
                    {deletingId === p.id ? "Removing…" : "Remove"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
