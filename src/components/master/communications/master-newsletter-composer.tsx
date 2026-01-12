"use client";

import React, { useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Check,
  Search,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LoadingOverlay } from "@/components/ui/loading-overlay";

type Block = {
  id: string;
  type: "text" | "image";
  content: string;
  width?: number;
};

type NewsletterTemplate = {
  subject: string;
  blocks: Block[];
};

export function MasterNewsletterComposer(props: {
  tenants: { id: string; name: string; contactEmail: string }[];
  defaultTestEmail?: string | null;
}) {
  const { tenants, defaultTestEmail } = props;

  const [template, setTemplate] = useState<NewsletterTemplate>({
    subject: "Studiio Update",
    blocks: [{ id: "1", type: "text", content: "Hi @studio_name,\n\nHere’s what’s new in Studiio:", width: 100 }],
  });

  const [selectedTenantIds, setSelectedTenantIds] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [isTenantDropdownOpen, setIsTenantDropdownOpen] = useState(false);
  const [tenantSearchQuery, setTenantSearchQuery] = useState("");
  const [testEmail, setTestEmail] = useState(defaultTestEmail || "");

  const filteredTenants = useMemo(() => {
    const q = tenantSearchQuery.toLowerCase().trim();
    if (!q) return tenants;
    return tenants.filter((t) => `${t.name} ${t.contactEmail}`.toLowerCase().includes(q));
  }, [tenantSearchQuery, tenants]);

  const toggleRecipient = (id: string) => {
    setSelectedTenantIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const selectAll = () => {
    if (selectedTenantIds.length === tenants.length) setSelectedTenantIds([]);
    else setSelectedTenantIds(tenants.map((t) => t.id));
  };

  const addBlock = (type: Block["type"]) => {
    const newBlock: Block = {
      id: Math.random().toString(36).slice(2, 9),
      type,
      content: "",
      width: 100,
    };
    setTemplate((t) => ({ ...t, blocks: [...(t.blocks || []), newBlock] }));
  };

  const removeBlock = (id: string) => {
    setTemplate((t) => ({ ...t, blocks: (t.blocks || []).filter((b) => b.id !== id) }));
  };

  const updateBlock = (id: string, patch: Partial<Block>) => {
    setTemplate((t) => ({
      ...t,
      blocks: (t.blocks || []).map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));
  };

  const moveBlock = (index: number, direction: "up" | "down") => {
    const blocks = [...(template.blocks || [])];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= blocks.length) return;
    [blocks[index], blocks[targetIndex]] = [blocks[targetIndex], blocks[index]];
    setTemplate((t) => ({ ...t, blocks }));
  };

  const sendRequest = async (payload: any, path: string) => {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || "Request failed");
    return json;
  };

  const handleSend = async () => {
    if (selectedTenantIds.length === 0) {
      setMessage({ type: "error", text: "Select at least 1 studio recipient." });
      return;
    }
    setIsSending(true);
    setMessage(null);
    try {
      await sendRequest({ template, tenantIds: selectedTenantIds }, "/api/master/communications/newsletters/send");
      setMessage({ type: "success", text: `Newsletter sent to ${selectedTenantIds.length} studios.` });
    } catch (e: any) {
      setMessage({ type: "error", text: e?.message || "Failed to send newsletter" });
    } finally {
      setIsSending(false);
    }
  };

  const handleSendTest = async () => {
    if (!testEmail.trim()) {
      setMessage({ type: "error", text: "Enter an email address for the test." });
      return;
    }
    setIsSending(true);
    setMessage(null);
    try {
      await sendRequest({ template, toEmail: testEmail }, "/api/master/communications/newsletters/test");
      setMessage({ type: "success", text: `Test newsletter sent to ${testEmail}.` });
    } catch (e: any) {
      setMessage({ type: "error", text: e?.message || "Failed to send test newsletter" });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 relative">
      <LoadingOverlay isVisible={isSending} message="Sending newsletter..." />

      {message && (
        <div
          className={cn(
            "p-4 rounded-[24px] flex items-center justify-between",
            message.type === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
              : "bg-rose-50 text-rose-700 border border-rose-100",
          )}
        >
          <div className="flex items-center gap-3">
            {message.type === "success" ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
            <span className="text-sm font-bold">{message.text}</span>
          </div>
        </div>
      )}

      <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex-1 space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Select Studios</label>
              <div className="relative">
                <button
                  onClick={() => setIsTenantDropdownOpen(!isTenantDropdownOpen)}
                  className="w-full h-14 px-6 rounded-2xl border border-slate-100 bg-slate-50/50 flex items-center justify-between hover:bg-white transition-all group"
                >
                  <span className="text-sm font-bold text-slate-700">
                    {selectedTenantIds.length === 0
                      ? "Choose recipients..."
                      : selectedTenantIds.length === tenants.length
                        ? "All Studios Selected"
                        : `${selectedTenantIds.length} Studios Selected`}
                  </span>
                  <ChevronDown className={cn("h-5 w-5 text-slate-400 transition-transform", isTenantDropdownOpen && "rotate-180")} />
                </button>

                {isTenantDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsTenantDropdownOpen(false)} />
                    <div className="absolute top-full left-0 right-0 mt-3 bg-white border border-slate-100 rounded-[32px] shadow-2xl z-20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="p-4 border-b border-slate-50">
                        <div className="relative">
                          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                          <input
                            type="text"
                            autoFocus
                            placeholder="Search studios..."
                            value={tenantSearchQuery}
                            onChange={(e) => setTenantSearchQuery(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-sm focus:ring-0 placeholder:text-slate-400"
                          />
                        </div>
                      </div>
                      <div className="max-h-[320px] overflow-y-auto custom-scrollbar py-2">
                        <button
                          onClick={selectAll}
                          className="w-full flex items-center justify-between px-6 py-3 hover:bg-slate-50 transition-colors group"
                        >
                          <span className="text-sm font-bold text-primary">Select All Studios</span>
                          <div
                            className={cn(
                              "h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all",
                              selectedTenantIds.length === tenants.length ? "bg-primary border-primary" : "border-slate-200",
                            )}
                          >
                            {selectedTenantIds.length === tenants.length && <Check className="h-3.5 w-3.5 text-white" />}
                          </div>
                        </button>
                        <div className="h-px bg-slate-50 my-1" />
                        {filteredTenants.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => toggleRecipient(t.id)}
                            className="w-full flex items-center justify-between px-6 py-3 hover:bg-slate-50 transition-colors group"
                          >
                            <div className="text-left">
                              <div className="text-sm font-bold text-slate-700">{t.name}</div>
                              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.contactEmail}</div>
                            </div>
                            <div
                              className={cn(
                                "h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all",
                                selectedTenantIds.includes(t.id) ? "bg-primary border-primary" : "border-slate-200",
                              )}
                            >
                              {selectedTenantIds.includes(t.id) && <Check className="h-3.5 w-3.5 text-white" />}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Email Subject</label>
              <input
                type="text"
                value={template.subject}
                onChange={(e) => setTemplate((t) => ({ ...t, subject: e.target.value }))}
                placeholder="Enter email subject..."
                className="w-full h-14 px-6 rounded-2xl border border-slate-100 bg-slate-50/50 text-sm font-bold text-slate-900 focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all"
              />
              <p className="text-[11px] font-medium text-slate-400">
                Variables supported: <span className="font-bold">@studio_name</span>
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Send test to</label>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="team@studiio.au"
                className="w-full h-14 px-6 rounded-2xl border border-slate-100 bg-slate-50/50 text-sm font-bold text-slate-900 focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSendTest}
              disabled={isSending}
              className="h-14 px-8 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send test
            </button>

            <button
              onClick={handleSend}
              disabled={isSending}
              className="ui-button-primary h-14 px-10 flex items-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send to selected
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Blocks</h3>
            <p className="text-xs font-medium text-slate-400 mt-1">Build newsletter content (text + images).</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => addBlock("text")}
              className="h-10 px-4 rounded-full bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 active:scale-95 transition-all"
            >
              <Plus className="h-4 w-4" /> Text
            </button>
            <button
              onClick={() => addBlock("image")}
              className="h-10 px-4 rounded-full bg-white border border-slate-200 text-slate-700 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 active:scale-95 transition-all"
            >
              <Plus className="h-4 w-4" /> Image
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {(template.blocks || []).map((b, idx) => (
            <div key={b.id} className="rounded-[28px] border border-slate-100 bg-slate-50/40 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {b.type === "text" ? "Text block" : "Image block"}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => moveBlock(idx, "up")}
                    className="h-8 w-8 rounded-full border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50"
                    title="Move up"
                  >
                    <ChevronUp className="h-4 w-4 text-slate-600" />
                  </button>
                  <button
                    onClick={() => moveBlock(idx, "down")}
                    className="h-8 w-8 rounded-full border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50"
                    title="Move down"
                  >
                    <ChevronDown className="h-4 w-4 text-slate-600" />
                  </button>
                  <button
                    onClick={() => removeBlock(b.id)}
                    className="h-8 w-8 rounded-full border border-rose-200 bg-white flex items-center justify-center hover:bg-rose-50"
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4 text-rose-600" />
                  </button>
                </div>
              </div>

              {b.type === "text" ? (
                <textarea
                  value={b.content}
                  onChange={(e) => updateBlock(b.id, { content: e.target.value })}
                  placeholder="Write your message..."
                  className="w-full min-h-[140px] rounded-2xl border border-slate-100 bg-white p-4 text-sm font-medium text-slate-800 outline-none focus:ring-4 focus:ring-primary/5"
                />
              ) : (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={b.content}
                    onChange={(e) => updateBlock(b.id, { content: e.target.value })}
                    placeholder="Paste image URL (or data URL)"
                    className="w-full h-12 px-4 rounded-2xl border border-slate-100 bg-white text-sm font-medium text-slate-800 outline-none focus:ring-4 focus:ring-primary/5"
                  />
                  <div className="flex items-center gap-4">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Width (%)</label>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={Number(b.width || 100)}
                      onChange={(e) => updateBlock(b.id, { width: Number(e.target.value) })}
                      className="flex-1"
                    />
                    <span className="text-xs font-bold text-slate-600 w-10 text-right">{Number(b.width || 100)}%</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


