export default function Loading() {
  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-500">
      <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-4 flex-1 max-w-md">
            <div className="h-4 w-32 bg-slate-50 rounded-full animate-pulse" />
            <div className="h-14 w-full bg-slate-50 rounded-2xl animate-pulse" />
          </div>
          <div className="h-14 w-40 bg-slate-50 rounded-full animate-pulse" />
        </div>
      </div>

      <div className="grid grid-cols-[1fr_320px] gap-8">
        <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden h-[600px] animate-pulse" />
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm h-64 animate-pulse" />
          <div className="h-16 w-full bg-slate-50 rounded-[24px] animate-pulse" />
        </div>
      </div>
    </div>
  );
}

