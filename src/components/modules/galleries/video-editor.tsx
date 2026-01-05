"use client";

import React, { useState, useRef, useEffect } from "react";
import { Play, Pause, RotateCcw, X, Check, ArrowRight, Loader2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoEditorProps {
  videoUrl: string;
  videoTitle: string;
  onClose: () => void;
  onSend: (comments: { timestamp: number; note: string }[], tagIds: string[]) => void;
  isSubmitting?: boolean;
  editSuccess?: boolean;
  editTags?: any[];
}

export function VideoEditor({ videoUrl, videoTitle, onClose, onSend, isSubmitting, editSuccess, editTags = [] }: VideoEditorProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<{ timestamp: number; note: string; id: string }[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [isEmbed, setIsEmbed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoUrl.includes("vimeo.com") || videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be")) {
      setIsEmbed(true);
    }
  }, [videoUrl]);

  // Helper to format time MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleTogglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handlePause = () => {
    setIsPlaying(false);
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const addComment = () => {
    if (!comment.trim()) return;
    
    const newComment = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: currentTime,
      note: comment.trim()
    };
    
    setComments(prev => [...prev, newComment].sort((a, b) => a.timestamp - b.timestamp));
    setComment("");
    
    // Auto-play again after adding comment as requested
    if (videoRef.current) {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const removeComment = (id: string) => {
    setComments(prev => prev.filter(c => c.id !== id));
  };

  // Convert Dropbox link to direct content if needed
  const getDirectUrl = (url: string) => {
    if (url.includes("dropbox.com")) {
      return url.replace("www.dropbox.com", "dl.dropboxusercontent.com").replace("dl=0", "raw=1");
    }
    return url;
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-950 flex items-center justify-center p-4 md:p-8 lg:p-12 animate-in fade-in duration-300">
      <div className="w-full max-w-6xl bg-white rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-500">
        
        {/* Header */}
        <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-900 text-white">
          <div className="space-y-1">
            <h3 className="text-xl font-bold tracking-tight">Video edit notes</h3>
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">Frame.io style: pause, comment, timestamps captured</p>
          </div>
          <button 
            onClick={onClose}
            className="h-10 px-4 rounded-full hover:bg-white/10 flex items-center justify-center text-slate-400 transition-colors font-bold text-xs uppercase tracking-widest"
          >
            Close
          </button>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Player Side */}
          <div className="flex-[2] bg-slate-50 p-8 flex flex-col gap-6 overflow-y-auto">
            {isEmbed ? (
              <div className="flex-1 flex flex-col items-center justify-center bg-slate-900 rounded-3xl p-12 text-center space-y-6">
                <div className="h-20 w-20 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
                  <Clock className="h-10 w-10" />
                </div>
                <div className="space-y-2">
                  <h4 className="text-xl font-bold text-white">Manual Timestamping Required</h4>
                  <p className="text-slate-400 max-w-sm mx-auto">
                    YouTube and Vimeo embeds do not support "Frame.io Style" pausing yet. Please manually type the timestamp in your notes.
                  </p>
                </div>
                <a 
                  href={videoUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="px-8 py-3 bg-white rounded-full text-xs font-black uppercase tracking-widest text-slate-900 hover:bg-slate-100 transition-all"
                >
                  Open Video in New Tab
                </a>
              </div>
            ) : (
              <>
                <div className="relative aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl group border border-slate-200">
                  <video 
                    ref={videoRef}
                    src={getDirectUrl(videoUrl)}
                    className="w-full h-full object-contain"
                    onPause={handlePause}
                    onPlay={() => setIsPlaying(true)}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onClick={handleTogglePlay}
                  />
                  
                  {/* Play Overlay */}
                  {!isPlaying && (
                    <div 
                      className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer group-hover:bg-black/40 transition-all"
                      onClick={handleTogglePlay}
                    >
                      <div className="h-20 w-20 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white scale-100 hover:scale-110 transition-all shadow-2xl border border-white/20">
                        <Play className="h-8 w-8 fill-current ml-1" />
                      </div>
                    </div>
                  )}

                  {/* Minimal Controls */}
                  <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
                    <div className="flex items-center gap-4 text-white">
                      <button onClick={handleTogglePlay} className="hover:scale-110 transition-transform">
                        {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
                      </button>
                      <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden relative cursor-pointer" onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const pct = x / rect.width;
                        if (videoRef.current) videoRef.current.currentTime = pct * duration;
                      }}>
                        <div 
                          className="absolute top-0 left-0 h-full bg-primary"
                          style={{ width: `${(currentTime / duration) * 100}%` }}
                        />
                      </div>
                      <p className="text-[10px] font-black tracking-widest uppercase">
                        {formatTime(currentTime)} / {formatTime(duration)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Timestamp Bar */}
                <div className="px-8 py-4 bg-white rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-4">
                    <p className="text-sm font-bold text-slate-900">Current timestamp:</p>
                    <div className="h-10 px-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-sm font-black text-slate-900 font-mono">
                      {formatTime(currentTime)}
                    </div>
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">
                    (press pause, then add comment)
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Sidebar Side */}
          <div className="flex-1 border-l border-slate-50 flex flex-col bg-white">
            <div className="p-8 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Add comment</label>
                <textarea 
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Describe the change..."
                  className="w-full h-32 rounded-2xl border border-slate-200 p-4 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none"
                />
                <button 
                  onClick={addComment}
                  disabled={!comment.trim()}
                  className="w-full h-12 rounded-2xl bg-emerald-500 text-white font-bold text-xs uppercase tracking-widest shadow-lg shadow-emerald-200 hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  Add timestamped comment
                </button>
              </div>

              {/* Tag Selection - Add the ability to BILL the edit */}
              {editTags.length > 0 && (
                <div className="space-y-4 pt-6 border-t border-slate-50">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">BILLING / EDIT TYPES</label>
                    {selectedTagIds.length > 0 && (
                      <span className="text-[10px] font-black text-primary uppercase tracking-widest">
                        Total: ${editTags.filter(t => selectedTagIds.includes(t.id)).reduce((acc, t) => acc + Number(t.cost), 0).toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {editTags.map((tag: any) => {
                      const isSelected = selectedTagIds.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedTagIds(prev => prev.filter(id => id !== tag.id));
                            } else {
                              setSelectedTagIds(prev => [...prev, tag.id]);
                            }
                          }}
                          className={cn(
                            "px-4 py-2 rounded-full text-[11px] font-bold transition-all border",
                            isSelected 
                              ? "bg-primary border-primary text-white shadow-lg shadow-primary/20" 
                              : "bg-white border-slate-200 text-slate-600 hover:border-primary hover:text-primary"
                          )}
                        >
                          {tag.name} (${Number(tag.cost).toFixed(2)})
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">COMMENTS</label>
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{comments.length} Total</span>
                </div>
                
                <div className="space-y-3">
                  {comments.map((c) => (
                    <div 
                      key={c.id} 
                      className="p-4 rounded-2xl bg-slate-50 border border-slate-100 group relative"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-black text-emerald-600 font-mono">{formatTime(c.timestamp)}</span>
                        <button 
                          onClick={() => removeComment(c.id)}
                          className="h-6 w-6 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-300 hover:text-rose-500 transition-all"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed">{c.note}</p>
                    </div>
                  ))}
                  {comments.length === 0 && (
                    <div className="py-12 text-center space-y-2 opacity-40">
                      <Clock className="h-8 w-8 mx-auto text-slate-300" />
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No notes added yet</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-8 border-t border-slate-50 bg-slate-50/50">
              {editSuccess ? (
                <div className="h-14 w-full rounded-2xl bg-emerald-500 text-white flex items-center justify-center gap-2 animate-in zoom-in duration-300">
                  <Check className="h-5 w-5" />
                  <span className="font-bold">Sent to Studio!</span>
                </div>
              ) : (
                <button 
                  onClick={() => onSend(comments, selectedTagIds)}
                  disabled={comments.length === 0 || isSubmitting}
                  className="w-full h-14 rounded-2xl bg-white border-2 border-slate-200 text-slate-900 font-bold hover:bg-slate-50 transition-all shadow-sm flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      Processing...
                    </>
                  ) : (
                    <>
                      Send to Edit Requests
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

