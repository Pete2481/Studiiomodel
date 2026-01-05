"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { 
  Plus, 
  Search, 
  Filter, 
  MoreHorizontal, 
  MessageSquare, 
  Paperclip, 
  Star, 
  CheckCircle2, 
  Clock,
  ChevronDown,
  LayoutGrid,
  List as ListIcon,
  Tag,
  ChevronRight,
  Eye,
  DollarSign,
  ArrowRight,
  User,
  Image as ImageIcon,
  PenTool,
  X,
  Video,
  FileJson,
  Download,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EditTagsDrawer } from "./edit-tags-drawer";
import { updateEditRequestStatus, updateEditRequestAssignments, exportGalleryEditRequests } from "@/app/actions/edit-request";
import { createInvoiceFromEditRequests } from "@/app/actions/invoice";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

interface EditRequestsContentProps {
  initialRequests: any[];
  initialTags: any[];
  teamMembers: any[];
  user: any;
  isActionLocked?: boolean;
}

export function EditRequestsContent({ initialRequests, initialTags, teamMembers, user, isActionLocked = false }: EditRequestsContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [requests, setRequests] = useState(initialRequests);
  const [tags, setTags] = useState(initialTags);
  const [isTagsDrawerOpen, setIsTagsDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedGalleries, setExpandedGalleries] = useState<string[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [isCreatingInvoice, setIsCreatingInvoice] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  useEffect(() => {
    setTags(initialTags);
  }, [initialTags]);

  useEffect(() => {
    const requestId = searchParams.get("requestId");
    if (requestId) {
      const request = requests.find(r => r.id === requestId);
      if (request) {
        setSelectedRequest(request);
        if (!expandedGalleries.includes(request.galleryId)) {
          setExpandedGalleries(prev => [...prev, request.galleryId]);
        }
      }
      
      // Silent cleanup
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.delete("requestId");
      const cleanUrl = pathname + (newParams.toString() ? `?${newParams.toString()}` : "");
      window.history.replaceState({}, '', cleanUrl);
    }
  }, [searchParams, pathname, requests]);

  const handleCreateInvoice = async (galleryId: string) => {
    setIsCreatingInvoice(galleryId);
    try {
      const res = await createInvoiceFromEditRequests(galleryId);
      if (res.success && res.invoiceId) {
        router.push(`/tenant/invoices/${res.invoiceId}/edit`);
      } else {
        alert(res.error || "Failed to create invoice.");
      }
    } catch (err) {
      console.error("Invoice creation error:", err);
      alert("An unexpected error occurred.");
    } finally {
      setIsCreatingInvoice(null);
    }
  };

  // Grouping Logic
  const groupedRequests = useMemo(() => {
    const filtered = requests.filter(r => 
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.property.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.client.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const groups: { [key: string]: any } = {};
    filtered.forEach(r => {
      if (!groups[r.galleryId]) {
        groups[r.galleryId] = {
          id: r.galleryId,
          property: r.property,
          client: r.client,
          requests: [],
          totalCost: 0,
          unbilledCost: 0,
          pendingCount: 0,
          invoice: r.invoice // Capture the invoice from any request in the group
        };
      }
      groups[r.galleryId].requests.push(r);
      groups[r.galleryId].totalCost += r.totalCost;
      if (r.status !== 'COMPLETED') {
        groups[r.galleryId].unbilledCost += r.totalCost;
        groups[r.galleryId].pendingCount++;
      }
    });

    return Object.values(groups);
  }, [requests, searchQuery]);

  const toggleGallery = (id: string) => {
    setExpandedGalleries(prev => 
      prev.includes(id) ? prev.filter(gid => gid !== id) : [...prev, id]
    );
  };

  const handleStatusUpdate = async (id: string, newStatus: string) => {
    setUpdatingStatusId(id);
    try {
      const res = await updateEditRequestStatus(id, newStatus);
      if (res.success) {
        setRequests(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
        // Also update selectedRequest if it's the one being changed
        if (selectedRequest?.id === id) {
          setSelectedRequest((prev: any) => ({ ...prev, status: newStatus }));
        }
      }
    } catch (err) {
      console.error("Status update error:", err);
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleAssignmentUpdate = async (id: string, assignedToIds: string[]) => {
    try {
      const res = await updateEditRequestAssignments(id, assignedToIds);
      if (res.success) {
        setRequests(prev => prev.map(r => r.id === id ? { ...r, assignedToIds } : r));
        if (selectedRequest?.id === id) {
          setSelectedRequest((prev: any) => ({ ...prev, assignedToIds }));
        }
      }
    } catch (err) {
      console.error("Assignment update error:", err);
    }
  };

  const handleExport = async (galleryId: string, format: 'fcpxml' | 'resolve' | 'csv' | 'json' | 'markdown', requestId?: string) => {
    try {
      const res = await exportGalleryEditRequests(galleryId, format, requestId);
      if (res.success && res.content && res.filename) {
        const mimeType = format === 'json' ? 'application/json' : 
                         format === 'csv' ? 'text/csv' : 
                         format === 'markdown' ? 'text/markdown' : 'text/xml';
        const blob = new Blob([res.content], { type: mimeType });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        alert(res.error || "Export failed.");
      }
    } catch (err) {
      console.error("Export error:", err);
      alert("An unexpected error occurred during export.");
    }
  };

  const showFinancials = user.role === "TENANT_ADMIN" || user.role === "ADMIN" || user.role === "ACCOUNTS";
  const isRestrictedRole = !showFinancials && user.role !== "CLIENT" && user.role !== "AGENT";

  return (
    <div className="space-y-8">
      {/* Top Action Bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search by address or client..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ui-input w-80 pl-11" 
            />
          </div>
          <button className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:text-slate-900 transition-colors shadow-sm">
            <Filter className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          {showFinancials && (
            <button 
              onClick={() => setIsTagsDrawerOpen(true)}
              className="h-11 px-6 rounded-full bg-white border border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-widest hover:border-rose-200 hover:text-rose-500 transition-all flex items-center gap-2 shadow-sm"
            >
              <Tag className="h-3.5 w-3.5" />
              Tag Settings
            </button>
          )}
          
          {showFinancials && (
            <button 
              onClick={() => {
                if (isActionLocked) {
                  window.location.href = "/tenant/settings?tab=billing";
                  return;
                }
                // Open new request modal if one exists, or redirect
                alert("New requests are created from within galleries.");
              }}
              className={cn(
                "h-11 px-6 rounded-full bg-primary text-white font-bold text-xs uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-primary/20 hover:scale-105 transition-all",
                isActionLocked && "opacity-50 grayscale hover:grayscale-0 transition-all"
              )}
            >
              <Plus className="h-4 w-4" />
              {isActionLocked ? "Sub Required" : "New Request"}
            </button>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="flex items-center gap-8 text-[11px] font-black text-slate-400 uppercase tracking-widest px-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-blue-500" />
          {requests.filter(r => r.status === 'NEW').length} New
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          {requests.filter(r => r.status === 'IN_PROGRESS').length} In Progress
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          {requests.filter(r => r.status === 'COMPLETED').length} Completed
        </div>
      </div>

      {/* Grouped Request List */}
      <div className="space-y-4">
        {groupedRequests.map((group) => {
          const isExpanded = expandedGalleries.includes(group.id);
          return (
            <div key={group.id} className="ui-card overflow-hidden p-0 border-slate-100 bg-white group/card">
              {/* Group Header */}
              <div 
                className={cn(
                  "flex items-center justify-between px-8 py-6 cursor-pointer transition-colors",
                  isExpanded ? "bg-slate-50/50" : "hover:bg-slate-50/30"
                )}
                onClick={() => toggleGallery(group.id)}
              >
                <div className="flex items-center gap-6">
                  <div className={cn(
                    "h-10 w-10 rounded-2xl flex items-center justify-center transition-all",
                    group.pendingCount === 0 ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400"
                  )}>
                    {group.pendingCount === 0 ? <CheckCircle2 className="h-5 w-5" /> : <ChevronRight className={cn("h-5 w-5 transition-transform", isExpanded && "rotate-90")} />}
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-900 tracking-tight">
                      {group.property}
                    </h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.1em]">
                        {group.client} &bull; {group.requests.length} Requests
                      </p>
                      {group.requests.some((r: any) => r.assignedToIds?.length > 0) && (
                        <div className="flex -space-x-1 ml-2">
                          {Array.from(new Set(group.requests.flatMap((r: any) => r.assignedToIds))).map((id: any) => {
                            const member = teamMembers.find(m => m.id === id);
                            return (
                              <div key={id} className="h-4 w-4 rounded-full border border-white bg-slate-100 flex items-center justify-center text-[6px] font-bold text-slate-500 overflow-hidden" title={member?.name}>
                                {member?.avatarUrl ? <img src={member.avatarUrl} className="h-full w-full object-cover" /> : member?.name?.[0]}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-8">
                  {group.pendingCount === 0 ? (
                    <div className="flex items-center gap-4">
                      <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-200">
                        Task Completed
                      </span>
                      {showFinancials && (
                        <div className="flex flex-col items-center">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCreateInvoice(group.id);
                            }}
                            disabled={isCreatingInvoice === group.id}
                            className={cn(
                              "h-10 px-6 rounded-full text-[11px] font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg",
                              group.invoice 
                                ? "bg-slate-100 text-slate-400 cursor-default shadow-none" 
                                : "bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-200"
                            )}
                          >
                            <DollarSign className="h-3.5 w-3.5" />
                            {isCreatingInvoice === group.id ? "Creating..." : group.invoice ? "Invoiced" : "Invoice Job"}
                          </button>
                          {group.invoice && (
                            <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest mt-1.5 animate-in fade-in">
                              Invoice Created
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    showFinancials && (
                      <div className="flex flex-col items-end">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Unbilled Edits</p>
                        <p className="text-lg font-bold text-slate-900">${group.unbilledCost.toFixed(2)}</p>
                      </div>
                    )
                  )}
                  <div className="h-10 w-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors">
                    {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                  </div>
                </div>
              </div>

              {/* Group Items */}
              {isExpanded && (
                <div className="divide-y divide-slate-50 border-t border-slate-50 animate-in slide-in-from-top-2 duration-300">
                  {group.requests.map((request: any) => (
                    <div 
                      key={request.id} 
                      className="flex items-start gap-8 px-8 py-8 hover:bg-slate-50/20 transition-all cursor-pointer group/item"
                      onClick={() => setSelectedRequest(request)}
                    >
                      <div className="h-24 w-32 rounded-2xl bg-slate-100 overflow-hidden shrink-0 border border-slate-200 relative">
                        {request.thumbnailUrl ? (
                          <img src={request.thumbnailUrl} className="h-full w-full object-cover" />
                        ) : (request.metadata?.videoTimestamp !== undefined && request.metadata?.videoTimestamp !== null) || request.metadata?.isBundled ? (
                          <div className="h-full w-full flex flex-col items-center justify-center bg-slate-900 text-white gap-2">
                            <Video className="h-6 w-6 text-primary" />
                            <span className="text-[9px] font-black uppercase tracking-widest">
                              {request.metadata?.isBundled ? "Video Review" : "Video Edit"}
                            </span>
                          </div>
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-slate-300">
                            <ImageIcon className="h-8 w-8" />
                          </div>
                        )}
                        {request.metadata?.drawing && (
                          <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                            <PenTool className="h-5 w-5 text-primary" />
                          </div>
                        )}
                        {request.metadata?.videoTimestamp !== undefined && request.metadata?.videoTimestamp !== null && (
                          <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/60 backdrop-blur-md rounded text-[8px] font-black text-white uppercase tracking-widest">
                            {Math.floor(Number(request.metadata.videoTimestamp) / 60)}:{(Number(request.metadata.videoTimestamp) % 60).toString().padStart(2, '0')}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <h5 className="text-sm font-bold text-slate-900">
                              {request.metadata?.isBundled ? "Bundled Video Review" : request.title}
                            </h5>
                            <StatusBadge status={request.status} />
                          </div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{request.timestamp}</p>
                        </div>
                        
                        <p className={cn(
                          "text-sm text-slate-500 leading-relaxed line-clamp-2 max-w-2xl",
                          request.metadata?.isBundled && "font-medium text-slate-600"
                        )}>
                          {request.note}
                        </p>

                        <div className="flex items-center gap-4">
                          <div className="flex flex-wrap gap-2">
                            {request.selectedTags.map((tag: any) => (
                              <span key={tag.id} className="px-2.5 py-0.5 bg-slate-100 text-slate-600 rounded-lg text-[9px] font-black uppercase tracking-widest border border-slate-200">
                                {tag.name}
                              </span>
                            ))}
                          </div>
                          {showFinancials && (
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                              &bull; Total: ${request.totalCost.toFixed(2)}
                            </span>
                          )}
                          {request.assignedToIds?.length > 0 && (
                            <div className="flex -space-x-2 ml-4">
                              {request.assignedToIds.map((id: string) => {
                                const member = teamMembers.find(m => m.id === id);
                                return (
                                  <div key={id} className="h-6 w-6 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[8px] font-bold text-slate-500 overflow-hidden" title={member?.name}>
                                    {member?.avatarUrl ? <img src={member.avatarUrl} className="h-full w-full object-cover" /> : member?.name?.[0]}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 self-center">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRequest(request);
                          }}
                          className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:bg-slate-50 transition-all flex items-center gap-2"
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </button>
                        {request.status !== 'COMPLETED' ? (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStatusUpdate(request.id, 'COMPLETED');
                            }}
                            disabled={updatingStatusId === request.id}
                            className="h-10 px-6 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 flex items-center justify-center gap-2"
                          >
                            {updatingStatusId === request.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : "Mark Done"}
                          </button>
                        ) : (
                          showFinancials && (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStatusUpdate(request.id, 'IN_PROGRESS');
                              }}
                              disabled={updatingStatusId === request.id}
                              className="h-10 px-6 rounded-xl bg-slate-100 text-slate-400 text-xs font-bold hover:bg-slate-200 hover:text-slate-900 transition-all flex items-center justify-center gap-2"
                            >
                              {updatingStatusId === request.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : "Undo"}
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {groupedRequests.length === 0 && (
          <div className="py-20 text-center text-slate-400 text-sm font-medium bg-slate-50/50 rounded-[48px] border-2 border-dashed border-slate-100">
            No edit requests match your search.
          </div>
        )}
      </div>

      {/* Detail Slider / Drawing Viewer */}
      {selectedRequest && (
        <RequestDetailDrawer 
          request={selectedRequest} 
          teamMembers={teamMembers}
          user={user}
          onClose={() => setSelectedRequest(null)}
          onStatusUpdate={handleStatusUpdate}
          onAssignmentUpdate={handleAssignmentUpdate}
          onExport={handleExport}
        />
      )}

      <EditTagsDrawer 
        isOpen={isTagsDrawerOpen}
        onClose={() => setIsTagsDrawerOpen(false)}
        initialTags={tags}
        onRefresh={() => router.refresh()}
      />
    </div>
  );
}

function RequestDetailDrawer({ 
  request, 
  teamMembers, 
  user,
  onClose, 
  onStatusUpdate, 
  onAssignmentUpdate,
  onExport
}: { 
  request: any, 
  teamMembers: any[],
  user: any,
  onClose: () => void, 
  onStatusUpdate: any,
  onAssignmentUpdate: any,
  onExport: any
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  
  const showFinancials = user.role === "TENANT_ADMIN" || user.role === "ADMIN" || user.role === "ACCOUNTS";
  const isRestrictedRole = !showFinancials && user.role !== "CLIENT" && user.role !== "AGENT";

  // Drawing overlay logic
  useEffect(() => {
    if (!request.metadata?.drawing || !canvasRef.current || !containerRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.src = request.fileUrl;
    img.onload = () => {
      const container = containerRef.current;
      if (!container) return;

      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      const imgRatio = img.width / img.height;
      const containerRatio = containerWidth / containerHeight;

      let dWidth, dHeight;
      if (imgRatio > containerRatio) {
        dWidth = containerWidth;
        dHeight = containerWidth / imgRatio;
      } else {
        dHeight = containerHeight;
        dWidth = containerHeight * imgRatio;
      }

      canvas.width = dWidth;
      canvas.height = dHeight;

      // Draw original drawing paths
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      
      const drawingData = Array.isArray(request.metadata.drawing) ? request.metadata.drawing : [];
      
      drawingData.forEach((item: any) => {
        if (item.type === "path" || !item.type) {
          // Backward compatibility: old data was just an array of paths
          const path = item.points ? item : { points: item.points, tool: item.tool };
          if (path.points && path.points.length >= 2) {
            ctx.beginPath();
            ctx.strokeStyle = path.tool === "eraser" ? "rgba(0,0,0,1)" : "rgba(255, 0, 0, 0.8)";
            ctx.globalCompositeOperation = path.tool === "eraser" ? "destination-out" : "source-over";
            ctx.lineWidth = path.tool === "eraser" ? 20 : 4;
            
            ctx.moveTo(path.points[0].x * dWidth, path.points[0].y * dHeight);
            for (let i = 1; i < path.points.length; i++) {
              ctx.lineTo(path.points[i].x * dWidth, path.points[i].y * dHeight);
            }
            ctx.stroke();
          }
        }
      });
    };
  }, [request]);

  const textAnnotations = React.useMemo(() => {
    if (!request.metadata?.drawing || !Array.isArray(request.metadata.drawing)) return [];
    return request.metadata.drawing.filter((item: any) => item.type === "text");
  }, [request]);

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-[101] w-full max-w-3xl bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-500">
        <div className="p-8 border-b border-slate-50 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[10px] font-black text-primary uppercase tracking-widest">EDIT REQUEST DETAIL</p>
            <h3 className="text-2xl font-bold text-slate-900 tracking-tight">{request.title}</h3>
          </div>
          <button onClick={onClose} className="h-12 w-12 rounded-full hover:bg-slate-50 flex items-center justify-center text-slate-400">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 space-y-12 custom-scrollbar">
          {/* Main Visual Proof */}
          <div className="space-y-4">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {request.metadata?.videoTimestamp !== null ? "Video Reference" : "Visual Feedback"}
            </label>
            <div 
              ref={containerRef}
              className="relative aspect-video rounded-3xl bg-slate-900 border border-slate-100 overflow-hidden flex items-center justify-center shadow-inner"
            >
              {request.metadata?.videoTimestamp !== null ? (
                <div className="flex flex-col items-center justify-center gap-4">
                  <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Video className="h-10 w-10" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-xl font-bold text-white tracking-tight">Video Edit Request</p>
                    <p className="text-sm font-medium text-slate-400">Timestamp: {Math.floor(request.metadata.videoTimestamp / 60)}:{(request.metadata.videoTimestamp % 60).toString().padStart(2, '0')}</p>
                  </div>
                  <a 
                    href={request.fileUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="mt-4 px-6 py-2 bg-white rounded-full text-[10px] font-black uppercase tracking-widest text-slate-900 hover:bg-slate-100 transition-all"
                  >
                    View Original Video
                  </a>
                </div>
              ) : (
                <>
                  <img src={request.fileUrl} className="max-h-full max-w-full object-contain opacity-80" />
                  <canvas ref={canvasRef} className="absolute z-10 pointer-events-none" />
                  
                  {/* Text Annotations Overlay */}
                  {textAnnotations.map((t: any) => (
                    <div
                      key={t.id}
                      style={{
                        position: "absolute",
                        left: `${t.x * 100}%`,
                        top: `${t.y * 100}%`,
                        transform: "translate(-50%, -50%)",
                      }}
                      className="z-20 pointer-events-auto"
                    >
                      <div className="bg-white/90 backdrop-blur-sm rounded-lg border border-slate-200 shadow-lg p-2 min-w-[60px] max-w-[150px]">
                        <p className="text-[10px] font-bold text-slate-900 leading-tight break-words">
                          {t.content}
                        </p>
                      </div>
                    </div>
                  ))}

                  <div className="absolute bottom-6 right-6 px-4 py-2 bg-black/40 backdrop-blur-md rounded-full border border-white/10">
                    <p className="text-[9px] font-black text-white/80 uppercase tracking-widest flex items-center gap-2">
                      <Eye className="h-3 w-3" />
                      Drawing Overlay Active
                    </p>
                  </div>
                </>
              )}
            </div>
                     <div className="flex items-center justify-between">
               <div className="flex items-center gap-4">
                 <div className="flex flex-wrap gap-2">
                   {request.selectedTags.map((tag: any) => (
                     <span key={tag.id} className="px-3 py-1 bg-slate-100 text-slate-900 rounded-full text-[10px] font-black uppercase tracking-widest">
                       {tag.name}
                     </span>
                   ))}
                 </div>
               </div>
               {showFinancials && (
                 <p className="text-sm font-bold text-slate-900">Cost: ${request.totalCost.toFixed(2)}</p>
               )}
            </div>
          </div>

          {/* Details */}
          <div className="grid grid-cols-2 gap-10">
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Client & Property</label>
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-900">{request.property}</p>
                <p className="text-xs text-slate-500">{request.client}</p>
              </div>
              <div className="pt-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Assigned Editor</p>
                <div className="flex flex-wrap gap-2">
                  {request.assignedToIds?.length > 0 ? (
                    request.assignedToIds.map((id: string) => {
                      const member = teamMembers.find(m => m.id === id);
                      return (
                        <div key={id} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-full border border-slate-100 group/assign">
                          {member?.avatarUrl ? (
                            <img src={member.avatarUrl} className="h-5 w-5 rounded-full object-cover" />
                          ) : (
                            <div className="h-5 w-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500">
                              {member?.name?.[0] || "?"}
                            </div>
                          )}
                          <span className="text-xs font-bold text-slate-700">{member?.name || "Unknown"}</span>
                          {showFinancials && (
                            <button 
                              onClick={() => onAssignmentUpdate(request.id, request.assignedToIds.filter((aid: string) => aid !== id))}
                              className="text-slate-300 hover:text-rose-500 transition-colors ml-1"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs font-medium text-slate-400 italic">No editor assigned</p>
                  )}
                  {showFinancials && (
                    <button 
                      onClick={() => setIsAssigning(!isAssigning)}
                      className="h-8 w-8 rounded-full border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-400 hover:border-primary hover:text-primary transition-all"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {isAssigning && (
                  <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Select Team Member</p>
                    <div className="grid grid-cols-1 gap-1 max-h-48 overflow-y-auto custom-scrollbar">
                      {teamMembers.map(member => (
                        <button
                          key={member.id}
                          onClick={() => {
                            const newIds = request.assignedToIds.includes(member.id)
                              ? request.assignedToIds.filter((id: string) => id !== member.id)
                              : [...(request.assignedToIds || []), member.id];
                            onAssignmentUpdate(request.id, newIds);
                            setIsAssigning(false);
                          }}
                          className={cn(
                            "flex items-center gap-3 p-2 rounded-xl text-left transition-all",
                            request.assignedToIds?.includes(member.id) ? "bg-primary/10 text-primary" : "hover:bg-white text-slate-600"
                          )}
                        >
                          <div className="h-6 w-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold">
                            {member.name[0]}
                          </div>
                          <span className="text-xs font-bold">{member.name}</span>
                          <span className="text-[9px] font-black text-slate-300 ml-auto">{member.role}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Timeline</label>
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-900">Requested {request.timestamp}</p>
                <p className="text-xs text-slate-500">Currently {request.status}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Client Instructions</label>
            <div className="p-6 rounded-[32px] bg-slate-50 border border-slate-100 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">
                    {request.client?.[0] || "C"}
                  </div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {request.client} &bull; created this task
                  </p>
                </div>

                {/* Download Dropdown */}
                {request.metadata?.mediaType === "video" && (
                  <div className="relative">
                    <button 
                      onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
                      className="h-9 px-4 rounded-xl bg-white border border-slate-200 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-50 transition-all"
                    >
                      Download comments
                      <ChevronDown className={cn("h-3 w-3 transition-transform", isExportDropdownOpen && "rotate-180")} />
                    </button>
                    
                    {isExportDropdownOpen && (
                      <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-[110] animate-in fade-in slide-in-from-top-2 duration-200">
                        <ExportOption label="Markdown (.md)" onClick={() => { onExport(request.galleryId, 'markdown', request.id); setIsExportDropdownOpen(false); }} />
                        <ExportOption label="CSV (.csv)" onClick={() => { onExport(request.galleryId, 'csv', request.id); setIsExportDropdownOpen(false); }} />
                        <ExportOption label="JSON (.json)" onClick={() => { onExport(request.galleryId, 'json', request.id); setIsExportDropdownOpen(false); }} />
                        <div className="h-px bg-slate-50 my-1" />
                        <ExportOption label="FCPXML (Final Cut)" onClick={() => { onExport(request.galleryId, 'fcpxml', request.id); setIsExportDropdownOpen(false); }} />
                        <ExportOption label="Resolve EDL" onClick={() => { onExport(request.galleryId, 'resolve', request.id); setIsExportDropdownOpen(false); }} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className={cn(
                "text-sm text-slate-600 leading-relaxed italic",
                request.metadata?.videoComments && "space-y-2 not-italic font-medium"
              )}>
                {request.metadata?.videoComments ? (
                  <ul className="space-y-2">
                    {request.metadata.videoComments.map((c: any, i: number) => (
                      <li key={i} className="flex gap-3">
                        <span className="text-primary font-black font-mono shrink-0">
                          [{Math.floor(c.timestamp / 60)}:{(c.timestamp % 60).toString().padStart(2, '0')}]
                        </span>
                        <span>{c.note}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  `"${request.note}"`
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="p-10 border-t border-slate-50 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <StatusBadge status={request.status} />
            <a 
              href={request.fileUrl} 
              download 
              target="_blank" 
              rel="noopener noreferrer"
              className="h-14 px-8 rounded-2xl bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-all shadow-sm flex items-center gap-2"
            >
              <Download className="h-5 w-5" />
              Download Assets
            </a>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => onStatusUpdate(request.id, 'IN_PROGRESS')}
              className="h-14 px-8 rounded-2xl bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-all shadow-sm"
            >
              Set In Progress
            </button>
            <button 
              onClick={() => onStatusUpdate(request.id, 'COMPLETED')}
              className="h-14 px-10 rounded-2xl bg-slate-900 text-white font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 flex items-center gap-3"
            >
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              Mark Completed
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: any = {
    'NEW': 'bg-blue-50 text-blue-600 border-blue-100',
    'IN_PROGRESS': 'bg-amber-50 text-amber-600 border-amber-100',
    'COMPLETED': 'bg-emerald-50 text-emerald-600 border-emerald-100',
  };

  const icons: any = {
    'NEW': <Clock className="h-2.5 w-2.5" />,
    'IN_PROGRESS': <Clock className="h-2.5 w-2.5" />,
    'COMPLETED': <CheckCircle2 className="h-2.5 w-2.5" />,
  };

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold border uppercase tracking-wider",
      styles[status]
    )}>
      {icons[status]}
      {status.replace('_', ' ')}
    </span>
  );
}

function ExportOption({ label, onClick }: { label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="w-full px-4 py-2 text-left text-[10px] font-bold text-slate-600 hover:bg-slate-50 hover:text-primary transition-all uppercase tracking-widest"
    >
      {label}
    </button>
  );
}

