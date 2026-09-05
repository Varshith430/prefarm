import type { Metadata } from "next";
import Link from "next/link";

import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Create an account · PreFarm" };

export default function SignUpPage() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-tight text-ink">
          Create an account
        </h1>
        <p className="text-sm text-muted">
          Naming an organization makes you its owner.
        </p>
      </div>

      <SignUpForm />

      <p className="text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
