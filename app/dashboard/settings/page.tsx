"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Profile = { id: string; name: string; email: string; role: string };
type Org = { id: string; name: string; panNumber: string | null; logoUrl: string | null; address: string | null; phone: string | null; plan: string };

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [activeTab, setActiveTab] = useState<"profile" | "org" | "password">("profile");

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

  // Org form
  const [orgForm, setOrgForm] = useState({ name: "", panNumber: "", logoUrl: "", address: "", phone: "" });
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgMsg, setOrgMsg] = useState("");
  const [orgError, setOrgError] = useState("");

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
    setPwdError(""); setPwdMsg("");
    if (newPwd !== confirmPwd) { setPwdError("New passwords do not match."); return; }
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

  const tabs = [
    { id: "profile", label: "My Profile" },
    { id: "password", label: "Change Password" },
    ...(org && profile?.role === "OWNER" ? [{ id: "org", label: "Organisation" }] : []),
  ] as { id: typeof activeTab; label: string }[];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard" className="text-sm text-gray-400 hover:text-gray-600">← Dashboard</Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl font-bold text-gray-800">Settings</h1>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${activeTab === t.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">

          {/* Profile tab */}
          {activeTab === "profile" && (
            <form onSubmit={saveProfile} className="space-y-4">
              <h2 className="font-semibold text-gray-800 mb-4">My Profile</h2>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Full Name</label>
                <input value={name} onChange={e => setName(e.target.value)} required className={inputCls} />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Email</label>
                <input value={profile?.email ?? ""} disabled className={`${inputCls} bg-gray-50 text-gray-400`} />
                <p className="text-xs text-gray-400 mt-1">Email cannot be changed.</p>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Role</label>
                <input value={profile?.role ?? ""} disabled className={`${inputCls} bg-gray-50 text-gray-400`} />
              </div>
              {profileMsg && <p className="text-sm text-green-700 bg-green-50 rounded px-3 py-2">{profileMsg}</p>}
              <button type="submit" disabled={profileSaving}
                className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {profileSaving ? "Saving…" : "Save Profile"}
              </button>
            </form>
          )}

          {/* Password tab */}
          {activeTab === "password" && (
            <form onSubmit={changePassword} className="space-y-4">
              <h2 className="font-semibold text-gray-800 mb-4">Change Password</h2>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Current Password</label>
                <input type="password" required value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">New Password</label>
                <input type="password" required value={newPwd} onChange={e => setNewPwd(e.target.value)} className={inputCls} />
                <p className="text-xs text-gray-400 mt-1">Minimum 8 characters, must include uppercase, lowercase, and a number.</p>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Confirm New Password</label>
                <input type="password" required value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} className={inputCls} />
              </div>
              {pwdError && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{pwdError}</p>}
              {pwdMsg && <p className="text-sm text-green-700 bg-green-50 rounded px-3 py-2">{pwdMsg}</p>}
              <button type="submit" disabled={pwdSaving}
                className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {pwdSaving ? "Updating…" : "Update Password"}
              </button>
            </form>
          )}

          {/* Org tab — OWNER only */}
          {activeTab === "org" && org && (
            <form onSubmit={saveOrg} className="space-y-4">
              <h2 className="font-semibold text-gray-800 mb-4">Organisation Settings</h2>
              <div className="flex items-center gap-2 text-xs text-indigo-600 bg-indigo-50 rounded px-3 py-2 mb-2">
                Plan: <span className="font-bold">{org.plan}</span>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Organisation Name</label>
                <input required value={orgForm.name} onChange={e => setOrgForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">PAN Number</label>
                  <input value={orgForm.panNumber} onChange={e => setOrgForm(f => ({ ...f, panNumber: e.target.value }))} placeholder="e.g. 123456789" className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Phone</label>
                  <input value={orgForm.phone} onChange={e => setOrgForm(f => ({ ...f, phone: e.target.value }))} placeholder="e.g. +977-1-XXXXXXX" className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Address</label>
                <input value={orgForm.address} onChange={e => setOrgForm(f => ({ ...f, address: e.target.value }))} placeholder="e.g. Kathmandu, Nepal" className={inputCls} />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Logo URL (for tender documents)</label>
                <input type="url" value={orgForm.logoUrl} onChange={e => setOrgForm(f => ({ ...f, logoUrl: e.target.value }))} placeholder="https://..." className={inputCls} />
                <p className="text-xs text-gray-400 mt-1">Used on tender bundle cover pages. Must be a publicly accessible URL.</p>
              </div>
              {orgForm.logoUrl && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <img src={orgForm.logoUrl} alt="Logo preview" className="h-10 w-10 object-contain rounded" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <span className="text-xs text-gray-500">Logo preview</span>
                </div>
              )}
              {orgError && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{orgError}</p>}
              {orgMsg && <p className="text-sm text-green-700 bg-green-50 rounded px-3 py-2">{orgMsg}</p>}
              <button type="submit" disabled={orgSaving}
                className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {orgSaving ? "Saving…" : "Save Organisation Settings"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
