"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HelpCircle, Inbox, Loader2, LogOut, Zap } from "lucide-react";
import { Ticket, Usage, api, dollars } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { TicketDetailPanel } from "@/components/ticket-detail";
import { Tour, shouldOfferTour } from "@/components/tour";

export default function ConsolePage() {
  const router = useRouter();
  const { status, user, signOut } = useAuth();

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated" || !user) {
    return (
      <div className="boot">
        <Loader2 size={18} className="spin" />
        <p>Opening your inbox…</p>
      </div>
    );
  }

  return <Console user={user} onSignOut={signOut} />;
}

function Console({
  user,
  onSignOut,
}: {
  user: { organizationName: string };
  onSignOut: () => void;
}) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [triagingAll, setTriagingAll] = useState(false);
  const [touring, setTouring] = useState(false);

  const tickets = useQuery({ queryKey: ["tickets"], queryFn: () => api<Ticket[]>("/tickets") });
  const usage = useQuery({ queryKey: ["usage"], queryFn: () => api<Usage>("/usage") });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["tickets"] });
    void queryClient.invalidateQueries({ queryKey: ["usage"] });
    if (selectedId) void queryClient.invalidateQueries({ queryKey: ["ticket", selectedId] });
  };

  const rows = tickets.data ?? [];
  const untriaged = useMemo(() => rows.filter((ticket) => !ticket.triage), [rows]);

  // Select the first ticket once, so the panel is never blank on arrival.
  useEffect(() => {
    if (!selectedId && rows.length) setSelectedId(rows[0].id);
  }, [rows, selectedId]);

  // Offered only once the inbox has actually rendered — a walkthrough pointing
  // at controls that are still loading points at nothing.
  useEffect(() => {
    if (selectedId && shouldOfferTour()) setTouring(true);
  }, [selectedId]);

  /**
   * Triages the untriaged tickets one after another rather than all at once.
   * Firing twelve concurrent requests at a provider is the quickest way to meet
   * its rate limiter, and the sequential run is also the one a visitor can
   * actually watch.
   */
  async function triageAll() {
    setTriagingAll(true);

    try {
      for (const ticket of untriaged) {
        setSelectedId(ticket.id);
        await api(`/tickets/${ticket.id}/triage`, { method: "POST" }).catch(() => undefined);
        refresh();
      }
    } finally {
      setTriagingAll(false);
      refresh();
    }
  }

  return (
    <div className="console">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Inbox size={14} />
          </span>
          frontdesk
        </div>

        <div className="topbar-spacer" />

        {usage.data && (
          <span
            className="workspace mono"
            data-tour="meter"
            title="Spent on model calls in this workspace"
          >
            {dollars(usage.data.spentMicros)} · {usage.data.calls} calls
          </span>
        )}

        <span className="workspace">
          <span className="dot" />
          {user.organizationName}
        </span>

        <button
          className="ghost"
          onClick={() => setTouring(true)}
          title="Show me around"
          aria-label="Show me around"
        >
          <HelpCircle size={14} />
        </button>

        <button className="ghost" onClick={onSignOut} title="Sign out" aria-label="Sign out">
          <LogOut size={14} />
        </button>
      </header>

      <aside className="queue">
        <div className="queue-head" data-tour="queue">
          <p className="label">Inbox</p>
          <h2>
            {rows.length} tickets
            {untriaged.length > 0 && ` · ${untriaged.length} untriaged`}
          </h2>

          <div className="queue-actions">
            <button
              className="primary"
              onClick={triageAll}
              disabled={triagingAll || untriaged.length === 0}
            >
              {triagingAll ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}
              {triagingAll ? "Working…" : `Triage ${untriaged.length || "all"}`}
            </button>
          </div>
        </div>

        {tickets.isLoading && <p className="control-note" style={{ padding: 16 }}>Loading…</p>}

        {rows.map((ticket) => (
          <button
            key={ticket.id}
            className="ticket"
            aria-current={ticket.id === selectedId}
            onClick={() => setSelectedId(ticket.id)}
          >
            <div className="ticket-top">
              <span className={`pri ${ticket.triage?.priority ?? "none"}`} />
              <span className="ticket-subject">{ticket.subject}</span>
            </div>
            <div className="ticket-meta">
              <span>{ticket.senderName}</span>
              <span>·</span>
              <span className="num">{sinceLabel(ticket.receivedAt)}</span>
              {ticket.triage ? (
                <span className={`chip ${ticket.triage.priority}`}>{ticket.triage.category}</span>
              ) : (
                <span className="chip untriaged">untriaged</span>
              )}
            </div>
          </button>
        ))}
      </aside>

      <main className="detail">
        {selectedId ? (
          <TicketDetailPanel ticketId={selectedId} onChanged={refresh} usage={usage.data} />
        ) : (
          <div className="detail-empty">
            <Inbox size={22} />
            <p>Pick a ticket from the queue.</p>
          </div>
        )}
      </main>

      {touring && <Tour onFinished={() => setTouring(false)} />}
    </div>
  );
}

function sinceLabel(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}
