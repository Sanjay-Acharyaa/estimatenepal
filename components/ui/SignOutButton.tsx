"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="w-full text-left text-sm text-gray-500 hover:text-red-600 transition"
    >
      Sign out
    </button>
  );
}
