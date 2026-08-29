"use client";

import { useState, useRef, FormEvent, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

interface BoqGroupData {
  name: string;
  unit: string;
  totalQuantity: number;
}

interface BoqDisciplineData {
  name: string;
  groups: BoqGroupData[];
}

interface EstimationSnapshot {
  id: string;
  name: string;
  district: string;
  estimatedValue: number | null;
  disciplines: BoqDisciplineData[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1_048_576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

const DRAFT_KEY = "bid-new-tender-draft";

type DraftData = {
  savedAt: string;
  title: string;
  description: string;
  district: string;
  tenderType: "PUBLIC" | "INVITATION_ONLY";
  bidDeadline: string;
  qandaDeadline: string;
  estimatedValue: string;
  quantityVisibility: "HIDDEN" | "VISIBLE";
  siteVisitRequired: boolean;
  siteVisitDate: string;
  siteVisitLocation: string;
  showBidderCount: boolean;
  showEstimatedValue: boolean;
  showClientIdentity: boolean;
  requireRtbApproval: boolean;
  bidSecurityRequired: boolean;
  bidSecurityPct: string;
  instructions: string;
};

function getDraft(): DraftData | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftData;
    if (!parsed.savedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function fmtAge(isoStr: string): string {
  const diffMs = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 minute ago";
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs === 1) return "1 hour ago";
  if (hrs < 24) return `${hrs} hours ago`;
  return `${Math.floor(hrs / 24)} days ago`;
}

interface FieldProps {
  label: string;
  id: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  hint?: string;
  rows?: number;
  min?: string;
  step?: string;
}

function Field({ label, id, type = "text", value, onChange, required, hint, rows, min, step }: FieldProps) {
  const base =
    "mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm " +
    "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}{required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {rows ? (
        <textarea id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} required={required} className={base} />
      ) : (
        <input id={id} type={type} value={value} min={min} step={step} onChange={(e) => onChange(e.target.value)} required={required} className={base} />
      )}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function CheckField({ label, id, checked, onChange, hint }: {
  label: string; id: string; checked: boolean; onChange: (v: boolean) => void; hint?: string;
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 cursor-pointer">
      <input type="checkbox" id={id} checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
      <span>
        <span className="text-sm text-gray-700">{label}</span>
        {hint && <span className="block text-xs text-gray-400">{hint}</span>}
      </span>
    </label>
  );
}

const MAX_DRAWINGS = 30;
const MAX_SIZE_BYTES = 50 * 1024 * 1024;

const INITIAL_STATE = {
  title: "", description: "", district: "",
  tenderType: "PUBLIC" as "PUBLIC" | "INVITATION_ONLY",
  bidDeadline: "", qandaDeadline: "", estimatedValue: "",
  quantityVisibility: "HIDDEN" as "HIDDEN" | "VISIBLE",
  siteVisitRequired: false, siteVisitDate: "", siteVisitLocation: "",
  showBidderCount: false, showEstimatedValue: false, showClientIdentity: true,
  requireRtbApproval: false, bidSecurityRequired: false, bidSecurityPct: "", instructions: "",
};

function NewTenderForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");

  const [title, setTitle] = useState(INITIAL_STATE.title);
  const [description, setDescription] = useState(INITIAL_STATE.description);
  const [district, setDistrict] = useState(INITIAL_STATE.district);
  const [tenderType, setTenderType] = useState<"PUBLIC" | "INVITATION_ONLY">(INITIAL_STATE.tenderType);
  const [bidDeadline, setBidDeadline] = useState(INITIAL_STATE.bidDeadline);
  const [qandaDeadline, setQandaDeadline] = useState(INITIAL_STATE.qandaDeadline);
  const [estimatedValue, setEstimatedValue] = useState(INITIAL_STATE.estimatedValue);
  const [quantityVisibility, setQuantityVisibility] = useState<"HIDDEN" | "VISIBLE">(INITIAL_STATE.quantityVisibility);
  const [siteVisitRequired, setSiteVisitRequired] = useState(INITIAL_STATE.siteVisitRequired);
  const [siteVisitDate, setSiteVisitDate] = useState(INITIAL_STATE.siteVisitDate);
  const [siteVisitLocation, setSiteVisitLocation] = useState(INITIAL_STATE.siteVisitLocation);
  const [showBidderCount, setShowBidderCount] = useState(INITIAL_STATE.showBidderCount);
  const [showEstimatedValue, setShowEstimatedValue] = useState(INITIAL_STATE.showEstimatedValue);
  const [showClientIdentity, setShowClientIdentity] = useState(INITIAL_STATE.showClientIdentity);
  const [requireRtbApproval, setRequireRtbApproval] = useState(INITIAL_STATE.requireRtbApproval);
  const [bidSecurityRequired, setBidSecurityRequired] = useState(INITIAL_STATE.bidSecurityRequired);
  const [bidSecurityPct, setBidSecurityPct] = useState(INITIAL_STATE.bidSecurityPct);
  const [instructions, setInstructions] = useState(INITIAL_STATE.instructions);

  const [drawingFiles, setDrawingFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const drawingInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [estSnapshot, setEstSnapshot] = useState<EstimationSnapshot | null>(null);
  const [boqLoading, setBoqLoading] = useState(false);
  const [boqError, setBoqError] = useState<string | null>(null);

  const [draftRestoredAt, setDraftRestoredAt] = useState<string | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (projectId) return;
    const draft = getDraft();
    if (!draft) return;
    setTitle(draft.title); setDescription(draft.description); setDistrict(draft.district);
    setTenderType(draft.tenderType); setBidDeadline(draft.bidDeadline); setQandaDeadline(draft.qandaDeadline);
    setEstimatedValue(draft.estimatedValue); setQuantityVisibility(draft.quantityVisibility);
    setSiteVisitRequired(draft.siteVisitRequired); setSiteVisitDate(draft.siteVisitDate);
    setSiteVisitLocation(draft.siteVisitLocation); setShowBidderCount(draft.showBidderCount);
    setShowEstimatedValue(draft.showEstimatedValue); setShowClientIdentity(draft.showClientIdentity);
    setRequireRtbApproval(draft.requireRtbApproval); setBidSecurityRequired(draft.bidSecurityRequired);
    setBidSecurityPct(draft.bidSecurityPct); setInstructions(draft.instructions);
    setDraftRestoredAt(draft.savedAt);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading) return;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      try {
        const draft: DraftData = {
          savedAt: new Date().toISOString(), title, description, district, tenderType,
          bidDeadline, qandaDeadline, estimatedValue, quantityVisibility, siteVisitRequired,
          siteVisitDate, siteVisitLocation, showBidderCount, showEstimatedValue, showClientIdentity,
          requireRtbApproval, bidSecurityRequired, bidSecurityPct, instructions,
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch { /* ignore */ }
    }, 500);
    return () => clearTimeout(autoSaveTimer.current);
  }, [loading, title, description, district, tenderType, bidDeadline, qandaDeadline, estimatedValue,
    quantityVisibility, siteVisitRequired, siteVisitDate, siteVisitLocation, showBidderCount,
    showEstimatedValue, showClientIdentity, requireRtbApproval, bidSecurityRequired, bidSecurityPct, instructions]);

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    setDraftRestoredAt(null);
    setTitle(INITIAL_STATE.title); setDescription(INITIAL_STATE.description); setDistrict(INITIAL_STATE.district);
    setTenderType(INITIAL_STATE.tenderType); setBidDeadline(INITIAL_STATE.bidDeadline);
    setQandaDeadline(INITIAL_STATE.qandaDeadline); setEstimatedValue(INITIAL_STATE.estimatedValue);
    setQuantityVisibility(INITIAL_STATE.quantityVisibility); setSiteVisitRequired(INITIAL_STATE.siteVisitRequired);
    setSiteVisitDate(INITIAL_STATE.siteVisitDate); setSiteVisitLocation(INITIAL_STATE.siteVisitLocation);
    setShowBidderCount(INITIAL_STATE.showBidderCount); setShowEstimatedValue(INITIAL_STATE.showEstimatedValue);
    setShowClientIdentity(INITIAL_STATE.showClientIdentity); setRequireRtbApproval(INITIAL_STATE.requireRtbApproval);
    setBidSecurityRequired(INITIAL_STATE.bidSecurityRequired); setBidSecurityPct(INITIAL_STATE.bidSecurityPct);
    setInstructions(INITIAL_STATE.instructions);
  }

  // Fetch Estimation BOQ snapshot when projectId present
  useEffect(() => {
    if (!projectId) return;
    setBoqLoading(true);
    setBoqError(null);
    fetch(`/api/internal/projects/${projectId}/boq-snapshot`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) { setBoqError(data.error?.message ?? "Could not load project data."); return; }
        const snap = data as EstimationSnapshot;
        setEstSnapshot(snap);
        setTitle(snap.name);
        if (snap.district) setDistrict(snap.district);
        if (snap.estimatedValue) setEstimatedValue(String(snap.estimatedValue));
      })
      .catch(() => setBoqError("Network error fetching project."))
      .finally(() => setBoqLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function handleDrawingChange(e: React.ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(e.target.files ?? []);
    setDrawingFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      const added = incoming.filter((f) => !existing.has(f.name));
      return [...prev, ...added].slice(0, MAX_DRAWINGS);
    });
    if (drawingInputRef.current) drawingInputRef.current.value = "";
  }

  function removeDrawing(name: string) {
    setDrawingFiles((prev) => prev.filter((f) => f.name !== name));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setUploadErrors([]);

    if (!bidDeadline) { setError("Bid deadline is required."); return; }

    const body: Record<string, unknown> = {
      title, description, district,
      tender_type: tenderType,
      bid_deadline: new Date(bidDeadline).toISOString(),
      quantity_visibility: quantityVisibility,
      site_visit_required: siteVisitRequired,
      show_bidder_count: showBidderCount,
      show_estimated_value_on_card: showEstimatedValue,
      show_client_identity_on_card: showClientIdentity,
      bid_security_required: bidSecurityRequired,
      bid_security_percentage: bidSecurityRequired && bidSecurityPct ? parseFloat(bidSecurityPct) : 0,
      require_rtb_approval: tenderType === "PUBLIC" ? requireRtbApproval : false,
    };

    if (qandaDeadline) body.qanda_deadline = new Date(qandaDeadline).toISOString();
    if (estimatedValue) body.estimated_value = parseFloat(estimatedValue);
    if (siteVisitRequired && siteVisitDate) body.site_visit_scheduled_at = new Date(siteVisitDate).toISOString();
    if (siteVisitRequired && siteVisitLocation) body.site_visit_location = siteVisitLocation;
    if (instructions) body.instructions_to_bidders = instructions;
    if (projectId) body.estimation_project_id = projectId;
    if (estSnapshot && estSnapshot.disciplines.length > 0) {
      body.boq_chapters = estSnapshot.disciplines.map((disc) => ({
        title: disc.name,
        items: disc.groups.map((grp) => ({
          description: grp.name,
          unit: grp.unit,
          client_quantity: grp.totalQuantity > 0 ? grp.totalQuantity : undefined,
        })),
      }));
    }

    setLoading(true);
    try {
      const res = await fetch("/api/tenders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) { router.push("/login"); return; }
        if (res.status === 403) { router.push("/client/tenders"); return; }
        setError(data.error?.message ?? "Failed to create tender.");
        return;
      }

      const tenderId: number = data.tender.id;

      if (drawingFiles.length > 0) {
        setUploadProgress({ current: 0, total: drawingFiles.length });
        const errors: string[] = [];
        for (let i = 0; i < drawingFiles.length; i++) {
          const file = drawingFiles[i];
          setUploadProgress({ current: i, total: drawingFiles.length });
          try {
            const fd = new FormData();
            fd.append("drawing", file);
            const uploadRes = await fetch(`/api/tenders/${tenderId}/drawings`, { method: "POST", body: fd });
            if (!uploadRes.ok) {
              const uploadData = await uploadRes.json();
              errors.push(`${file.name}: ${uploadData.error?.message ?? "Upload failed."}`);
            }
          } catch { errors.push(`${file.name}: Network error.`); }
          setUploadProgress({ current: i + 1, total: drawingFiles.length });
        }
        if (errors.length > 0) setUploadErrors(errors);
      }

      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      router.push("/client/tenders");
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); setUploadProgress(null); }
  }

  function handleCancel() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    router.push("/client/tenders");
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-2xl px-6">
        <div className="mb-6 flex items-center gap-3">
          <Link href="/client/tenders" className="text-sm text-gray-400 hover:text-gray-600">← My tenders</Link>
          <h1 className="text-xl font-bold text-gray-900">Create tender</h1>
        </div>

        {projectId && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
            {boqLoading && <p className="text-sm text-blue-700">Loading project data…</p>}
            {boqError && <p className="text-sm text-red-600">Could not load project: {boqError}</p>}
            {estSnapshot && !boqLoading && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-blue-800">Imported from Estimation: {estSnapshot.name}</p>
                <p className="text-xs text-blue-600">
                  Title, district, and BOQ structure have been pre-filled.{" "}
                  {estSnapshot.disciplines.reduce((n, d) => n + d.groups.length, 0)} line items across{" "}
                  {estSnapshot.disciplines.length} chapter{estSnapshot.disciplines.length !== 1 ? "s" : ""} will be
                  created automatically.
                </p>
                <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                  {estSnapshot.disciplines.map((disc) => (
                    <div key={disc.name}>
                      <p className="text-xs font-semibold text-blue-700">{disc.name}</p>
                      {disc.groups.map((grp) => (
                        <p key={grp.name} className="text-xs text-blue-500 pl-3">
                          {grp.name} · {grp.totalQuantity.toFixed(2)} {grp.unit}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {draftRestoredAt && (
          <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm text-amber-800">Draft restored from {fmtAge(draftRestoredAt)}.</p>
            <button type="button" onClick={clearDraft} className="shrink-0 text-xs font-medium text-amber-700 underline hover:text-amber-900">Clear draft</button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Basic information</h2>
            <Field label="Title" id="title" value={title} onChange={setTitle} required />
            <Field label="Description" id="description" value={description} onChange={setDescription} required rows={4} />
            <div className="grid grid-cols-2 gap-4">
              <Field label="District" id="district" value={district} onChange={setDistrict} required />
              <div>
                <label htmlFor="tender_type" className="block text-sm font-medium text-gray-700">
                  Tender type<span className="ml-1 text-red-500">*</span>
                </label>
                <select id="tender_type" value={tenderType} onChange={(e) => setTenderType(e.target.value as "PUBLIC" | "INVITATION_ONLY")} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option value="PUBLIC">Public</option>
                  <option value="INVITATION_ONLY">Invitation only</option>
                </select>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Deadlines &amp; value</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Bid deadline" id="bid_deadline" type="datetime-local" value={bidDeadline} onChange={setBidDeadline} required />
              <Field label="Q&amp;A deadline (optional)" id="qanda_deadline" type="datetime-local" value={qandaDeadline} onChange={setQandaDeadline} />
            </div>
            <Field label="Estimated value (NPR, optional)" id="estimated_value" type="number" min="0" step="0.01" value={estimatedValue} onChange={setEstimatedValue} />
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">Bill of quantities</h2>
            <p className="text-xs text-gray-500">Controls whether contractors can see the client-provided quantities.</p>
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="radio" name="qty_visibility" value="HIDDEN" checked={quantityVisibility === "HIDDEN"} onChange={() => setQuantityVisibility("HIDDEN")} className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span><span className="text-sm font-medium text-gray-700">Hidden</span><span className="block text-xs text-gray-400">Contractors must supply their own quantities</span></span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="radio" name="qty_visibility" value="VISIBLE" checked={quantityVisibility === "VISIBLE"} onChange={() => setQuantityVisibility("VISIBLE")} className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span><span className="text-sm font-medium text-gray-700">Visible</span><span className="block text-xs text-gray-400">Contractors see your quantities (can override with justification)</span></span>
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Site visit</h2>
            <CheckField label="Site visit required" id="site_visit_required" checked={siteVisitRequired} onChange={setSiteVisitRequired} />
            {siteVisitRequired && (
              <div className="grid grid-cols-2 gap-4 pl-7">
                <Field label="Scheduled date (optional)" id="site_visit_date" type="datetime-local" value={siteVisitDate} onChange={setSiteVisitDate} />
                <Field label="Location (optional)" id="site_visit_location" value={siteVisitLocation} onChange={setSiteVisitLocation} />
              </div>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">Tender card display</h2>
            <CheckField label="Show client identity on card" id="show_client_identity" checked={showClientIdentity} onChange={setShowClientIdentity} hint="Contractors will see your name on the listing" />
            <CheckField label="Show estimated value on card" id="show_estimated_value" checked={showEstimatedValue} onChange={setShowEstimatedValue} />
            <CheckField label="Show bidder count" id="show_bidder_count" checked={showBidderCount} onChange={setShowBidderCount} hint="Lets contractors see how many others have bid" />
          </section>

          {tenderType === "PUBLIC" && (
            <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">Bidding access</h2>
              <CheckField label="Require approval before contractors can bid" id="require_rtb_approval" checked={requireRtbApproval} onChange={setRequireRtbApproval} hint="When off, contractors can start bidding immediately after submitting a request." />
            </section>
          )}

          <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Bid security</h2>
            <CheckField label="Require bid security" id="bid_security_required" checked={bidSecurityRequired} onChange={setBidSecurityRequired} />
            {bidSecurityRequired && (
              <div className="pl-7 w-48">
                <Field label="Security percentage (%)" id="bid_security_pct" type="number" min="0" step="0.01" value={bidSecurityPct} onChange={setBidSecurityPct} />
              </div>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Instructions to bidders (optional)</h2>
            <Field label="" id="instructions" value={instructions} onChange={setInstructions} rows={5} hint="Shown to contractors on the tender detail page" />
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-700">Drawings (optional)</h2>
              <p className="mt-0.5 text-xs text-gray-400">PDF only · max 50 MB each · up to {MAX_DRAWINGS} files</p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer w-fit">
              <span className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100">+ Add PDF files</span>
              <input type="file" multiple accept=".pdf,application/pdf" ref={drawingInputRef} onChange={handleDrawingChange} className="sr-only" disabled={drawingFiles.length >= MAX_DRAWINGS} />
            </label>
            {drawingFiles.length > 0 && (
              <ul className="divide-y divide-gray-50 rounded-lg border border-gray-100">
                {drawingFiles.map((file) => {
                  const oversized = file.size > MAX_SIZE_BYTES;
                  return (
                    <li key={file.name} className="flex items-center justify-between px-3 py-2 first:rounded-t-lg last:rounded-b-lg">
                      <div className="min-w-0">
                        <p className={`text-sm truncate ${oversized ? "text-red-600" : "text-gray-800"}`}>{file.name}</p>
                        <p className={`text-xs ${oversized ? "text-red-500" : "text-gray-400"}`}>{formatBytes(file.size)}{oversized && " — exceeds 50 MB limit"}</p>
                      </div>
                      <button type="button" onClick={() => removeDrawing(file.name)} className="ml-4 shrink-0 text-xs text-gray-400 hover:text-red-500">Remove</button>
                    </li>
                  );
                })}
              </ul>
            )}
            {uploadErrors.length > 0 && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 space-y-1">
                <p className="text-xs font-semibold text-red-700">Some drawings failed to upload:</p>
                {uploadErrors.map((msg, i) => <p key={i} className="text-xs text-red-600">{msg}</p>)}
              </div>
            )}
          </section>

          <div className="flex justify-end gap-3 pb-8">
            <button type="button" onClick={handleCancel} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading || drawingFiles.some((f) => f.size > MAX_SIZE_BYTES)} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {uploadProgress ? `Uploading drawings (${uploadProgress.current}/${uploadProgress.total})…` : loading ? "Creating…" : "Create tender"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

export default function NewTenderPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-gray-50 py-8"><div className="mx-auto max-w-2xl px-6 text-sm text-gray-400">Loading…</div></main>}>
      <NewTenderForm />
    </Suspense>
  );
}
