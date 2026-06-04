"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";

interface InviteInfo {
  email: string;
  role: string;
  orgName: string;
  expiresAt: string;
}

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { data: session, status } = useSession();

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [fetchError, setFetchError] = useState("");

  // Registration fields (for new users)
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/invite/${params.token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setFetchError(d.error.message ?? "Invalid invite."); return; }
        setInfo(d);
      })
      .catch(() => setFetchError("Could not load invitation."));
  }, [params.token]);

  const accept = async () => {
    setAccepting(true);
    setError("");
    try {
      const body: Record<string, string> = {};

      if (session?.user?.id) {
        body.userId = session.user.id;
      } else {
        if (!name.trim()) { setError("Name is required."); setAccepting(false); return; }
        if (password.length < 8) { setError("Password must be at least 8 characters."); setAccepting(false); return; }
        if (password !== confirm) { setError("Passwords do not match."); setAccepting(false); return; }
        body.name = name.trim();
        body.password = password;
      }

      const res = await fetch(`/api/invite/${params.token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.message ?? "Failed to accept."); return; }

      setDone(true);
      // Auto sign-in after 1.5 seconds
      setTimeout(async () => {
        if (session) {
          router.push("/dashboard");
        } else {
          await signIn("credentials", {
            email: info!.email,
            password,
            callbackUrl: "/dashboard",
          });
        }
      }, 1500);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setAccepting(false);
    }
  };

  if (fetchError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 w-full max-w-md text-center">
          <p className="text-4xl mb-4">⚠️</p>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Invalid Invitation</h1>
          <p className="text-gray-500 text-sm mb-6">{fetchError}</p>
          <Link href="/login" className="text-blue-600 hover:underline text-sm">Go to login</Link>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400 text-sm">Loading invitation…</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 w-full max-w-md text-center">
          <p className="text-4xl mb-4">🎉</p>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Welcome to {info.orgName}!</h1>
          <p className="text-gray-500 text-sm">You have been added as a {info.role}. Redirecting…</p>
        </div>
      </div>
    );
  }

  const isLoggedInWithWrongEmail = session && session.user.email?.toLowerCase() !== info.email.toLowerCase();
  const isLoggedInWithRightEmail = session && session.user.email?.toLowerCase() === info.email.toLowerCase();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          <p className="text-3xl mb-3">✉️</p>
          <h1 className="text-xl font-bold text-gray-900">You're invited!</h1>
          <p className="text-sm text-gray-500 mt-2">
            Join <strong>{info.orgName}</strong> as a <strong className="capitalize">{info.role.toLowerCase()}</strong>
          </p>
          <p className="text-xs text-gray-400 mt-1">Invite sent to {info.email}</p>
        </div>

        {isLoggedInWithWrongEmail && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 mb-4">
            You're logged in as <strong>{session.user.email}</strong>, but this invite is for <strong>{info.email}</strong>.
            Please log out and log in with the correct account, or register a new account below.
          </div>
        )}

        {isLoggedInWithRightEmail ? (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              Logged in as <strong>{session.user.email}</strong>. Click Accept to join {info.orgName}.
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button onClick={accept} disabled={accepting}
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {accepting ? "Accepting…" : `Accept & Join ${info.orgName}`}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 text-center">Create your account to get started</p>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Full Name</label>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="Your name"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
              <input value={info.email} disabled
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Confirm Password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button onClick={accept} disabled={accepting}
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {accepting ? "Creating account…" : `Create Account & Join ${info.orgName}`}
            </button>

            {status !== "loading" && !session && (
              <p className="text-center text-xs text-gray-500">
                Already have an account?{" "}
                <Link href={`/login?callbackUrl=/invite/${params.token}`} className="text-blue-600 hover:underline">
                  Log in instead
                </Link>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
