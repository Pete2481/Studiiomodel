"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { upsertGallery } from "@/app/actions/gallery";
import { upsertBooking } from "@/app/actions/booking-upsert";
import { upsertClient } from "@/app/actions/client";
import { upsertService } from "@/app/actions/service";
import { createEditRequest } from "@/app/actions/edit-request";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";

interface QuickActionModalsProps {
  activeModal: string | null;
  onClose: () => void;
  clients: { id: string; name: string }[];
  agents: { id: string; name: string; clientId: string }[];
  galleries: { id: string; title: string }[];
}

export default function QuickActionModals({ 
  activeModal, 
  onClose, 
  clients, 
  agents, 
  galleries 
}: QuickActionModalsProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quickActionAddress, setQuickActionAddress] = useState("");

  if (!activeModal) return null;

  async function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);

    try {
      if (activeModal === "gallery") {
        await upsertGallery({
          title: formData.get("title") as string,
          clientId: formData.get("clientId") as string,
          agentId: formData.get("agentId") as string,
          status: (formData.get("status") as string) || "DRAFT"
        });
      } else if (activeModal === "appointment") {
        await upsertBooking({
          title: formData.get("title"),
          clientId: formData.get("clientId"),
          address: formData.get("address"),
          startAt: formData.get("date") ? `${formData.get("date")}T09:00:00` : new Date().toISOString(),
          status: "PENCILLED"
        });
      } else if (activeModal === "client") {
        await upsertClient({
          name: formData.get("name"),
          businessName: formData.get("businessName"),
          email: formData.get("email"),
          status: "PENDING"
        });
      } else if (activeModal === "service") {
        await upsertService({
          name: formData.get("name") as string,
          description: formData.get("description") as string,
          price: formData.get("price") as string,
          durationMinutes: formData.get("duration") as string,
        });
      } else if (activeModal === "edit") {
        await createEditRequest({
          galleryId: formData.get("galleryId") as string,
          note: formData.get("note") as string,
          tagIds: [],
          fileUrl: "TBD",
        });
      }
      onClose();
    } catch (error) {
      console.error("Action failed:", error);
      alert("Failed to create. Please check the details.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-6">
      <div className="bg-white w-full max-w-xl rounded-[32px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-slate-900 capitalize">
              {activeModal === "gallery" && "Add New Gallery"}
              {activeModal === "appointment" && "New Appointment"}
              {activeModal === "invoice" && "Generate Invoice"}
              {activeModal === "client" && "Invite New Client"}
              {activeModal === "service" && "Add New Service"}
              {activeModal === "edit" && "New Edit Request"}
            </h3>
            <p className="text-sm font-medium text-slate-500">Complete the details below.</p>
          </div>
          <button 
            onClick={onClose}
            className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors text-slate-400"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <form onSubmit={handleFormSubmit} className="p-8">
          <div className="space-y-6">
            {activeModal === "edit" ? (
              <>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Select Gallery</label>
                  <select name="galleryId" required className="ui-input appearance-none bg-white">
                    <option value="">Choose gallery...</option>
                    {galleries.map(g => (
                      <option key={g.id} value={g.id}>{g.title}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Instructions</label>
                  <textarea name="note" required placeholder="What needs editing?" className="ui-input h-32 py-4 resize-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Tags (Comma separated)</label>
                  <input name="tags" type="text" placeholder="Sky Replacement, Color Correction" className="ui-input" />
                </div>
              </>
            ) : activeModal === "service" ? (
              <>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Service Name</label>
                  <input name="name" required type="text" placeholder="Standard Shoot" className="ui-input" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Description</label>
                  <textarea name="description" placeholder="Describe the service..." className="ui-input h-24 py-4 resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Price ($)</label>
                    <input name="price" required type="number" step="0.01" placeholder="250" className="ui-input" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Duration (mins)</label>
                    <input name="duration" required type="number" placeholder="60" className="ui-input" />
                  </div>
                </div>
              </>
            ) : activeModal === "client" ? (
              <>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Full Name</label>
                  <input name="name" required type="text" placeholder="John Doe" className="ui-input" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Agency / Business Name</label>
                  <input name="businessName" required type="text" placeholder="Ray White" className="ui-input" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Email Address</label>
                  <input name="email" required type="email" placeholder="john@agency.com" className="ui-input" />
                </div>
              </>
            ) : activeModal === "gallery" ? (
              <>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Gallery Title / Address</label>
                  <input name="title" required type="text" placeholder="e.g. 4/17 Mahogany Drive, Byron Bay" className="ui-input" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Primary Client</label>
                    <select name="clientId" required className="ui-input appearance-none bg-white">
                      <option value="">Select client...</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Lead Agent</label>
                    <select name="agentId" className="ui-input appearance-none bg-white">
                      <option value="">Select agent (Optional)</option>
                      {agents.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Initial Status</label>
                  <select name="status" className="ui-input appearance-none bg-white">
                    <option value="DRAFT">DRAFT (Hidden)</option>
                    <option value="READY">READY (Live)</option>
                  </select>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Subject / Title</label>
                  <input name="title" required type="text" placeholder="Enter name..." className="ui-input" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Primary Client</label>
                    <select name="clientId" required className="ui-input appearance-none bg-white">
                      <option value="">Select client...</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Property Address</label>
                    <AddressAutocomplete 
                      name="address"
                      required
                      value={quickActionAddress}
                      onChange={setQuickActionAddress}
                      placeholder="Search address..." 
                      className="ui-input" 
                    />
                  </div>
                </div>

                {activeModal === "appointment" && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-4">Shoot Date</label>
                    <input name="date" required type="date" className="ui-input" />
                  </div>
                )}
              </>
            )}
            
            <div className="pt-4 flex items-center gap-3">
              <button 
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 h-12 rounded-full border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                type="submit"
                disabled={isSubmitting}
                className="flex-1 h-12 rounded-full bg-[var(--primary)] text-white font-bold shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ boxShadow: `0 10px 15px -3px var(--primary-soft)` }}
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSubmitting ? "Creating..." : `Create ${activeModal === 'appointment' ? 'Appointment' : activeModal === 'edit' ? 'Request' : activeModal}`}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

