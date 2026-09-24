"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Check, CheckCheck, CircleAlert, FileText, Image as ImageIcon, MapPin, MessageSquareText, Mic, MoreHorizontal, Paperclip, Phone, Search, Send, Smile, Star, UserRound, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { InboxConversation, InboxMessage, InboxTemplate } from "@/lib/inbox/types";

type AccountOption = { id: string; name: string };
type ComposerType = "text" | "template" | "image" | "video" | "audio" | "document";
type InboxShellProps = { initialConversations: InboxConversation[]; initialMessages: InboxMessage[]; initialSelectedId: string | null; accounts: AccountOption[]; templates: InboxTemplate[] };
type ApiResult = { data?: { messages?: InboxMessage[] }; error?: { message?: string } };

function formatTime(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

async function readApiResult(response: Response): Promise<ApiResult> {
  const body: unknown = await response.json().catch(() => ({}));
  return body && typeof body === "object" ? body as ApiResult : {};
}

function MessageGlyph({ type }: { type: string }) {
  if (type === "image") return <ImageIcon className="h-4 w-4" />;
  if (type === "video") return <Video className="h-4 w-4" />;
  if (type === "audio") return <Mic className="h-4 w-4" />;
  if (type === "document") return <FileText className="h-4 w-4" />;
  if (type === "location") return <MapPin className="h-4 w-4" />;
  return null;
}

export function InboxShell({ initialConversations, initialMessages, initialSelectedId, accounts, templates }: InboxShellProps) {
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [messages, setMessages] = useState(initialMessages);
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [composerType, setComposerType] = useState<ComposerType>("text");
  const [composerValue, setComposerValue] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedConversation = conversations.find((conversation) => conversation.id === selectedId) ?? null;

  const filteredConversations = useMemo(() => conversations.filter((conversation) => {
    const matchesSearch = !search || conversation.contactName.toLowerCase().includes(search.toLowerCase()) || conversation.phoneNumber.includes(search);
    const matchesAccount = accountFilter === "all" || conversation.accountId === accountFilter;
    return matchesSearch && matchesAccount && conversation.archived === showArchived;
  }), [accountFilter, conversations, search, showArchived]);

  const loadMessages = useCallback(async (conversationId: string) => {
    const response = await fetch(`/api/inbox/messages?conversationId=${encodeURIComponent(conversationId)}`);
    const result = await readApiResult(response);
    if (response.ok && result.data?.messages) setMessages([...result.data.messages].reverse());
  }, []);

  function selectConversation(conversationId: string) {
    setSelectedId(conversationId);
    setError(null);
    void loadMessages(conversationId);
  }

  useEffect(() => {
    const source = new EventSource("/api/realtime/events");
    const refresh = (event: Event) => {
      const messageEvent = event as MessageEvent<string>;
      let data: { conversationId?: string } = {};
      try {
        data = JSON.parse(messageEvent.data) as { conversationId?: string };
      } catch {
        data = {};
      }
      if (!data.conversationId) return;
      setConversations((current) => current.map((conversation) => conversation.id === data.conversationId && event.type === "message.received" ? { ...conversation, unreadCount: conversation.unreadCount + 1, freeFormAllowed: true, policyMessage: "Free-form messaging is allowed while the customer-service window is open." } : conversation));
      if (data.conversationId === selectedId) void loadMessages(data.conversationId);
    };
    for (const eventName of ["message.received", "message.sent", "message.delivered", "message.read", "message.failed"]) source.addEventListener(eventName, refresh);
    return () => source.close();
  }, [loadMessages, selectedId]);

  async function sendMessage() {
    if (!selectedConversation) return;
    if (composerType !== "template" && !selectedConversation.freeFormAllowed) {
      setError(selectedConversation.policyMessage);
      return;
    }
    if (composerType === "template" && !selectedTemplateId) {
      setError("Choose an approved template first");
      return;
    }
    if (composerType === "text" && !composerValue.trim()) {
      setError("Enter a message");
      return;
    }
    setSending(true);
    setError(null);
    const template = templates.find((item) => item.id === selectedTemplateId);
    const payload: Record<string, unknown> = { whatsappAccountId: selectedConversation.accountId, to: selectedConversation.phoneNumber, type: composerType === "template" ? "template" : composerType };
    if (composerType === "text") payload.text = { body: composerValue.trim() };
    if (composerType === "template" && template) payload.template = { name: template.name, language: template.language, components: [] };
    if (["image", "video", "audio", "document"].includes(composerType)) {
      if (!mediaUrl.trim()) {
        setError("Enter a secure HTTPS media URL");
        setSending(false);
        return;
      }
      payload[composerType] = { mediaUrl: mediaUrl.trim(), caption: composerValue.trim() || undefined };
    }
    try {
      const response = await fetch("/api/inbox/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await readApiResult(response);
      if (!response.ok) {
        setError(result.error?.message ?? "Message could not be sent");
        return;
      }
      setComposerValue("");
      setMediaUrl("");
      await loadMessages(selectedConversation.id);
    } catch {
      setError("The message service could not be reached");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] overflow-hidden rounded-2xl border bg-card shadow-sm">
      <aside className={cn("w-full shrink-0 border-r md:w-80 lg:w-96", selectedId && "hidden md:block")}>
        <div className="flex h-full flex-col">
          <div className="space-y-3 border-b p-4">
            <div className="flex items-center justify-between"><div><p className="font-heading text-lg font-semibold">Inbox</p><p className="text-xs text-muted-foreground">{conversations.filter((item) => item.unreadCount > 0).length} unread conversations</p></div><Button variant="ghost" size="icon" aria-label="Inbox options"><MoreHorizontal /></Button></div>
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" className="pl-9" /></div>
            <div className="flex gap-2"><select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)} className="min-w-0 flex-1 rounded-lg border bg-background px-2 py-2 text-xs outline-none"><option value="all">All numbers</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select><Button type="button" variant={showArchived ? "secondary" : "outline"} size="sm" onClick={() => setShowArchived((value) => !value)}><Archive className="mr-1.5 h-3.5 w-3.5" />{showArchived ? "Archived" : "Active"}</Button></div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filteredConversations.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No conversations found.</div> : filteredConversations.map((conversation) => <button type="button" key={conversation.id} onClick={() => selectConversation(conversation.id)} className={cn("flex w-full items-start gap-3 border-b p-4 text-left transition hover:bg-muted/60", selectedId === conversation.id && "bg-primary/5")}><span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{conversation.contactName.slice(0, 1).toUpperCase()}{conversation.unreadCount > 0 ? <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border-2 border-card bg-primary px-1 text-[10px] text-primary-foreground">{conversation.unreadCount}</span> : null}</span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{conversation.contactName}</span><span className="shrink-0 text-[11px] text-muted-foreground">{formatTime(conversation.lastMessageAt)}</span></span><span className="mt-1 block truncate text-xs text-muted-foreground">{conversation.phoneNumber} · {conversation.lastMessagePreview ?? "No messages yet"}</span></span>{conversation.starred ? <Star className="mt-1 h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" /> : null}</button>)}
          </div>
        </div>
      </aside>
      <section className={cn("min-w-0 flex-1 flex-col", selectedId ? "flex" : "hidden md:flex")}>
        <header className="flex h-16 items-center justify-between border-b px-4 sm:px-5"><div className="flex min-w-0 items-center gap-3"><Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSelectedId(null)} aria-label="Back to conversations"><X /></Button>{selectedConversation ? <><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{selectedConversation.contactName.slice(0, 1).toUpperCase()}</span><div className="min-w-0"><p className="truncate text-sm font-medium">{selectedConversation.contactName}</p><p className="truncate text-xs text-muted-foreground">{selectedConversation.phoneNumber}</p></div></> : <p className="text-sm text-muted-foreground">Select a conversation</p>}</div>{selectedConversation ? <div className="flex items-center gap-1"><Button variant="ghost" size="icon" aria-label="Star conversation"><Star className={cn(selectedConversation.starred && "fill-amber-400 text-amber-400")} /></Button><Button variant="ghost" size="icon" aria-label="Contact details"><UserRound /></Button></div> : null}</header>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_20%_10%,rgba(16,185,129,0.06),transparent_32%)] p-4 sm:p-6">{selectedConversation ? messages.length === 0 ? <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No messages in this conversation yet.</div> : <div className="space-y-3">{messages.map((message) => <div key={message.id} className={cn("flex", message.direction === "outbound" ? "justify-end" : "justify-start")}><div className={cn("max-w-[min(680px,88%)] rounded-2xl px-4 py-3 text-sm shadow-sm", message.direction === "outbound" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border bg-card")}><div className="flex items-center gap-2"><MessageGlyph type={message.type} />{message.body ?? `[${message.type}]`}</div><div className={cn("mt-2 flex items-center justify-end gap-2 text-[10px]", message.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground")}><span>{formatTime(message.createdAt)}</span>{message.direction === "outbound" ? message.status === "read" || message.status === "delivered" ? <CheckCheck className="h-3.5 w-3.5" /> : message.status === "sent" ? <Check className="h-3.5 w-3.5" /> : null : null}{message.status === "failed" ? <span className="text-destructive">Failed</span> : null}</div>{message.errorMessage ? <p className="mt-2 text-xs text-destructive">{message.errorMessage}</p> : null}</div></div>)}</div> : <div className="flex h-full flex-col items-center justify-center text-center"><MessageSquareText className="h-10 w-10 text-muted-foreground" /><p className="mt-3 font-medium">Your conversations will appear here</p><p className="mt-1 max-w-sm text-sm text-muted-foreground">Incoming Meta webhooks and outgoing delivery updates appear in real time.</p></div>}</div>
        {selectedConversation ? <div className="border-t bg-card p-3 sm:p-4">{error ? <div className="mb-2 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</div> : null}<div className="mb-2 flex flex-wrap items-center gap-1">{(["text", "template", "image", "video", "audio", "document"] as ComposerType[]).map((type) => <button key={type} type="button" disabled={type !== "template" && !selectedConversation.freeFormAllowed} onClick={() => setComposerType(type)} className={cn("rounded-md px-2.5 py-1 text-xs capitalize text-muted-foreground hover:bg-muted", composerType === type && "bg-primary/10 font-medium text-primary")}>{type}</button>)}</div>{composerType === "template" ? <div className="flex gap-2"><select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} className="min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm outline-none"><option value="">Select approved template</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.language}</option>)}</select><Button type="button" onClick={() => void sendMessage()} disabled={sending || !selectedTemplateId}>{sending ? "Sending…" : <Send className="h-4 w-4" />}</Button></div> : <>{!selectedConversation.freeFormAllowed ? <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{selectedConversation.policyMessage}</div> : null}{["image", "video", "audio", "document"].includes(composerType) ? <Input value={mediaUrl} onChange={(event) => setMediaUrl(event.target.value)} placeholder="HTTPS media URL" className="mb-2" /> : null}<div className="flex items-end gap-2"><Button type="button" variant="ghost" size="icon" aria-label="Attach file"><Paperclip /></Button><textarea value={composerValue} onChange={(event) => setComposerValue(event.target.value)} placeholder={selectedConversation.freeFormAllowed ? "Write a message" : "Choose a template above"} disabled={!selectedConversation.freeFormAllowed} rows={2} className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50" /><Button type="button" variant="ghost" size="icon" aria-label="Add emoji"><Smile /></Button><Button type="button" onClick={() => void sendMessage()} disabled={sending || !selectedConversation.freeFormAllowed} aria-label="Send message"><Send className="h-4 w-4" /></Button></div></>}</div> : null}
      </section>
      <aside className="hidden w-72 shrink-0 border-l p-5 xl:block">{selectedConversation ? <div className="space-y-6"><div className="text-center"><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary/10 text-xl font-semibold text-primary">{selectedConversation.contactName.slice(0, 1).toUpperCase()}</span><h2 className="mt-3 font-heading text-lg font-semibold">{selectedConversation.contactName}</h2><p className="mt-1 text-sm text-muted-foreground">{selectedConversation.phoneNumber}</p><div className="mt-4 flex justify-center gap-2"><Button variant="outline" size="icon" aria-label="Call contact"><Phone /></Button><Button variant="outline" size="icon" aria-label="Archive conversation"><Archive /></Button></div></div><div className="border-t pt-5"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Conversation details</p><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Status</dt><dd><Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">Open</Badge></dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Messaging window</dt><dd className="text-right font-medium">{selectedConversation.freeFormAllowed ? "Open" : "Template required"}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Contact ID</dt><dd className="max-w-32 truncate text-right font-mono text-xs">{selectedConversation.contactId}</dd></div></dl></div></div> : <p className="text-sm text-muted-foreground">Contact details appear here.</p>}</aside>
    </div>
  );
}
