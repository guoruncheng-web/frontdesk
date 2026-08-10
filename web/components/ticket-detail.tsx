"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, PenLine, Zap } from "lucide-react";
import { PromptOption, TicketDetail, Usage, api, dollars, streamEvents } from "@/lib/api";

type Attempt = { attempt: number; outcome: string; error?: string; delayMs?: number };

const FAULTS = [
  { value: "none", label: "No fault" },
  { value: "malformed_output", label: "Corrupt the model’s JSON" },
  { value: "rate_limit", label: "Rate-limit the first attempt" },
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
      setFailure(error instanceof Error ? error.message : "The run failed");
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
      setFailure(error instanceof Error ? error.message : "The draft failed");
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
        <p className="label">{data.channel} · received {new Date(data.receivedAt).toLocaleString()}</p>
        <h1>{data.subject}</h1>
        <p className="detail-from">
          {data.senderName} &lt;{data.senderEmail}&gt;
        </p>
      </header>

      <section className="panel">
        <div className="panel-head">
          <span className="label">Message</span>
        </div>
        <div className="panel-body">
          <p className="ticket-body">{data.body}</p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <span className="label">Triage</span>
        </div>
        <div className="panel-body">
          <div className="controls">
            <select value={promptVersion} onChange={(e) => setPromptVersion(e.target.value)} aria-label="Prompt version">
              {(prompts.data ?? []).map((prompt) => (
                <option key={prompt.version} value={prompt.version}>
                  Prompt {prompt.version} — {prompt.label}
                </option>
              ))}
            </select>

            <select value={fault} onChange={(e) => setFault(e.target.value)} aria-label="Inject a fault">
              {FAULTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <label className="ghost" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={noCache}
                onChange={(e) => setNoCache(e.target.checked)}
                style={{ margin: 0 }}
              />
              Skip cache
            </label>

            <button className="primary" onClick={runTriage} disabled={running !== null}>
              {running === "triage" ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}
              {running === "triage" ? "Classifying…" : "Classify"}
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
                    <span className="step-wait">retry in {attempt.delayMs}ms</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {failure && <p className="error" style={{ marginTop: 16 }}>{failure}</p>}

          {triage && (
            <dl className="verdict" style={{ marginTop: 16 }}>
              <div>
                <dt className="label">Category</dt>
                <dd>{triage.category}</dd>
              </div>
              <div>
                <dt className="label">Priority</dt>
                <dd className={triage.priority}>{triage.priority}</dd>
              </div>
              <div>
                <dt className="label">Confidence</dt>
                <dd>{triage.confidence.toFixed(2)}</dd>
                <div className="confidence-bar">
                  <i className={shaky ? "shaky" : ""} style={{ width: `${triage.confidence * 100}%` }} />
                </div>
              </div>
              <div>
                <dt className="label">Attempts</dt>
                <dd>{triage.attempts}</dd>
              </div>
            </dl>
          )}

          {triage && <p className="summary">{triage.summary}</p>}

          {shaky && triage && (
            <p className="control-note" style={{ marginTop: 12 }}>
              Below 0.80 the model is guessing. This one is flagged for a human rather than acted on.
            </p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <span className="label">Reply draft</span>
          {approved && <span className="chip low">approved</span>}
        </div>
        <div className="panel-body">
          <textarea
            className="draft"
            value={draft}
            placeholder="No draft yet."
            onChange={(event) => {
              draftDirty.current = true;
              setDraft(event.target.value);
              setApproved(false);
            }}
          />
          <div className="draft-actions">
            <button className="ghost" onClick={runDraft} disabled={running !== null}>
              {running === "draft" ? <Loader2 size={14} className="spin" /> : <PenLine size={14} />}
              {draft ? "Rewrite" : "Draft a reply"}
            </button>
            <button className="primary" onClick={approve} disabled={!draft.trim() || running !== null}>
              <Check size={14} />
              Approve
            </button>
            <p className="draft-note">
              Approving stores the text as you edited it — not the model’s original.
            </p>
          </div>
        </div>
      </section>

      {data.calls.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <span className="label">Model calls for this ticket</span>
          </div>
          <div className="panel-body">
            <table className="calls">
              <thead>
                <tr>
                  <th>Purpose</th>
                  <th>Try</th>
                  <th>Outcome</th>
                  <th>Prompt</th>
                  <th>Tokens</th>
                  <th>Cost</th>
                  <th>Latency</th>
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
            <span className="label">Workspace usage</span>
          </div>
          <div className="panel-body">
            <dl className="usage">
              <div>
                <dt className="label">Spent</dt>
                <dd>{dollars(usage.spentMicros)}</dd>
              </div>
              <div>
                <dt className="label">Saved by cache</dt>
                <dd className="saved">{dollars(usage.savedMicros)}</dd>
              </div>
              <div>
                <dt className="label">Calls</dt>
                <dd>{usage.calls}</dd>
              </div>
              <div>
                <dt className="label">Retries</dt>
                <dd>{usage.retries}</dd>
              </div>
              <div>
                <dt className="label">Failures</dt>
                <dd>{usage.failures}</dd>
              </div>
            </dl>
            <p className="usage-note">
              Cost is recorded per call in millionths of a dollar and summed here — not estimated from
              an average. A cache hit is stored at zero, which is what makes the saving real rather
              than a claim.
            </p>
          </div>
        </section>
      )}
    </>
  );
}
