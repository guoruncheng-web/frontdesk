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
      setError(caught instanceof Error ? caught.message : "登录失败，请稍后重试");
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
      setError(caught instanceof Error ? caught.message : "暂时无法打开演示空间");
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
        <a className="language-link" href="https://frontdesk-web-psi.vercel.app" target="_blank" rel="noreferrer">
          English version ↗
        </a>

        <h1>每一张工单都能自动阅读、排序，并生成可审核的回复。</h1>
        <p>
          AI 自动识别问题类型和优先级，生成回复草稿；客服审核或改写后才会保存，绝不自动发送。
        </p>

        {/* Measured on the sample inbox, not estimated. A demo that quotes round
            numbers it never checked is the thing clients have been burned by. */}
        <ul className="auth-facts">
          <li>
            每张工单分类成本约 <b>$0.00012</b>
          </li>
          <li>
            约 <b>1.0 秒</b>完成分类，实时流式展示
          </li>
          <li>
            最多 <b>2 次尝试</b>从异常模型输出中恢复
          </li>
          <li>
            未经人工审核发送的回复：<b>0</b>
          </li>
        </ul>
      </section>

      <section className="auth-panel">
        <form className="auth-form" onSubmit={submit}>
          <h2>登录</h2>

          <label>
            邮箱地址
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
            密码
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
            登录
            {!pending && <ArrowRight size={15} />}
          </button>

          <div className="auth-divider">
            <span>或</span>
          </div>

          <button type="button" className="ghost auth-primary" onClick={openDemo} disabled={demoPending}>
            {demoPending ? <Loader2 size={15} className="spin" /> : <Inbox size={15} />}
            {demoPending ? "正在准备工单…" : "直接体验演示"}
          </button>

          <p className="control-note">
            自动创建包含 12 张示例工单的独立空间，可体验分类、故障恢复和成本统计，24 小时后自动清理。
          </p>
        </form>
      </section>
    </div>
  );
}
