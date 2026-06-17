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
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; password?: string; confirm?: string }>({});
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
    setFieldErrors({});
    try {
      const body: Record<string, string> = {};

      if (session?.user?.id) {
        body.userId = session.user.id;
      } else {
        const fe: typeof fieldErrors = {};
        if (!name.trim()) fe.name = "Name is required.";
        if (password.length < 8) fe.password = "Password must be at least 8 characters.";
        else if (password !== confirm) fe.confirm = "Passwords do not match.";
        if (Object.keys(fe).length) { setFieldErrors(fe); setAccepting(false); return; }
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
        <p className="text-gray-600 text-sm">Loading invitation…</p>
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
          <p className="text-xs text-gray-600 mt-1">Invite sent to {info.email}</p>
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
            {error && <p role="alert" className="text-red-500 text-sm">{error}</p>}
            <button onClick={accept} disabled={accepting}
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {accepting ? "Accepting…" : `Accept & Join ${info.orgName}`}
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); accept(); }}
            className="space-y-4"
            aria-label="Create account to accept invite"
          >
            <p className="text-sm text-gray-600 text-center">Create your account to get started</p>

            <div>
              <label htmlFor="inv-name" className="block text-xs font-medium text-gray-700 mb-1">Full Name</label>
              <input
                id="inv-name"
                value={name}
                onChange={e => { setName(e.target.value); setFieldErrors(f => ({ ...f, name: undefined })); }}
                placeholder="Your name"
                autoComplete="name"
                aria-describedby={fieldErrors.name ? "inv-name-err" : undefined}
                aria-invalid={!!fieldErrors.name}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${fieldErrors.name ? "border-red-500 focus:ring-red-500" : "border-gray-300 focus:ring-blue-500"}`}
              />
              {fieldErrors.name && <p id="inv-name-err" role="alert" className="text-red-600 text-xs mt-1">{fieldErrors.name}</p>}
            </div>
            <div>
              <label htmlFor="inv-email" className="block text-xs font-medium text-gray-700 mb-1">Email</label>
              <input id="inv-email" value={info.email} disabled
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed" />
            </div>
            <div>
              <label htmlFor="inv-password" className="block text-xs font-medium text-gray-700 mb-1">Password</label>
              <input
                id="inv-password"
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setFieldErrors(f => ({ ...f, password: undefined })); }}
                placeholder="Min. 8 characters"
                autoComplete="new-password"
                aria-describedby={fieldErrors.password ? "inv-password-err" : undefined}
                aria-invalid={!!fieldErrors.password}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${fieldErrors.password ? "border-red-500 focus:ring-red-500" : "border-gray-300 focus:ring-blue-500"}`}
              />
              {fieldErrors.password && <p id="inv-password-err" role="alert" className="text-red-600 text-xs mt-1">{fieldErrors.password}</p>}
            </div>
            <div>
              <label htmlFor="inv-confirm" className="block text-xs font-medium text-gray-700 mb-1">Confirm Password</label>
              <input
                id="inv-confirm"
                type="password"
                value={confirm}
                onChange={e => { setConfirm(e.target.value); setFieldErrors(f => ({ ...f, confirm: undefined })); }}
                placeholder="Repeat password"
                autoComplete="new-password"
                aria-describedby={fieldErrors.confirm ? "inv-confirm-err" : undefined}
                aria-invalid={!!fieldErrors.confirm}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${fieldErrors.confirm ? "border-red-500 focus:ring-red-500" : "border-gray-300 focus:ring-blue-500"}`}
              />
              {fieldErrors.confirm && <p id="inv-confirm-err" role="alert" className="text-red-600 text-xs mt-1">{fieldErrors.confirm}</p>}
            </div>

            {error && <p role="alert" className="text-red-500 text-sm">{error}</p>}

            <button type="submit" disabled={accepting}
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
          </form>
        )}
      </div>
    </div>
  );
}
