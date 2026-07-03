"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const DISTRICTS = [
  "Achham","Arghakhanchi","Baglung","Baitadi","Bajhang","Bajura","Banke","Bara","Bardiya",
  "Bhaktapur","Bhojpur","Chitwan","Dadeldhura","Dailekh","Dang","Darchula","Dhading",
  "Dhankuta","Dhanusa","Dolakha","Dolpa","Doti","Eastern Rukum","Gorkha","Gulmi","Humla",
  "Ilam","Jajarkot","Jhapa","Jumla","Kailali","Kalikot","Kanchanpur","Kapilvastu","Kaski",
  "Kathmandu","Kavrepalanchok","Khotang","Lalitpur","Lamjung","Mahottari","Makwanpur",
  "Manang","Morang","Mugu","Mustang","Myagdi","Nawalparasi East","Nawalparasi West",
  "Nuwakot","Okhaldhunga","Palpa","Panchthar","Parbat","Parsa","Pyuthan","Ramechhap",
  "Rasuwa","Rautahat","Rolpa","Rupandehi","Salyan","Sankhuwasabha","Saptari","Sarlahi",
  "Sindhuli","Sindhupalchok","Siraha","Solukhumbu","Sunsari","Surkhet","Syangja","Tanahun",
  "Taplejung","Terhathum","Udayapur","Western Rukum",
];

export default function NewProjectPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [templates, setTemplates] = useState<{ id: string; name: string; description: string | null }[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");

  useEffect(() => {
    fetch("/api/project-templates").then(r => r.ok ? r.json() : []).then(setTemplates).catch(() => {});
  }, []);
  const [form, setForm] = useState({
    name: "", description: "",
    clientName: "", clientCompany: "", bidDueDate: "", estimatedValue: "",
    district: "", seismicZone: "",
    unitSystem: "METRIC", dateFormat: "AD",
    vatEnabled: true, vatRate: 13,
    tdsEnabled: false, tdsRate: 1.5,
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value, type } = e.target;
    setForm((f) => ({
      ...f,
      [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked
               : type === "number" ? parseFloat(value) || 0
               : value,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const payload = {
      ...form,
      estimatedValue: form.estimatedValue !== "" ? parseFloat(form.estimatedValue as string) : undefined,
      bidDueDate: form.bidDueDate ? new Date(form.bidDueDate).toISOString() : undefined,
    };

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      if (data.error?.code === "PLAN_LIMIT") {
        setError("__PLAN_LIMIT__");
      } else {
        setError(data.error?.message ?? "Failed to create project.");
      }
    } else {
      // Apply project template if selected
      if (selectedTemplate) {
        await fetch(`/api/project-templates/${selectedTemplate}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: data.id }),
        });
      }
      router.push(`/dashboard/projects/${data.id}`);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <Link href="/dashboard/projects" className="text-sm text-gray-500 hover:text-gray-700">
          ← Back to Projects
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">New Project</h1>
      </div>

      {error === "__PLAN_LIMIT__" && (
        <div role="alert" className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-amber-800 font-semibold text-sm mb-1">Free plan limit reached</p>
          <p className="text-amber-700 text-sm mb-3">
            The free plan includes 1 project. Upgrade to create unlimited projects.
          </p>
          <a
            href="/pricing"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
          >
            View Plans →
          </a>
        </div>
      )}
      {error && error !== "__PLAN_LIMIT__" && (
        <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5" aria-label="New project form">
        {/* Basic Info */}
        <div>
          <label htmlFor="np-name" className="block text-sm font-medium text-gray-700 mb-1">Project Name *</label>
          <input id="np-name" name="name" required value={form.name} onChange={handleChange}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Residential Building — Kathmandu" />
        </div>

        <div>
          <label htmlFor="np-desc" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea id="np-desc" name="description" value={form.description} onChange={handleChange} rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Brief project description..." />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="np-clientName" className="block text-sm font-medium text-gray-700 mb-1">Client Name</label>
            <input id="np-clientName" name="clientName" type="text" value={form.clientName} onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ram Bahadur Thapa" />
          </div>
          <div>
            <label htmlFor="np-clientCompany" className="block text-sm font-medium text-gray-700 mb-1">Client Company</label>
            <input id="np-clientCompany" name="clientCompany" type="text" value={form.clientCompany} onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Nagarpalika / Company name" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="np-bidDueDate" className="block text-sm font-medium text-gray-700 mb-1">Bid Due Date</label>
            <input id="np-bidDueDate" name="bidDueDate" type="date" value={form.bidDueDate} onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label htmlFor="np-estimatedValue" className="block text-sm font-medium text-gray-700 mb-1">Estimated Value (NRS)</label>
            <input id="np-estimatedValue" name="estimatedValue" type="number" value={form.estimatedValue} onChange={handleChange} min="0"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="np-district" className="block text-sm font-medium text-gray-700 mb-1">District</label>
            <select id="np-district" name="district" value={form.district} onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select district</option>
              {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="np-seismicZone" className="block text-sm font-medium text-gray-700 mb-1">Seismic Zone</label>
            <select id="np-seismicZone" name="seismicZone" value={form.seismicZone} onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select zone</option>
              <option value="Zone I">Zone I (Low)</option>
              <option value="Zone II">Zone II (Moderate)</option>
              <option value="Zone III">Zone III (High)</option>
              <option value="Zone IV">Zone IV (Very High)</option>
              <option value="Zone V">Zone V (Severe)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="np-unitSystem" className="block text-sm font-medium text-gray-700 mb-1">Unit System</label>
            <select id="np-unitSystem" name="unitSystem" value={form.unitSystem} onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="METRIC">Metric (m, m², m³)</option>
              <option value="IMPERIAL">Imperial (ft, ft², ft³)</option>
            </select>
          </div>
          <div>
            <label htmlFor="np-dateFormat" className="block text-sm font-medium text-gray-700 mb-1">Date Format</label>
            <select id="np-dateFormat" name="dateFormat" value={form.dateFormat} onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="AD">AD (Gregorian)</option>
              <option value="BS">BS (Bikram Sambat)</option>
            </select>
          </div>
        </div>

        {/* Tax Settings */}
        <div className="border-t border-gray-100 pt-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Tax Settings</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <input type="checkbox" name="vatEnabled" id="vatEnabled" checked={form.vatEnabled} onChange={handleChange}
                className="w-4 h-4 text-blue-600 rounded" />
              <label htmlFor="vatEnabled" className="text-sm text-gray-700">VAT Enabled</label>
              {form.vatEnabled && (
                <input type="number" name="vatRate" id="np-vatRate" value={form.vatRate} onChange={handleChange} step="0.1" min="0" max="100"
                  aria-label="VAT rate percentage"
                  className="w-20 border border-gray-300 rounded px-2 py-1 text-sm" />
              )}
              {form.vatEnabled && <span className="text-sm text-gray-500" aria-hidden>%</span>}
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" name="tdsEnabled" id="tdsEnabled" checked={form.tdsEnabled} onChange={handleChange}
                className="w-4 h-4 text-blue-600 rounded" />
              <label htmlFor="tdsEnabled" className="text-sm text-gray-700">TDS Enabled</label>
              {form.tdsEnabled && (
                <input type="number" name="tdsRate" id="np-tdsRate" value={form.tdsRate} onChange={handleChange} step="0.1" min="0" max="100"
                  aria-label="TDS rate percentage"
                  className="w-20 border border-gray-300 rounded px-2 py-1 text-sm" />
              )}
              {form.tdsEnabled && <span className="text-sm text-gray-500" aria-hidden>%</span>}
            </div>
          </div>
        </div>

        {templates.length > 0 && (
          <div>
            <label htmlFor="np-template" className="block text-sm font-medium text-gray-700 mb-1">Apply Project Template (optional)</label>
            <select id="np-template" value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— No template —</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.description ? ` — ${t.description}` : ""}</option>)}
            </select>
            <p className="text-xs text-gray-600 mt-1">Applies disciplines and takeoff groups from the selected template.</p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded-lg text-sm transition disabled:opacity-50">
            {loading ? "Creating..." : "Create Project"}
          </button>
          <Link href="/dashboard/projects"
            className="px-6 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
