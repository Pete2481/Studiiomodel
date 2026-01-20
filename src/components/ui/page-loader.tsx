import { CameraLoader } from "@/components/ui/camera-loader";

interface PageLoaderProps {
  message?: string;
  className?: string;
}

export function PageLoader({ message = "Loading…", className }: PageLoaderProps) {
  return (
    <div
      className={
        className ??
        "min-h-[60vh] w-full flex flex-col items-center justify-center gap-6 py-16 animate-in fade-in duration-200"
      }
    >
      <CameraLoader size="md" color="var(--primary)" className="text-primary" />
      {message ? (
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 animate-pulse">
          {message}
        </p>
      ) : null}
    </div>
  );
}


