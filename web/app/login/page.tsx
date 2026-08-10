"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Inbox, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const { status, signIn, startDemo } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [demoPending, setDemoPending] = useState(false);

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      await signIn(form.email, form.password);
      router.replace("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  async function openDemo() {
    setError(null);
    setDemoPending(true);

    try {
      await startDemo();
      router.replace("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open the demo");
    } finally {
      setDemoPending(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-pitch">
        <div className="brand">
          <span className="brand-mark">
            <Inbox size={14} />
          </span>
          frontdesk
        </div>

        <h1>Every ticket read, ranked and answered before anyone opens the inbox.</h1>
        <p>
          Incoming messages are classified, given a priority, and answered with a draft an agent
          approves or rewrites. Nothing is sent without a person seeing it first.
        </p>

        {/* Measured on the sample inbox, not estimated. A demo that quotes round
            numbers it never checked is the thing clients have been burned by. */}
        <ul className="auth-facts">
          <li>
            <b>$0.00012</b> per ticket classified
          </li>
          <li>
            <b>~1.0s</b> to classify, streamed as it is written
          </li>
          <li>
            <b>2 attempts</b> to recover from a malformed model response
          </li>
          <li>
            <b>0 replies</b> sent without human approval
          </li>
        </ul>
      </section>

      <section className="auth-panel">
        <form className="auth-form" onSubmit={submit}>
          <h2>Sign in</h2>

          <label>
            Email address
            <input
              required
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder="you@company.com"
            />
          </label>

          <label>
            Password
            <input
              required
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              placeholder="••••••••"
            />
          </label>

          {error && <p className="error">{error}</p>}

          <button className="primary auth-primary" disabled={pending}>
            {pending ? <Loader2 size={15} className="spin" /> : null}
            Sign in
            {!pending && <ArrowRight size={15} />}
          </button>

          <div className="auth-divider">
            <span>or</span>
          </div>

          <button type="button" className="ghost auth-primary" onClick={openDemo} disabled={demoPending}>
            {demoPending ? <Loader2 size={15} className="spin" /> : <Inbox size={15} />}
            {demoPending ? "Filling your inbox…" : "Open a demo inbox"}
          </button>

          <p className="control-note">
            Twelve real-looking tickets in a workspace of your own. Triage them, break them, spend a
            fraction of a cent. It disappears after a day.
          </p>
        </form>
      </section>
    </div>
  );
}
