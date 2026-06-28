"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Profile = { id: string; name: string; email: string; role: string };
type Org = { id: string; name: string; panNumber: string | null; logoUrl: string | null; address: string | null; phone: string | null; plan: string; storageUsedBytes: number | string };

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [activeTab, setActiveTab] = useState<"profile" | "org" | "password" | "review">("profile");

  // Review form state
  const [review, setReview] = useState({ content: "", authorRole: "", company: "", rating: 5 });
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewMsg, setReviewMsg] = useState("");
  const [reviewError, setReviewError] = useState("");

  // Profile form
  const [name, setName] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");

  // Password form
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg, setPwdMsg] = useState("");
  const [pwdError, setPwdError] = useState("");
  const [pwdConfirmError, setPwdConfirmError] = useState("");

  // Org form
  const [orgForm, setOrgForm] = useState({ name: "", panNumber: "", logoUrl: "", address: "", phone: "" });
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgMsg, setOrgMsg] = useState("");
  const [orgError, setOrgError] = useState("");

  // Coupon redemption
  const [couponCode, setCouponCode] = useState("");
  const [couponSaving, setCouponSaving] = useState(false);
  const [couponMsg, setCouponMsg] = useState("");
  const [couponError, setCouponError] = useState("");

  useEffect(() => {
    fetch("/api/auth/profile").then(r => r.json()).then(d => { setProfile(d); setName(d.name ?? ""); });
    fetch("/api/orgs/me").then(r => r.ok ? r.json() : null).then(d => {
      if (d) { setOrg(d); setOrgForm({ name: d.name ?? "", panNumber: d.panNumber ?? "", logoUrl: d.logoUrl ?? "", address: d.address ?? "", phone: d.phone ?? "" }); }
    });
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileSaving(true); setProfileMsg("");
    const res = await fetch("/api/auth/profile", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setProfileSaving(false);
    if (res.ok) { setProfileMsg("Profile updated."); setProfile(p => p ? { ...p, name } : p); }
    else { const d = await res.json(); setProfileMsg(d?.error?.message ?? "Failed."); }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdError(""); setPwdMsg(""); setPwdConfirmError("");
    if (newPwd !== confirmPwd) { setPwdConfirmError("Passwords do not match."); return; }
    setPwdSaving(true);
    const res = await fetch("/api/auth/change-password", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd }),
    });
    const d = await res.json();
    setPwdSaving(false);
    if (res.ok) { setPwdMsg("Password changed successfully."); setCurrentPwd(""); setNewPwd(""); setConfirmPwd(""); }
    else setPwdError(d?.error?.message ?? "Failed.");
  }

  async function saveOrg(e: React.FormEvent) {
    e.preventDefault();
    setOrgSaving(true); setOrgMsg(""); setOrgError("");
    const res = await fetch("/api/orgs/me", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orgForm),
    });
    const d = await res.json();
    setOrgSaving(false);
    if (res.ok) { setOrgMsg("Organisation settings saved."); setOrg(d); }
    else setOrgError(d?.error?.message ?? "Failed.");
  }

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    if (review.content.trim().length < 20) { setReviewError("Please write at least 20 characters."); return; }
    setReviewSaving(true); setReviewMsg(""); setReviewError("");
    const res = await fetch("/api/testimonials", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...review, authorName: profile?.name ?? "Anonymous" }),
    });
    const d = await res.json();
    setReviewSaving(false);
    if (res.ok) { setReviewMsg(d.message); setReview({ content: "", authorRole: "", company: "", rating: 5 }); }
    else setReviewError(d.error?.message ?? "Failed to submit.");
  }

  async function redeemCoupon(e: React.FormEvent) {
    e.preventDefault();
    setCouponError(""); setCouponMsg("");
    if (!couponCode.trim()) { setCouponError("Enter a coupon code."); return; }
    setCouponSaving(true);
    const res = await fetch("/api/coupons/redeem", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: couponCode.trim() }),
    });
    const d = await res.json();
    setCouponSaving(false);
    if (res.ok) { setCouponMsg(d.message); setCouponCode(""); }
    else setCouponError(d?.error?.message ?? "Failed to redeem coupon.");
  }

  const tabs = [
    { id: "profile", label: "My Profile" },
    { id: "password", label: "Change Password" },
    ...(org && profile?.role === "OWNER" ? [{ id: "org", label: "Organisation" }] : []),
    { id: "billing", label: "Billing" },
    { id: "review", label: "Leave a Review" },
  ] as { id: typeof activeTab; label: string }[];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-600">← Dashboard</Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl font-bold text-gray-800">Settings</h1>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6" role="tablist" aria-label="Settings sections">
          {tabs.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              aria-controls={`tab-panel-${t.id}`}
              id={`tab-${t.id}`}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${activeTab === t.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">

          {/* Profile tab */}
          {activeTab === "profile" && (
            <form
              id="tab-panel-profile"
              role="tabpanel"
              aria-labelledby="tab-profile"
              onSubmit={saveProfile}
              className="space-y-4"
            >
              <h2 className="font-semibold text-gray-800 mb-4">My Profile</h2>
              {!profile && (
                <div className="flex items-center gap-2 py-4" aria-label="Loading profile">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" aria-hidden />
                  <p className="text-sm text-gray-600">Loading…</p>
                </div>
              )}
              <div>
                <label htmlFor="sp-name" className="block text-sm text-gray-700 mb-1">Full Name</label>
                <input id="sp-name" value={name} onChange={e => setName(e.target.value)} required className={inputCls} />
              </div>
              <div>
                <label htmlFor="sp-email" className="block text-sm text-gray-700 mb-1">Email</label>
                <input id="sp-email" value={profile?.email ?? ""} disabled className={`${inputCls} bg-gray-50 text-gray-600`} />
                <p className="text-xs text-gray-600 mt-1">Email cannot be changed.</p>
              </div>
              <div>
                <label htmlFor="sp-role" className="block text-sm text-gray-700 mb-1">Role</label>
                <input id="sp-role" value={profile?.role ?? ""} disabled className={`${inputCls} bg-gray-50 text-gray-600`} />
              </div>
              {profileMsg && <p role="status" className="text-sm text-green-700 bg-green-50 rounded px-3 py-2">{profileMsg}</p>}
              <button type="submit" disabled={profileSaving}
                className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {profileSaving ? "Saving…" : "Save Profile"}
              </button>
            </form>
          )}

          {/* Password tab */}
          {activeTab === "password" && (
            <form
              id="tab-panel-password"
              role="tabpanel"
              aria-labelledby="tab-password"
              onSubmit={changePassword}
              className="space-y-4"
            >
              <h2 className="font-semibold text-gray-800 mb-4">Change Password</h2>
              <div>
                <label htmlFor="sp-current-pwd" className="block text-sm text-gray-700 mb-1">Current Password</label>
                <input id="sp-current-pwd" type="password" required autoComplete="current-password" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="sp-new-pwd" className="block text-sm text-gray-700 mb-1">New Password</label>
                <input id="sp-new-pwd" type="password" required autoComplete="new-password" value={newPwd} onChange={e => setNewPwd(e.target.value)} className={inputCls} />
                <p className="text-xs text-gray-600 mt-1">Minimum 8 characters, must include uppercase, lowercase, and a number.</p>
              </div>
              <div>
                <label htmlFor="sp-confirm-pwd" className="block text-sm text-gray-700 mb-1">Confirm New Password</label>
                <input
                  id="sp-confirm-pwd"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirmPwd}
                  onChange={e => { setConfirmPwd(e.target.value); setPwdConfirmError(""); }}
                  aria-describedby={pwdConfirmError ? "sp-confirm-pwd-err" : undefined}
                  aria-invalid={!!pwdConfirmError}
                  className={pwdConfirmError ? `${inputCls} border-red-500 focus:ring-red-500` : inputCls}
                />
                {pwdConfirmError && <p id="sp-confirm-pwd-err" role="alert" className="text-red-600 text-xs mt-1">{pwdConfirmError}</p>}
              </div>
              {pwdError && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{pwdError}</p>}
              {pwdMsg && <p role="status" className="text-sm text-green-700 bg-green-50 rounded px-3 py-2">{pwdMsg}</p>}
              <button type="submit" disabled={pwdSaving}
                className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {pwdSaving ? "Updating…" : "Update Password"}
              </button>
            </form>
          )}

          {/* Org tab — OWNER only */}
          {activeTab === "org" && org && (
            <form
              id="tab-panel-org"
              role="tabpanel"
              aria-labelledby="tab-org"
              onSubmit={saveOrg}
              className="space-y-4"
            >
              <h2 className="font-semibold text-gray-800 mb-4">Organisation Settings</h2>
              <div className="flex items-center gap-2 text-xs text-indigo-600 bg-indigo-50 rounded px-3 py-2 mb-2">
                Plan: <span className="font-bold">{org.plan}</span>
              </div>

              {/* Storage usage bar */}
              {(() => {
                const LIMIT = 10 * 1024 * 1024 * 1024; // 10 GB in bytes
                const used = Number(org.storageUsedBytes ?? 0);
                const pct = Math.min(100, (used / LIMIT) * 100);
                const usedGB = (used / (1024 ** 3)).toFixed(2);
                const barColor = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-blue-500";
                return (
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className="flex items-center justify-between text-xs text-gray-600 mb-1.5">
                      <span className="font-medium">Storage</span>
                      <span>{usedGB} GB of 10 GB used</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                    {pct >= 90 && (
                      <p className="text-xs text-red-600 mt-1.5">Storage almost full. Delete old drawings to free space.</p>
                    )}
                  </div>
                );
              })()}
              <div>
                <label htmlFor="sp-org-name" className="block text-sm text-gray-700 mb-1">Organisation Name</label>
                <input id="sp-org-name" required value={orgForm.name} onChange={e => setOrgForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="sp-pan" className="block text-sm text-gray-700 mb-1">PAN Number</label>
                  <input id="sp-pan" value={orgForm.panNumber} onChange={e => setOrgForm(f => ({ ...f, panNumber: e.target.value }))} placeholder="e.g. 123456789" className={inputCls} />
                </div>
                <div>
                  <label htmlFor="sp-phone" className="block text-sm text-gray-700 mb-1">Phone</label>
                  <input id="sp-phone" value={orgForm.phone} onChange={e => setOrgForm(f => ({ ...f, phone: e.target.value }))} placeholder="e.g. +977-1-XXXXXXX" className={inputCls} />
                </div>
              </div>
              <div>
                <label htmlFor="sp-address" className="block text-sm text-gray-700 mb-1">Address</label>
                <input id="sp-address" value={orgForm.address} onChange={e => setOrgForm(f => ({ ...f, address: e.target.value }))} placeholder="e.g. Kathmandu, Nepal" className={inputCls} />
              </div>
              <div>
                <label htmlFor="sp-logo" className="block text-sm text-gray-700 mb-1">Logo URL (for tender documents)</label>
                <input id="sp-logo" type="url" value={orgForm.logoUrl} onChange={e => setOrgForm(f => ({ ...f, logoUrl: e.target.value }))} placeholder="https://..." className={inputCls} />
                <p className="text-xs text-gray-600 mt-1">Used on tender bundle cover pages. Must be a publicly accessible URL.</p>
              </div>
              {orgForm.logoUrl && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <img src={orgForm.logoUrl} alt="Organisation logo preview" className="h-10 w-10 object-contain rounded" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <span className="text-xs text-gray-500">Logo preview</span>
                </div>
              )}
              {orgError && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{orgError}</p>}
              {orgMsg && <p role="status" className="text-sm text-green-700 bg-green-50 rounded px-3 py-2">{orgMsg}</p>}
              <button type="submit" disabled={orgSaving}
                className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {orgSaving ? "Saving…" : "Save Organisation Settings"}
              </button>
            </form>
          )}
          {/* Review tab */}
          {activeTab === "review" && (
            <form
              id="tab-panel-review"
              role="tabpanel"
              aria-labelledby="tab-review"
              onSubmit={submitReview}
              className="space-y-4"
            >
              <h2 className="font-semibold text-gray-800 mb-1">Leave a Review</h2>
              <p className="text-xs text-gray-500 mb-4">
                Your review will appear on the Estimate Nepal website after our team approves it.
              </p>

              <div>
                <label htmlFor="rev-rating" className="block text-sm text-gray-700 mb-1">Rating</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setReview(r => ({ ...r, rating: n }))}
                      className={`text-2xl transition ${n <= review.rating ? "text-amber-400" : "text-gray-300"}`}
                      aria-label={`${n} star${n > 1 ? "s" : ""}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="rev-content" className="block text-sm text-gray-700 mb-1">Your Review</label>
                <textarea
                  id="rev-content"
                  rows={4}
                  required
                  value={review.content}
                  onChange={e => setReview(r => ({ ...r, content: e.target.value }))}
                  placeholder="Tell us how Estimate Nepal has helped your work…"
                  className={inputCls + " resize-none"}
                />
                <p className="text-xs text-gray-400 mt-0.5">{review.content.length}/1000 — minimum 20 characters</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="rev-role" className="block text-sm text-gray-700 mb-1">Your Role (optional)</label>
                  <input id="rev-role" value={review.authorRole} onChange={e => setReview(r => ({ ...r, authorRole: e.target.value }))} placeholder="e.g. Senior Estimator" className={inputCls} />
                </div>
                <div>
                  <label htmlFor="rev-company" className="block text-sm text-gray-700 mb-1">Company (optional)</label>
                  <input id="rev-company" value={review.company} onChange={e => setReview(r => ({ ...r, company: e.target.value }))} placeholder="e.g. Sharma Construction" className={inputCls} />
                </div>
              </div>

              {reviewError && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{reviewError}</p>}
              {reviewMsg && <p role="status" className="text-sm text-green-700 bg-green-50 rounded px-3 py-2">{reviewMsg}</p>}

              <button type="submit" disabled={reviewSaving}
                className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {reviewSaving ? "Submitting…" : "Submit Review"}
              </button>
            </form>
          )}

          {/* Billing tab */}
          {activeTab === "billing" && (
            <div id="tab-panel-billing" role="tabpanel" aria-labelledby="tab-billing" className="space-y-6">
              <h2 className="font-semibold text-gray-800">Billing &amp; Plan</h2>

              {/* Current plan */}
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Current Plan</p>
                <p className="text-lg font-bold text-gray-900">{org?.plan ?? "FREE"}</p>
                <p className="text-sm text-gray-500 mt-1">
                  <a href="/#pricing" className="text-blue-600 hover:underline">View pricing →</a>
                </p>
              </div>

              {/* Coupon redemption */}
              <form onSubmit={redeemCoupon} className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-800">Redeem Activation Code</h3>
                <p className="text-xs text-gray-500">
                  Received a code after payment? Enter it here to activate your plan.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponCode}
                    onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponError(""); }}
                    placeholder="NE-XXXX-XXXX"
                    className={`${inputCls} font-mono tracking-widest flex-1`}
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <button
                    type="submit"
                    disabled={couponSaving}
                    className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                  >
                    {couponSaving ? "Activating…" : "Activate"}
                  </button>
                </div>
                {couponError && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{couponError}</p>}
                {couponMsg && <p role="status" className="text-sm text-green-700 bg-green-50 rounded px-3 py-2">{couponMsg}</p>}
              </form>

              <div className="pt-4 border-t border-gray-100 text-xs text-gray-400">
                Need to upgrade? <a href="/#pricing" className="text-blue-600 hover:underline">See plans</a> or{" "}
                <a href="/checkout" className="text-blue-600 hover:underline">pay now</a>.
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
