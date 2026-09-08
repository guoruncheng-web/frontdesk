"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, PenLine, Zap } from "lucide-react";
import { PromptOption, TicketDetail, Usage, api, dollars, streamEvents } from "@/lib/api";

type Attempt = { attempt: number; outcome: string; error?: string; delayMs?: number };

const FAULTS = [
  { value: "none", label: "不注入故障" },
  { value: "malformed_output", label: "模拟模型 JSON 损坏" },
  { value: "rate_limit", label: "模拟首次请求限流" },
];

export function TicketDetailPanel({
  ticketId,
  onChanged,
  usage,
}: {
  ticketId: string;
  onChanged: () => void;
  usage?: Usage;
}) {
  const ticket = useQuery({
    queryKey: ["ticket", ticketId],
    queryFn: () => api<TicketDetail>(`/tickets/${ticketId}`),
  });

  const prompts = useQuery({ queryKey: ["prompts"], queryFn: () => api<PromptOption[]>("/prompts") });

  const [promptVersion, setPromptVersion] = useState("v2");
  const [fault, setFault] = useState("none");
  const [noCache, setNoCache] = useState(false);

  const [stream, setStream] = useState("");
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [running, setRunning] = useState<null | "triage" | "draft">(null);
  const [failure, setFailure] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  const [approved, setApproved] = useState(false);
  const draftDirty = useRef(false);

  // A new ticket means a new run; leaving the previous transcript on screen
  // would attribute one ticket's stream to another.
  useEffect(() => {
    setStream("");
    setAttempts([]);
    setFailure(null);
    draftDirty.current = false;
  }, [ticketId]);

  useEffect(() => {
    if (!draftDirty.current) {
      setDraft(ticket.data?.draft?.body ?? "");
      setApproved(ticket.data?.draft?.approved ?? false);
    }
  }, [ticket.data]);

  async function runTriage() {
    setRunning("triage");
    setStream("");
    setAttempts([]);
    setFailure(null);

    const params = new URLSearchParams({ promptVersion });
    if (fault !== "none") params.set("fault", fault);
    if (noCache) params.set("noCache", "true");

    try {
      await streamEvents(`/tickets/${ticketId}/triage?${params}`, {
        onToken: (token) => setStream((current) => current + token),
        onAttempt: (attempt) => setAttempts((current) => [...current, attempt]),
        onFailed: setFailure,
      });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "分类失败");
    } finally {
      setRunning(null);
      await ticket.refetch();
      onChanged();
    }
  }

  async function runDraft() {
    setRunning("draft");
    setDraft("");
    setFailure(null);
    draftDirty.current = true;

    try {
      await streamEvents(`/tickets/${ticketId}/draft`, {
        onToken: (token) => setDraft((current) => current + token),
        onFailed: setFailure,
      });
      setApproved(false);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "生成草稿失败");
    } finally {
      setRunning(null);
      onChanged();
    }
  }

  async function approve() {
    await api(`/tickets/${ticketId}/approve`, { method: "POST", body: JSON.stringify({ body: draft }) });
    setApproved(true);
    draftDirty.current = false;
    await ticket.refetch();
    onChanged();
  }

  if (ticket.isLoading || !ticket.data) {
    return (
      <div className="detail-empty">
        <Loader2 size={18} className="spin" />
      </div>
    );
  }

  const data = ticket.data;
  const triage = data.triage;
  const selectedPrompt = prompts.data?.find((prompt) => prompt.version === promptVersion);
  const shaky = (triage?.confidence ?? 1) < 0.8;

  return (
    <>
      <header className="detail-head">
        <p className="label">{data.channel} · 收到于 {new Date(data.receivedAt).toLocaleString("zh-CN")}</p>
        <h1>{data.subject}</h1>
        <p className="detail-from">
          {data.senderName} &lt;{data.senderEmail}&gt;
        </p>
      </header>

      <section className="panel">
        <div className="panel-head">
          <span className="label">客户消息</span>
        </div>
        <div className="panel-body">
          <p className="ticket-body">{data.body}</p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <span className="label">智能分流</span>
        </div>
        <div className="panel-body">
          <div className="controls">
            <select value={promptVersion} onChange={(e) => setPromptVersion(e.target.value)} aria-label="提示词版本">
              {(prompts.data ?? []).map((prompt) => (
                <option key={prompt.version} value={prompt.version}>
                  提示词 {prompt.version} — {prompt.label}
                </option>
              ))}
            </select>

            <select
              value={fault}
              onChange={(e) => setFault(e.target.value)}
              aria-label="注入故障"
              data-tour="fault"
            >
              {FAULTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <label className="ghost" style={{ cursor: "pointer" }} data-tour="cache">
              <input
                type="checkbox"
                checked={noCache}
                onChange={(e) => setNoCache(e.target.checked)}
                style={{ margin: 0 }}
              />
              跳过缓存
            </label>

            <button
              className="primary"
              onClick={runTriage}
              disabled={running !== null}
              data-tour="classify"
            >
              {running === "triage" ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}
              {running === "triage" ? "分类中…" : "开始分类"}
            </button>

            {selectedPrompt && <p className="control-note">{selectedPrompt.note}</p>}
          </div>

          {(stream || running === "triage") && (
            <pre className={`stream ${running === "triage" ? "caret" : ""}`} style={{ marginTop: 16 }}>
              {stream}
            </pre>
          )}

          {attempts.length > 0 && (
            <div className="timeline" style={{ marginTop: 16 }}>
              {attempts.map((attempt, index) => (
                <div key={index} className={`step ${attempt.outcome === "ok" ? "ok" : "failed"}`}>
                  <span className="step-index">#{attempt.attempt}</span>
                  <span>
                    <span className="step-outcome">{attempt.outcome.replace(/_/g, " ")}</span>
                    {attempt.error && <span className="step-detail"> — {attempt.error}</span>}
                  </span>
                  {attempt.delayMs !== undefined && (
                    <span className="step-wait">{attempt.delayMs}ms 后重试</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {failure && <p className="error" style={{ marginTop: 16 }}>{failure}</p>}

          {triage && (
            <dl className="verdict" style={{ marginTop: 16 }}>
              <div>
                <dt className="label">类别</dt>
                <dd>{categoryLabel(triage.category)}</dd>
              </div>
              <div>
                <dt className="label">优先级</dt>
                <dd className={triage.priority}>{priorityLabel(triage.priority)}</dd>
              </div>
              <div>
                <dt className="label">置信度</dt>
                <dd>{triage.confidence.toFixed(2)}</dd>
                <div className="confidence-bar">
                  <i className={shaky ? "shaky" : ""} style={{ width: `${triage.confidence * 100}%` }} />
                </div>
              </div>
              <div>
                <dt className="label">尝试次数</dt>
                <dd>{triage.attempts}</dd>
              </div>
            </dl>
          )}

          {triage && <p className="summary">{triage.summary}</p>}

          {shaky && triage && (
            <p className="control-note" style={{ marginTop: 12 }}>
              置信度低于 0.80，系统会标记为人工复核，不会直接执行。
            </p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <span className="label">回复草稿</span>
          {approved && <span className="chip low">已审核</span>}
        </div>
        <div className="panel-body">
          <textarea
            className="draft"
            value={draft}
            placeholder="暂未生成草稿。"
            onChange={(event) => {
              draftDirty.current = true;
              setDraft(event.target.value);
              setApproved(false);
            }}
          />
          <div className="draft-actions" data-tour="draft">
            <button className="ghost" onClick={runDraft} disabled={running !== null}>
              {running === "draft" ? <Loader2 size={14} className="spin" /> : <PenLine size={14} />}
              {draft ? "重新生成" : "生成回复草稿"}
            </button>
            <button className="primary" onClick={approve} disabled={!draft.trim() || running !== null}>
              <Check size={14} />
              审核通过
            </button>
            <p className="draft-note">
              审核后保存的是您修改过的内容，而不是模型的原始输出。
            </p>
          </div>
        </div>
      </section>

      {data.calls.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <span className="label">本工单的模型调用记录</span>
          </div>
          <div className="panel-body">
            <table className="calls">
              <thead>
                <tr>
                  <th>用途</th>
                  <th>次数</th>
                  <th>结果</th>
                  <th>提示词</th>
                  <th>Token</th>
                  <th>成本</th>
                  <th>耗时</th>
                </tr>
              </thead>
              <tbody>
                {data.calls.map((call) => (
                  <tr key={call.id}>
                    <td>{call.purpose}</td>
                    <td>{call.attempt}</td>
                    <td className={call.outcome === "ok" ? "ok" : "bad"}>
                      {call.cacheHit ? "cache" : call.outcome.replace(/_/g, " ")}
                    </td>
                    <td>{call.promptVersion}</td>
                    <td>
                      {call.inputTokens}/{call.outputTokens}
                    </td>
                    <td>{call.costMicros === 0 ? "—" : dollars(call.costMicros, 6)}</td>
                    <td>{call.latencyMs}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {usage && (
        <section className="panel">
          <div className="panel-head">
            <span className="label">工作空间用量</span>
          </div>
          <div className="panel-body">
            <dl className="usage">
              <div>
                <dt className="label">实际支出</dt>
                <dd>{dollars(usage.spentMicros)}</dd>
              </div>
              <div>
                <dt className="label">缓存节省</dt>
                <dd className="saved">{dollars(usage.savedMicros)}</dd>
              </div>
              <div>
                <dt className="label">调用次数</dt>
                <dd>{usage.calls}</dd>
              </div>
              <div>
                <dt className="label">重试次数</dt>
                <dd>{usage.retries}</dd>
              </div>
              <div>
                <dt className="label">失败次数</dt>
                <dd>{usage.failures}</dd>
              </div>
            </dl>
            <p className="usage-note">
              每次调用都以百万分之一美元为单位记录并汇总，不使用平均值估算；命中缓存的调用成本记为零。
            </p>
          </div>
        </section>
      )}
    </>
  );
}

function categoryLabel(value: string): string {
  return ({ billing: "账单", technical: "技术问题", shipping: "物流", returns: "退换货", account: "账号", feedback: "反馈", sales: "销售咨询", other: "其他" } as Record<string, string>)[value] ?? value;
}

function priorityLabel(value: string): string {
  return ({ urgent: "紧急", normal: "普通", low: "低" } as Record<string, string>)[value] ?? value;
}
