import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · PreFarm" };

export default function LoginPage() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-tight text-ink">Sign in</h1>
        <p className="text-sm text-muted">
          Welcome back.
        </p>
      </div>

      <LoginForm />

      <p className="text-sm text-muted">
        No account yet?{" "}
        <Link href="/signup" className="font-semibold text-brand hover:underline">
          Create one
        </Link>
      </p>
    </>
  );
}
