"use client";

import React, { useMemo, useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, Send, Save, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Block = {
  id: string;
  type: "text" | "image";
  content: string;
  width?: number;
};

type Template = {
  subject: string;
  blocks: Block[];
};

export function WelcomeEmailEditor(props: {
  initialTemplate: Template;
  defaultTestEmail?: string | null;
}) {
  const { initialTemplate, defaultTestEmail } = props;

  const [template, setTemplate] = useState<Template>(initialTemplate);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testEmail, setTestEmail] = useState(defaultTestEmail || "");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const previewHtml = useMemo(() => {
    // Minimal local preview (server uses NotificationService base template).
    const escape = (s: string) =>
      s
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

    return (template.blocks || [])
      .map((b) => {
        if (b.type === "image") {
          if (!b.content) return "";
          return `<div style="margin: 18px 0; text-align: center;"><img src="${escape(
            b.content,
          )}" style="max-width: ${Math.max(10, Math.min(100, Number(b.width || 100)))}%; height:auto; border-radius: 16px;" /></div>`;
        }
        return `<div style="margin: 18px 0; white-space: pre-wrap; font-size: 14px; color: #334155; line-height: 1.6;">${escape(
          b.content || "",
        )}</div>`;
      })
      .join("");
  }, [template.blocks]);

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

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/master/communications/welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(template),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to save");
      setMessage({ type: "success", text: "Welcome email saved." });
    } catch (e: any) {
      setMessage({ type: "error", text: e?.message || "Failed to save" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTest = async () => {
    setIsTesting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/master/communications/welcome/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toEmail: testEmail }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to send test");
      setMessage({ type: "success", text: `Test email sent to ${testEmail || "your email"}.` });
    } catch (e: any) {
      setMessage({ type: "error", text: e?.message || "Failed to send test" });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-8">
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
            {message.type === "success" ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <AlertCircle className="h-5 w-5" />
            )}
            <span className="text-sm font-bold">{message.text}</span>
          </div>
        </div>
      )}

      <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex-1 space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                Email Subject
              </label>
              <input
                type="text"
                value={template.subject}
                onChange={(e) => setTemplate((t) => ({ ...t, subject: e.target.value }))}
                placeholder="Enter subject..."
                className="w-full h-14 px-6 rounded-2xl border border-slate-100 bg-slate-50/50 text-sm font-bold text-slate-900 focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all"
              />
              <p className="text-[11px] font-medium text-slate-400">
                Variables supported: <span className="font-bold">@user_name</span>,{" "}
                <span className="font-bold">@studio_name</span>
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                Send test to
              </label>
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
              disabled={isTesting}
              className="h-14 px-8 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50 flex items-center gap-2"
            >
              <Send className="h-4 w-4" />
              {isTesting ? "Sending..." : "Send test"}
            </button>

            <button
              onClick={handleSave}
              disabled={isSaving}
              className="ui-button-primary h-14 px-10 flex items-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Blocks</h3>
              <p className="text-xs font-medium text-slate-400 mt-1">
                Build the welcome email content (text + images).
              </p>
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
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Width (%)
                      </label>
                      <input
                        type="range"
                        min={10}
                        max={100}
                        value={Number(b.width || 100)}
                        onChange={(e) => updateBlock(b.id, { width: Number(e.target.value) })}
                        className="flex-1"
                      />
                      <span className="text-xs font-bold text-slate-600 w-10 text-right">
                        {Number(b.width || 100)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Preview</h3>
            <p className="text-xs font-medium text-slate-400 mt-1">
              This is a lightweight preview. Final email uses the Studiio base template.
            </p>
          </div>
          <div className="rounded-[28px] border border-slate-100 bg-slate-50/40 p-6">
            <div className="text-[12px] font-black uppercase tracking-widest text-slate-400">Subject</div>
            <div className="text-sm font-bold text-slate-900 mt-2">{template.subject}</div>
            <div className="h-px bg-slate-100 my-6" />
            <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        </div>
      </div>
    </div>
  );
}


