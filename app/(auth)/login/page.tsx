import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · AgriTech" };

export default function LoginPage() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Welcome back.
        </p>
      </div>

      <LoginForm />

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        No account yet?{" "}
        <Link href="/signup" className="font-medium underline underline-offset-4">
          Create one
        </Link>
      </p>
    </>
  );
}
