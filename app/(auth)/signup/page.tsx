import type { Metadata } from "next";
import Link from "next/link";

import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Create an account · AgriTech" };

export default function SignUpPage() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">
          Create an account
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Naming an organization makes you its owner.
        </p>
      </div>

      <SignUpForm />

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Already have an account?{" "}
        <Link href="/login" className="font-medium underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </>
  );
}
