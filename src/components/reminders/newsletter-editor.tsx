"use client";

import React, { useState, useRef } from "react";
import { 
  Type, 
  Image as ImageIcon, 
  Trash2, 
  Plus, 
  Send, 
  Save,
  Upload, 
  ChevronDown,
  X,
  CheckCircle2,
  AlertCircle,
  Eye,
  Search,
  Check,
  Users,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LoadingOverlay } from "@/components/ui/loading-overlay";

interface Block {
  id: string;
  type: "text" | "image";
  content: string;
  width?: number;
}

interface NewsletterTemplate {
  subject: string;
  blocks: Block[];
}

interface NewsletterDraft {
  id: string;
  template: NewsletterTemplate;
  createdAt?: string;
  updatedAt?: string;
}

interface NewsletterEditorProps {
  clients: { id: string; name: string }[];
  onSend: (template: NewsletterTemplate, recipientIds: string[]) => Promise<{ success: boolean; error?: string }>;
  initialDrafts?: NewsletterDraft[];
  onSaveDraft?: (template: NewsletterTemplate, draftId?: string | null) => Promise<{ success: boolean; drafts?: NewsletterDraft[]; error?: string }>;
  onDeleteDraft?: (draftId: string) => Promise<{ success: boolean; drafts?: NewsletterDraft[]; error?: string }>;
}

export function NewsletterEditor({ clients, onSend, initialDrafts = [], onSaveDraft, onDeleteDraft }: NewsletterEditorProps) {
  const [template, setTemplate] = useState<NewsletterTemplate>({
    subject: "Newsletter Update from @studio_name",
    blocks: [
      { id: "1", type: "text", content: "Hi everyone,\n\nWe have some exciting updates to share with you!", width: 100 }
    ]
  });

  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [drafts, setDrafts] = useState<NewsletterDraft[]>(Array.isArray(initialDrafts) ? initialDrafts : []);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(clientSearchQuery.toLowerCase())
  );

  const toggleRecipient = (id: string) => {
    setSelectedRecipientIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedRecipientIds.length === clients.length) {
      setSelectedRecipientIds([]);
    } else {
      setSelectedRecipientIds(clients.map(c => c.id));
    }
  };

  const addBlock = (type: "text" | "image") => {
    const newBlock: Block = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      content: "",
      width: 100
    };
    setTemplate({ ...template, blocks: [...template.blocks, newBlock] });
  };

  const removeBlock = (id: string) => {
    setTemplate({ ...template, blocks: template.blocks.filter(b => b.id !== id) });
  };

  const updateBlock = (id: string, content: string) => {
    setTemplate({
      ...template,
      blocks: template.blocks.map(b => b.id === id ? { ...b, content } : b)
    });
  };

  const updateBlockWidth = (id: string, width: number) => {
    setTemplate({
      ...template,
      blocks: template.blocks.map(b => b.id === id ? { ...b, width } : b)
    });
  };

  const moveBlock = (index: number, direction: 'up' | 'down') => {
    const newBlocks = [...template.blocks];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newBlocks.length) return;
    [newBlocks[index], newBlocks[targetIndex]] = [newBlocks[targetIndex], newBlocks[index]];
    setTemplate({ ...template, blocks: newBlocks });
  };

  const handleImageUpload = (id: string, file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      updateBlock(id, reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async () => {
    if (selectedRecipientIds.length === 0) {
      setMessage({ type: 'error', text: "Please select at least one recipient" });
      return;
    }
    setIsSending(true);
    setMessage(null);
    try {
      const result = await onSend(template, selectedRecipientIds);
      if (result.success) {
        setMessage({ type: 'success', text: "Newsletter sent successfully!" });
      } else {
        setMessage({ type: 'error', text: result.error || "Failed to send newsletter" });
      }
    } catch (err) {
      setMessage({ type: 'error', text: "An unexpected error occurred" });
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!onSaveDraft) {
      setMessage({ type: "error", text: "Draft saving is not available right now." });
      return;
    }
    const subject = String(template.subject || "").trim();
    if (!subject) {
      setMessage({ type: "error", text: "Please enter an email subject before saving a draft." });
      return;
    }
    setIsSavingDraft(true);
    setMessage(null);
    try {
      const result = await onSaveDraft(template, activeDraftId);
      if (!result?.success) {
        setMessage({ type: "error", text: result?.error || "Failed to save draft" });
        return;
      }
      if (Array.isArray(result.drafts)) {
        setDrafts(result.drafts);
      }
      setMessage({ type: "success", text: activeDraftId ? "Draft updated." : "Draft saved." });
    } catch (e: any) {
      setMessage({ type: "error", text: e?.message || "Failed to save draft" });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleLoadDraft = (d: NewsletterDraft) => {
    setTemplate(d.template);
    setActiveDraftId(d.id);
    setMessage({ type: "success", text: "Draft loaded." });
  };

  const handleDeleteDraft = async (draftId: string) => {
    if (!onDeleteDraft) {
      setMessage({ type: "error", text: "Draft deletion is not available right now." });
      return;
    }
    if (!confirm("Delete this draft?")) return;
    setIsSavingDraft(true);
    setMessage(null);
    try {
      const result = await onDeleteDraft(draftId);
      if (!result?.success) {
        setMessage({ type: "error", text: result?.error || "Failed to delete draft" });
        return;
      }
      if (Array.isArray(result.drafts)) {
        setDrafts(result.drafts);
      } else {
        setDrafts((prev) => prev.filter((d) => d.id !== draftId));
      }
      if (activeDraftId === draftId) setActiveDraftId(null);
      setMessage({ type: "success", text: "Draft deleted." });
    } catch (e: any) {
      setMessage({ type: "error", text: e?.message || "Failed to delete draft" });
    } finally {
      setIsSavingDraft(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 relative">
      <LoadingOverlay isVisible={isSending} message="Broadcasting newsletter..." />

      {/* Top Header Controls */}
      <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex-1 space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Select Clients</label>
              <div className="relative">
                <button 
                  onClick={() => setIsClientDropdownOpen(!isClientDropdownOpen)}
                  className="w-full h-14 px-6 rounded-2xl border border-slate-100 bg-slate-50/50 flex items-center justify-between hover:bg-white transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <Users className="h-5 w-5 text-slate-400 group-hover:text-primary transition-colors" />
                    <span className="text-sm font-bold text-slate-700">
                      {selectedRecipientIds.length === 0 
                        ? "Choose recipients..." 
                        : selectedRecipientIds.length === clients.length 
                          ? "All Clients Selected" 
                          : `${selectedRecipientIds.length} Clients Selected`}
                    </span>
                  </div>
                  <ChevronDown className={cn("h-5 w-5 text-slate-400 transition-transform", isClientDropdownOpen && "rotate-180")} />
                </button>

                {isClientDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsClientDropdownOpen(false)} />
                    <div className="absolute top-full left-0 right-0 mt-3 bg-white border border-slate-100 rounded-[32px] shadow-2xl z-20 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="p-4 border-b border-slate-50">
                        <div className="relative">
                          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                          <input 
                            type="text"
                            autoFocus
                            placeholder="Search clients..."
                            value={clientSearchQuery}
                            onChange={(e) => setClientSearchQuery(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-sm focus:ring-0 placeholder:text-slate-400"
                          />
                        </div>
                      </div>
                      <div className="max-h-[300px] overflow-y-auto custom-scrollbar py-2">
                        <button
                          onClick={selectAll}
                          className="w-full flex items-center justify-between px-6 py-3 hover:bg-slate-50 transition-colors group"
                        >
                          <span className="text-sm font-bold text-primary">Select All Clients</span>
                          <div className={cn(
                            "h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all",
                            selectedRecipientIds.length === clients.length ? "bg-primary border-primary" : "border-slate-200"
                          )}>
                            {selectedRecipientIds.length === clients.length && <Check className="h-3.5 w-3.5 text-white" />}
                          </div>
                        </button>
                        <div className="h-px bg-slate-50 my-1" />
                        {filteredClients.map(client => (
                          <button
                            key={client.id}
                            onClick={() => toggleRecipient(client.id)}
                            className="w-full flex items-center justify-between px-6 py-3 hover:bg-slate-50 transition-colors group"
                          >
                            <span className="text-sm font-bold text-slate-700">{client.name}</span>
                            <div className={cn(
                              "h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all",
                              selectedRecipientIds.includes(client.id) ? "bg-primary border-primary" : "border-slate-200"
                            )}>
                              {selectedRecipientIds.includes(client.id) && <Check className="h-3.5 w-3.5 text-white" />}
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
                onChange={(e) => setTemplate({ ...template, subject: e.target.value })}
                placeholder="Enter email subject..."
                className="w-full h-14 px-6 rounded-2xl border border-slate-100 bg-slate-50/50 text-sm font-bold text-slate-900 focus:bg-white focus:ring-4 focus:ring-primary/5 outline-none transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveDraft}
              disabled={isSending || isSavingDraft}
              className="h-14 px-8 rounded-2xl bg-white border border-slate-100 text-slate-700 font-black text-xs flex items-center gap-2 hover:bg-slate-50 transition-all active:scale-95 shadow-sm disabled:opacity-50"
              type="button"
              title={drafts.length >= 5 && !activeDraftId ? "Draft limit reached (5). Delete a draft to save another." : "Save draft"}
            >
              {isSavingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {activeDraftId ? "Update Draft" : "Save Draft"} ({Math.min(drafts.length, 5)}/5)
            </button>
            <button 
              onClick={handleSend}
              disabled={isSending}
              className="ui-button-primary h-14 px-10 flex items-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {isSending ? "Sending..." : "Send Email"}
            </button>
          </div>
        </div>

        {/* Drafts Panel */}
        <div className="pt-2 border-t border-slate-50">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saved drafts</div>
              <div className="text-xs font-bold text-slate-600 mt-1">
                {drafts.length === 0 ? "No drafts saved yet." : `You have ${drafts.length} saved draft${drafts.length === 1 ? "" : "s"}.`}
                {activeDraftId ? <span className="text-primary"> (editing a saved draft)</span> : null}
              </div>
            </div>
            {activeDraftId ? (
              <button
                type="button"
                onClick={() => {
                  setActiveDraftId(null);
                  setMessage({ type: "success", text: "Now saving as a new draft." });
                }}
                className="h-10 px-4 rounded-xl bg-slate-50 text-slate-700 text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all active:scale-95"
              >
                Save as new
              </button>
            ) : null}
          </div>

          {drafts.length > 0 ? (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {drafts.slice(0, 5).map((d) => (
                <div
                  key={d.id}
                  className={cn(
                    "rounded-[24px] border p-4 bg-white flex items-start justify-between gap-4",
                    activeDraftId === d.id ? "border-primary/30 bg-primary/5" : "border-slate-100"
                  )}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-black text-slate-900 truncate">{d.template?.subject || "Untitled"}</div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                      {d.updatedAt ? `Updated ${new Date(d.updatedAt).toLocaleString()}` : "Saved draft"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleLoadDraft(d)}
                      className="h-9 px-3 rounded-xl bg-slate-50 text-slate-700 text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all active:scale-95"
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDraft(d.id)}
                      className="h-9 w-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center hover:bg-rose-100 transition-all active:scale-95"
                      title="Delete draft"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {message && (
        <div className={cn(
          "p-4 rounded-[24px] flex items-center justify-between animate-in zoom-in duration-300",
          message.type === 'success' ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-rose-50 text-rose-700 border border-rose-100"
        )}>
          <div className="flex items-center gap-3">
            {message.type === 'success' ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
            <span className="text-sm font-bold">{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 items-start">
        {/* Editor Canvas */}
        <div className="space-y-6">
          <div className="bg-white p-1 rounded-[40px] border border-slate-100 shadow-sm overflow-hidden min-h-[600px] flex flex-col">
            <div className="flex-1 p-10 space-y-4 bg-slate-50/30">
              {template.blocks.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center py-20 text-slate-400">
                  <Plus className="h-10 w-10 mb-4 opacity-20" />
                  <p className="text-sm font-medium">Add a block to get started</p>
                </div>
              ) : (
                template.blocks.map((block, index) => (
                  <div 
                    key={block.id} 
                    className="group relative bg-white rounded-[24px] border border-slate-100 shadow-sm hover:shadow-md transition-all p-2"
                  >
                    {/* Block Actions (Floating) */}
                    <div className="absolute -right-12 top-0 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => moveBlock(index, 'up')}
                        disabled={index === 0}
                        className="h-8 w-8 rounded-full bg-white border border-slate-100 shadow-sm flex items-center justify-center text-slate-400 hover:text-slate-900 disabled:opacity-20 transition-all"
                      >
                        <ChevronDown className="h-4 w-4 rotate-180" />
                      </button>
                      <button 
                        onClick={() => moveBlock(index, 'down')}
                        disabled={index === template.blocks.length - 1}
                        className="h-8 w-8 rounded-full bg-white border border-slate-100 shadow-sm flex items-center justify-center text-slate-400 hover:text-slate-900 disabled:opacity-20 transition-all"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => removeBlock(block.id)}
                        className="h-8 w-8 rounded-full bg-white border border-rose-100 shadow-sm flex items-center justify-center text-rose-300 hover:text-rose-500 transition-all"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {block.type === "text" ? (
                      <div className="p-4">
                        <textarea 
                          value={block.content}
                          onChange={(e) => updateBlock(block.id, e.target.value)}
                          placeholder="Type your message here..."
                          rows={6}
                          className="w-full text-sm leading-relaxed text-slate-600 outline-none resize-none placeholder:text-slate-300"
                        />
                      </div>
                    ) : (
                      <div className="space-y-4 p-4">
                        <div 
                          className={cn(
                            "relative min-h-[120px] rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden mx-auto",
                            block.content ? "" : "bg-slate-50 border-2 border-dashed border-slate-200 hover:border-emerald-400 hover:bg-emerald-50"
                          )}
                          style={{ width: block.content ? `${block.width || 100}%` : '100%' }}
                          onClick={(e) => {
                            if ((e.target as HTMLElement).closest('.resize-slider')) return;
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'image/*';
                            input.onchange = (e: any) => {
                              const file = e.target.files?.[0];
                              if (file) handleImageUpload(block.id, file);
                            };
                            input.click();
                          }}
                        >
                          {block.content ? (
                            <>
                              <img src={block.content} className="w-full h-auto" alt="Block content" />
                              <div className="absolute inset-0 bg-slate-900/0 hover:bg-slate-900/40 transition-all flex items-center justify-center opacity-0 hover:opacity-100">
                                <div className="bg-white rounded-full p-2 shadow-lg">
                                  <Upload className="h-4 w-4 text-slate-600" />
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <ImageIcon className="h-8 w-8 text-slate-300 mb-2" />
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Click to upload image</p>
                            </>
                          )}
                        </div>
                        
                        {block.content && (
                          <div className="resize-slider flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest min-w-[60px]">Width: {block.width || 100}%</span>
                            <input 
                              type="range"
                              min="10"
                              max="100"
                              step="5"
                              value={block.width || 100}
                              onChange={(e) => updateBlockWidth(block.id, parseInt(e.target.value))}
                              className="flex-1 accent-primary h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Tokens/Variables */}
            <div className="px-10 py-6 border-t border-slate-50 flex flex-wrap gap-2 bg-white">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block w-full mb-1">Personalization Tags</span>
              {['@user_name', '@studio_name'].map(token => (
                <button 
                  key={token}
                  onClick={() => {
                    const lastTextBlock = [...template.blocks].reverse().find(b => b.type === 'text');
                    if (lastTextBlock) {
                      updateBlock(lastTextBlock.id, lastTextBlock.content + " " + token);
                    } else {
                      const newBlock: Block = { id: Math.random().toString(36).substr(2, 9), type: 'text', content: token, width: 100 };
                      setTemplate({ ...template, blocks: [...template.blocks, newBlock] });
                    }
                  }}
                  className="px-3 py-1.5 rounded-full bg-slate-100 text-[10px] font-bold text-slate-500 border border-slate-200 hover:bg-slate-200 transition-colors"
                >
                  {token}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Toolbar / Sidebar */}
        <div className="space-y-6 lg:sticky lg:top-8">
          <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest border-b border-slate-50 pb-4">Content Blocks</h3>
            
            <div className="grid grid-cols-1 gap-4">
              <button 
                onClick={() => addBlock('text')}
                className="flex items-center gap-4 p-4 rounded-2xl border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50 transition-all group"
              >
                <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-white group-hover:text-primary transition-colors">
                  <Type className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-slate-700">Text Block</p>
                  <p className="text-[10px] text-slate-400">Add a text section</p>
                </div>
              </button>

              <button 
                onClick={() => addBlock('image')}
                className="flex items-center gap-4 p-4 rounded-2xl border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50 transition-all group"
              >
                <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-white group-hover:text-primary transition-colors">
                  <ImageIcon className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-slate-700">Image Block</p>
                  <p className="text-[10px] text-slate-400">Upload a photo</p>
                </div>
              </button>
            </div>
          </div>

          <button 
            onClick={() => setShowPreview(true)}
            className="w-full h-16 rounded-[24px] bg-white border border-slate-100 shadow-sm hover:shadow-md hover:border-primary/20 hover:bg-slate-50 transition-all flex items-center justify-center gap-3 group"
          >
            <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-primary group-hover:bg-white transition-colors">
              <Eye className="h-5 w-5" />
            </div>
            <span className="text-sm font-bold text-slate-700">Preview Newsletter</span>
          </button>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowPreview(false)} />
          <div className="relative bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in duration-300">
            <div className="px-10 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <p className="text-[10px] font-bold text-primary uppercase tracking-widest">NEWSLETTER PREVIEW</p>
                <h3 className="text-lg font-bold text-slate-900">{template.subject}</h3>
              </div>
              <button onClick={() => setShowPreview(false)} className="h-12 w-12 rounded-full hover:bg-white flex items-center justify-center text-slate-400 transition-colors shadow-sm">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-10 max-h-[70vh] overflow-y-auto custom-scrollbar bg-white">
              <div className="max-w-md mx-auto space-y-6">
                {template.blocks.map(block => (
                  <div key={block.id}>
                    {block.type === 'text' ? (
                      <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                        {block.content.replaceAll("@user_name", "Sarah").replaceAll("@studio_name", "Media Drive")}
                      </div>
                    ) : (
                      block.content && (
                        <div 
                          className="rounded-2xl overflow-hidden shadow-sm border border-slate-100 mx-auto"
                          style={{ width: `${block.width || 100}%` }}
                        >
                          <img src={block.content} className="w-full h-auto" alt="Preview" />
                        </div>
                      )
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="px-10 py-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Broadcast Newsletter</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

