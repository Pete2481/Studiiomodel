"use client";

import { useState, useEffect } from "react";
import { 
  X, 
  Download, 
  Smartphone, 
  Share, 
  PlusSquare,
  ArrowBigDownDash
} from "lucide-react";
import { cn } from "@/lib/utils";

export function AppInstallPrompt() {
  const [isVisible, setIsVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // 1. Check if already installed
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as any).standalone 
      || document.referrer.includes('android-app://');
    
    setIsStandalone(isStandaloneMode);

    // 2. Check platform
    const ua = window.navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua);
    setIsIOS(ios);

    // 3. Handle Android install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Only show if not installed and not seen recently
      const hasDismissed = localStorage.getItem('pwa-dismissed');
      if (!isStandaloneMode && !hasDismissed) {
        setIsVisible(true);
      }
    });

    // 4. For iOS, we have to show it manually
    if (ios && !isStandaloneMode) {
      const hasDismissed = localStorage.getItem('pwa-dismissed');
      if (!hasDismissed) {
        setIsVisible(true);
      }
    }
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('pwa-dismissed', 'true');
  };

  const handleInstallAndroid = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsVisible(false);
    }
    setDeferredPrompt(null);
  };

  if (!isVisible || isStandalone) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-[60] animate-in slide-in-from-bottom-8 duration-500">
      <div className="bg-slate-900 text-white p-6 rounded-[32px] shadow-2xl ring-1 ring-white/10 relative overflow-hidden">
        {/* Abstract Background Decoration */}
        <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-32 h-32 bg-primary/20 blur-3xl rounded-full" />
        
        <button 
          onClick={handleDismiss}
          className="absolute top-4 right-4 h-8 w-8 flex items-center justify-center rounded-full bg-white/10 text-white/60 hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex gap-5">
          <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center shrink-0 shadow-lg shadow-primary/20">
            <Smartphone className="h-7 w-7 text-white" />
          </div>
          
          <div className="space-y-4 flex-1">
            <div className="space-y-1">
              <h3 className="text-lg font-bold">Install Studiio App</h3>
              <p className="text-sm font-medium text-slate-400 leading-snug">
                {isIOS 
                  ? "Save to your home screen for an immersive fullscreen experience."
                  : "Add Studiio to your phone for fast access and native notifications."
                }
              </p>
            </div>

            {isIOS ? (
              <div className="space-y-3 bg-white/5 p-4 rounded-2xl border border-white/5">
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">How to install:</p>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-7 w-7 rounded-lg bg-white/10 flex items-center justify-center text-[11px] font-bold">1</div>
                    <p className="text-xs font-medium">Tap the <Share className="h-3.5 w-3.5 inline mx-1 text-sky-400" /> Share button</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-7 w-7 rounded-lg bg-white/10 flex items-center justify-center text-[11px] font-bold">2</div>
                    <p className="text-xs font-medium">Scroll down and select <PlusSquare className="h-3.5 w-3.5 inline mx-1 text-slate-300" /> 'Add to Home Screen'</p>
                  </div>
                </div>
              </div>
            ) : (
              <button 
                onClick={handleInstallAndroid}
                className="w-full h-14 bg-primary hover:bg-emerald-600 text-white rounded-2xl font-bold shadow-xl shadow-primary/20 flex items-center justify-center gap-3 transition-all active:scale-95"
              >
                <Download className="h-5 w-5" />
                Save to Phone
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

