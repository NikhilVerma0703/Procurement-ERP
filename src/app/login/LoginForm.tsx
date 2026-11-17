"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";
import { authenticate } from "./actions";

// STANDALONE ONLY.
export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [error, formAction, pending] = useActionState(authenticate, undefined);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <div>
        <label htmlFor="email" className="po-field-label">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="username" required autoFocus className="po-field-input" />
      </div>
      <div>
        <label htmlFor="password" className="po-field-label">
          Password
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="po-field-input" />
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className="po-btn-primary w-full">
        <LogIn className="h-4 w-4" aria-hidden />
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
