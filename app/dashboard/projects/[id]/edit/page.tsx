"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
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

export default function EditProjectPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "", description: "",
    clientName: "", clientCompany: "",
    bidDueDate: "", estimatedValue: "",
    district: "", seismicZone: "",
    unitSystem: "METRIC", dateFormat: "AD",
    vatEnabled: true, vatRate: 13,
    tdsEnabled: false, tdsRate: 1.5,
  });

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setForm({
          name: data.name ?? "",
          description: data.description ?? "",
          clientName: data.clientName ?? "",
          clientCompany: data.clientCompany ?? "",
          bidDueDate: data.bidDueDate ? data.bidDueDate.slice(0, 10) : "",
          estimatedValue: data.estimatedValue != null ? String(data.estimatedValue) : "",
          district: data.district ?? "",
          seismicZone: data.seismicZone ?? "",
          unitSystem: data.unitSystem ?? "METRIC",
          dateFormat: data.dateFormat ?? "AD",
          vatEnabled: data.vatEnabled ?? true,
          vatRate: data.vatRate ?? 13,
          tdsEnabled: data.tdsEnabled ?? false,
          tdsRate: data.tdsRate ?? 1.5,
        });
        setLoading(false);
      })
      .catch(() => { setError("Failed to load project."); setLoading(false); });
  }, [id]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value, type } = e.target;
    setForm((f) => ({
      ...f,
      [name]: type === "checkbox"
        ? (e.target as HTMLInputElement).checked
        : type === "number" ? parseFloat(value) || 0
        : value,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    const payload = {
      ...form,
      estimatedValue: form.estimatedValue !== "" ? parseFloat(form.estimatedValue) : undefined,
      bidDueDate: form.bidDueDate ? new Date(form.bidDueDate).toISOString() : undefined,
    };

    const res = await fetch(`/api/projects/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error?.message ?? "Failed to save changes.");
    } else {
      router.push(`/dashboard/projects/${id}`);
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="h-8 bg-gray-200 rounded w-48 animate-pulse mb-4" />
        <div className="h-96 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <Link href={`/dashboard/projects/${id}`} className="text-sm text-gray-500 hover:text-gray-700">
          ← Back to Project
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Edit Project</h1>
      </div>

      {error && (
        <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <label htmlFor="edit-name" className="block text-sm font-medium text-gray-700 mb-1">Project Name *</label>
          <input id="edit-name" name="name" required value={form.name} onChange={handleChange}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label htmlFor="edit-description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea id="edit-description" name="description" value={form.description} onChange={handleChange} rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="edit-clientName" className="block text-sm font-medium text-gray-700 mb-1">Client Name</label>
            <input id="edit-clientName" name="clientName" type="text" value={form.clientName} onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label htmlFor="edit-clientCompany" className="block text-sm font-medium text-gray-700 mb-1">Client Company</label>
            <input id="edit-clientCompany" name="clientCompany" type="text" value={form.clientCompany} onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="edit-bidDueDate" className="block text-sm font-medium text-gray-700 mb-1">Bid Due Date</label>
            <input id="edit-bidDueDate" name="bidDueDate" type="date" value={form.bidDueDate} onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label htmlFor="edit-estimatedValue" className="block text-sm font-medium text-gray-700 mb-1">Estimated Value (NRS)</label>
            <input id="edit-estimatedValue" name="estimatedValue" type="number" value={form.estimatedValue} onChange={handleChange} min="0"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="edit-district" className="block text-sm font-medium text-gray-700 mb-1">District</label>
            <select id="edit-district" name="district" value={form.district} onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select district</option>
              {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="edit-seismicZone" className="block text-sm font-medium text-gray-700 mb-1">Seismic Zone</label>
            <select id="edit-seismicZone" name="seismicZone" value={form.seismicZone} onChange={handleChange}
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
            <label htmlFor="edit-unitSystem" className="block text-sm font-medium text-gray-700 mb-1">Unit System</label>
            <select id="edit-unitSystem" name="unitSystem" value={form.unitSystem} onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="METRIC">Metric (m, m², m³)</option>
              <option value="IMPERIAL">Imperial (ft, ft², ft³)</option>
            </select>
          </div>
          <div>
            <label htmlFor="edit-dateFormat" className="block text-sm font-medium text-gray-700 mb-1">Date Format</label>
            <select id="edit-dateFormat" name="dateFormat" value={form.dateFormat} onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="AD">AD (Gregorian)</option>
              <option value="BS">BS (Bikram Sambat)</option>
            </select>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Tax Settings</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <input type="checkbox" name="vatEnabled" id="vatEnabled" checked={form.vatEnabled} onChange={handleChange}
                className="w-4 h-4 text-blue-600 rounded" />
              <label htmlFor="vatEnabled" className="text-sm text-gray-700">VAT</label>
              {form.vatEnabled && (
                <input type="number" name="vatRate" value={form.vatRate} onChange={handleChange} step="0.1" min="0" max="100"
                  className="w-20 border border-gray-300 rounded px-2 py-1 text-sm" />
              )}
              {form.vatEnabled && <span className="text-sm text-gray-500">%</span>}
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" name="tdsEnabled" id="tdsEnabled" checked={form.tdsEnabled} onChange={handleChange}
                className="w-4 h-4 text-blue-600 rounded" />
              <label htmlFor="tdsEnabled" className="text-sm text-gray-700">TDS</label>
              {form.tdsEnabled && (
                <input type="number" name="tdsRate" value={form.tdsRate} onChange={handleChange} step="0.1" min="0" max="100"
                  className="w-20 border border-gray-300 rounded px-2 py-1 text-sm" />
              )}
              {form.tdsEnabled && <span className="text-sm text-gray-500">%</span>}
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded-lg text-sm transition disabled:opacity-50">
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <Link href={`/dashboard/projects/${id}`}
            className="px-6 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
