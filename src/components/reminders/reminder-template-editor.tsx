"use client";

import React, { useState, useRef, useEffect } from "react";
import { 
  Type, 
  Image as ImageIcon, 
  Trash2, 
  GripVertical, 
  Plus, 
  Save, 
  Upload, 
  ChevronDown,
  X,
  CheckCircle2,
  AlertCircle,
  Eye,
  Send,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { updateTenantReminderTemplate } from "@/app/actions/tenant-settings";
import { sendTestReminderAction } from "@/app/actions/reminder-test";

interface Block {
  id: string;
  type: "text" | "image";
  content: string;
  width?: number; // percentage, default 100
}

interface ReminderTemplate {
  enabled: boolean;
  hoursBefore: number;
  subject: string;
  blocks: Block[];
}

interface ReminderTemplateEditorProps {
  initialTemplate?: ReminderTemplate;
}

export function ReminderTemplateEditor({ initialTemplate }: ReminderTemplateEditorProps) {
  const [template, setTemplate] = useState<ReminderTemplate>(initialTemplate || {
    enabled: true,
    hoursBefore: 4,
    subject: "Reminder: Your upcoming shoot with @studio_name",
    blocks: [
      { id: "1", type: "text", content: "Hi @user_name,\n\nThis is a reminder about your upcoming booking.\n\nBooking Details:\nDate: @date\nTime: @time\nLocation: @location" }
    ]
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const mockData = {
    "@user_name": "Sarah Jenkins",
    "@date": "Monday, Jan 12th",
    "@time": "2:00 PM",
    "@location": "123 Ocean Ave, Bondi NSW",
    "@studio_name": "Media Drive"
  };

  const renderPreviewContent = (content: string) => {
    let replaced = content;
    Object.entries(mockData).forEach(([tag, val]) => {
      replaced = replaced.replaceAll(tag, val);
    });
    return replaced;
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

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const result = await updateTenantReminderTemplate(template);
      if (result.success) {
        setMessage({ type: 'success', text: "Template saved successfully!" });
      } else {
        setMessage({ type: 'error', text: result.error || "Failed to save template" });
      }
    } catch (err) {
      setMessage({ type: 'error', text: "An unexpected error occurred" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTest = async () => {
    setIsSendingTest(true);
    setMessage(null);
    try {
      const result = await sendTestReminderAction(template);
      if (result.success) {
        setMessage({ type: 'success', text: "Test email sent to your inbox!" });
      } else {
        setMessage({ type: 'error', text: result.error || "Failed to send test email" });
      }
    } catch (err) {
      setMessage({ type: 'error', text: "An unexpected error occurred" });
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 relative">
      <LoadingOverlay isVisible={isSaving} message="Saving template..." />
      <LoadingOverlay isVisible={isSendingTest} message="Sending test email..." />

      {/* Top Header Controls */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
        <div className="flex items-center gap-6">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Email Template Editor</h2>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ENABLED:</span>
              <button 
                onClick={() => setTemplate({ ...template, enabled: !template.enabled })}
                className={cn(
                  "relative h-6 w-11 rounded-full transition-all duration-300",
                  template.enabled ? "bg-primary" : "bg-slate-200"
                )}
              >
                <div className={cn(
                  "absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-300",
                  template.enabled ? "right-1" : "left-1"
                )} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Reminder Time</span>
            <div className="relative">
              <select 
                value={template.hoursBefore}
                onChange={(e) => setTemplate({ ...template, hoursBefore: parseInt(e.target.value) })}
                className="h-12 pl-4 pr-10 rounded-2xl border border-slate-100 bg-slate-50/50 text-sm font-bold text-slate-700 outline-none appearance-none hover:bg-white transition-all cursor-pointer min-w-[180px]"
              >
                {Array.from({ length: 24 }, (_, i) => i + 1).map(h => (
                  <option key={h} value={h}>{h} {h === 1 ? 'hour' : 'hours'} before</option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="ui-button-primary h-12 px-8 flex items-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSaving ? "Saving..." : "Save Template"}
          </button>
        </div>
      </div>

      {message && (
        <div className={cn(
          "p-4 rounded-2xl flex items-center justify-between animate-in zoom-in duration-300",
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
          <div className="bg-white p-1 rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
            {/* Subject Line Input */}
            <div className="px-10 py-6 border-b border-slate-50">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Subject Line</label>
              <input 
                type="text"
                value={template.subject}
                onChange={(e) => setTemplate({ ...template, subject: e.target.value })}
                placeholder="Email Subject..."
                className="w-full text-lg font-bold text-slate-900 placeholder:text-slate-300 outline-none border-none bg-transparent"
              />
            </div>

            {/* Blocks List */}
            <div className="p-10 space-y-4 min-h-[500px] bg-slate-50/30">
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
                            // Only trigger upload if clicking the image area, not the slider
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
            <div className="px-10 py-6 border-t border-slate-50 flex flex-wrap gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block w-full mb-1">Available Tags</span>
              {['@user_name', '@date', '@time', '@location', '@studio_name'].map(token => (
                <button 
                  key={token}
                  onClick={() => {
                    const lastTextBlock = [...template.blocks].reverse().find(b => b.type === 'text');
                    if (lastTextBlock) {
                      updateBlock(lastTextBlock.id, lastTextBlock.content + " " + token);
                    } else {
                      const newBlock: Block = {
                        id: Math.random().toString(36).substr(2, 9),
                        type: 'text',
                        content: token
                      };
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

          <div className="bg-emerald-900 p-8 rounded-[32px] text-white space-y-4 shadow-xl shadow-emerald-900/20">
            <h4 className="text-sm font-bold uppercase tracking-widest opacity-60">Helpful Tip</h4>
            <p className="text-xs leading-relaxed opacity-90">
              Use tags like <span className="font-bold opacity-100">@date</span> and <span className="font-bold opacity-100">@location</span> to automatically insert booking details into your reminder emails.
            </p>
          </div>

          <button 
            onClick={handleSendTest}
            disabled={isSendingTest}
            className="w-full h-16 rounded-[24px] bg-slate-900 text-white shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all flex items-center justify-center gap-3 group mb-4 disabled:opacity-50"
          >
            {isSendingTest ? (
              <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
            <span className="text-sm font-bold">Send Test Email</span>
          </button>

          <button 
            onClick={() => setShowPreview(true)}
            className="w-full h-16 rounded-[24px] bg-white border border-slate-100 shadow-sm hover:shadow-md hover:border-primary/20 hover:bg-slate-50 transition-all flex items-center justify-center gap-3 group"
          >
            <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-primary group-hover:bg-white transition-colors">
              <Eye className="h-5 w-5" />
            </div>
            <span className="text-sm font-bold text-slate-700">Preview Email</span>
          </button>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
          <div 
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
            onClick={() => setShowPreview(false)}
          />
          <div className="relative bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in duration-300">
            <div className="px-10 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <p className="text-[10px] font-bold text-primary uppercase tracking-widest">LIVE PREVIEW</p>
                <h3 className="text-lg font-bold text-slate-900">{renderPreviewContent(template.subject)}</h3>
              </div>
              <button 
                onClick={() => setShowPreview(false)}
                className="h-12 w-12 rounded-full hover:bg-white flex items-center justify-center text-slate-400 transition-colors shadow-sm"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-10 max-h-[70vh] overflow-y-auto custom-scrollbar bg-white">
              <div className="max-w-md mx-auto space-y-6">
                {template.blocks.map(block => (
                  <div key={block.id}>
                    {block.type === 'text' ? (
                      <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                        {renderPreviewContent(block.content)}
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
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sent via Studiio • Mock data used for tags</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

