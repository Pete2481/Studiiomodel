"use client";

import React, { useState, useEffect } from "react";
import { X, Plus, Trash2, Edit3, Save, DollarSign, User, Tag, Check, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { upsertEditTag, deleteEditTag } from "@/app/actions/edit-tag";

interface EditTag {
  id?: string;
  name: string;
  description: string;
  cost: number;
  specialistType: string;
  active: boolean;
}

interface EditTagsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialTags: EditTag[];
  onRefresh: () => void;
}

const SPECIALIST_TYPES = [
  { id: "PHOTO", label: "Photo Retoucher" },
  { id: "VIDEO", label: "Video Editor" },
  { id: "FLOORPLAN", label: "Floor Plan Artist" },
  { id: "STAGING", label: "Virtual Staging Specialist" },
  { id: "GENERAL", label: "General Admin" },
];

export function EditTagsDrawer({ isOpen, onClose, initialTags, onRefresh }: EditTagsDrawerProps) {
  const [tags, setTags] = useState<EditTag[]>(initialTags);
  const [editingTag, setEditingTag] = useState<EditTag | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddingNew, setIsAddingNew] = useState(false);

  // Form state for new/editing tag
  const [formData, setFormData] = useState<EditTag>({
    name: "",
    description: "",
    cost: 0,
    specialistType: "PHOTO",
    active: true,
  });

  useEffect(() => {
    setTags(initialTags);
  }, [initialTags]);

  const handleStartEdit = (tag: EditTag) => {
    setEditingTag(tag);
    setFormData(tag);
    setIsAddingNew(false);
  };

  const handleStartNew = () => {
    setEditingTag(null);
    setFormData({
      name: "",
      description: "",
      cost: 0,
      specialistType: "PHOTO",
      active: true,
    });
    setIsAddingNew(true);
  };

  const handleCancel = () => {
    setEditingTag(null);
    setIsAddingNew(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await upsertEditTag(formData);
      if (res.success) {
        onRefresh();
        handleCancel();
      } else {
        alert(res.error || "Failed to save tag");
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred while saving");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this tag? This cannot be undone.")) return;
    
    try {
      const res = await deleteEditTag(id);
      if (res.success) {
        onRefresh();
      } else {
        alert(res.error || "Failed to delete tag");
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred while deleting");
    }
  };

  return (
    <>
      <div 
        className={cn(
          "fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-[2px] transition-all duration-500",
          isOpen ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"
        )}
        onClick={onClose}
      />
      
      <div className={cn(
        "fixed inset-y-0 right-0 z-[101] w-full max-w-[600px] bg-white shadow-2xl flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}>
        <div className="px-8 py-6 flex items-start justify-between border-b border-slate-50">
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">Retouching & Revisions</p>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Edit Tag Catalogue</h2>
          </div>
          <button onClick={onClose} className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-slate-50 text-slate-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar">
          {/* Tag Editor Form */}
          {(isAddingNew || editingTag) ? (
            <form onSubmit={handleSubmit} className="space-y-6 bg-slate-50 p-6 rounded-[32px] border border-slate-100 animate-in fade-in zoom-in duration-300 mb-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight">
                  {isAddingNew ? "Add New Tag" : `Editing: ${editingTag?.name}`}
                </h3>
                <button type="button" onClick={handleCancel} className="text-xs font-bold text-slate-400 hover:text-slate-600">Cancel</button>
              </div>

              <div className="grid grid-cols-1 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">Tag Name</label>
                  <input 
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Sky Replacement"
                    className="ui-input-tight bg-white"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">Description</label>
                  <textarea 
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Briefly describe what this edit involves..."
                    className="ui-input-tight bg-white h-24 py-4 resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">Cost ($)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input 
                        type="number"
                        step="0.01"
                        required
                        value={formData.cost}
                        onChange={(e) => setFormData({ ...formData, cost: parseFloat(e.target.value) })}
                        placeholder="0.00"
                        className="ui-input-tight pl-10 bg-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">Specialist Type</label>
                    <div className="relative">
                      <select 
                        value={formData.specialistType}
                        onChange={(e) => setFormData({ ...formData, specialistType: e.target.value })}
                        className="ui-input-tight bg-white appearance-none pr-10"
                      >
                        {SPECIALIST_TYPES.map(type => (
                          <option key={type.id} value={type.id}>{type.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex items-center gap-3">
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="flex-1 h-12 rounded-full bg-rose-500 text-white font-bold shadow-lg shadow-rose-500/20 hover:bg-rose-600 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                    <>
                      <Save className="h-4 w-4" />
                      Save Tag
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <button 
              onClick={handleStartNew}
              className="w-full h-16 rounded-[24px] border-2 border-dashed border-slate-200 hover:border-rose-400 hover:bg-rose-50/30 transition-all flex items-center justify-center gap-2 group mb-8"
            >
              <div className="h-8 w-8 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center group-hover:bg-rose-500 group-hover:text-white transition-all">
                <Plus className="h-4 w-4" />
              </div>
              <span className="text-sm font-bold text-slate-500 group-hover:text-rose-600">Create New Edit Tag</span>
            </button>
          )}

          {/* Tag List */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-4 mb-4 flex items-center gap-2">
              <Tag className="h-3 w-3" />
              Existing Tags ({tags.length})
            </h3>
            {tags.map((tag) => (
              <div 
                key={tag.id}
                className={cn(
                  "group bg-white rounded-[28px] border border-slate-100 p-5 hover:border-rose-200 hover:shadow-xl hover:shadow-rose-100/20 transition-all flex items-center gap-4",
                  editingTag?.id === tag.id && "ring-2 ring-rose-500 ring-offset-2 border-rose-500"
                )}
              >
                <div className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
                  <Tag className="h-5 w-5" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-900 truncate">{tag.name}</h4>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[9px] font-black text-slate-500 uppercase tracking-widest border border-slate-200">
                      {SPECIALIST_TYPES.find(t => t.id === tag.specialistType)?.label || tag.specialistType}
                    </span>
                  </div>
                  <p className="text-[11px] font-medium text-slate-400 line-clamp-1 mt-0.5">{tag.description || "No description provided."}</p>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-slate-900">${tag.cost.toFixed(2)}</p>
                  <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-tighter">Per Image</p>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => handleStartEdit(tag)}
                    className="h-9 w-9 rounded-xl text-slate-400 hover:bg-slate-50 hover:text-rose-500 transition-all flex items-center justify-center"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button 
                    onClick={() => tag.id && handleDelete(tag.id)}
                    className="h-9 w-9 rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-all flex items-center justify-center"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}

            {tags.length === 0 && !isAddingNew && (
              <div className="py-20 text-center bg-slate-50 rounded-[32px] border border-dashed border-slate-200">
                <Tag className="h-10 w-10 text-slate-200 mx-auto mb-4" />
                <p className="text-sm font-bold text-slate-400">Your catalogue is empty</p>
                <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-1">Start by adding common edit types</p>
              </div>
            )}
          </div>
        </div>

        <div className="px-8 py-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between rounded-b-[32px]">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Catalogue Management v1.0</p>
          <button 
            onClick={onClose}
            className="px-6 py-2 rounded-full border border-slate-200 font-bold text-xs text-slate-600 hover:bg-white transition-all shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
}

