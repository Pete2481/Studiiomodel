export default function Loading() {
  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-500">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-4 w-32 bg-slate-100 rounded-full animate-pulse" />
          <div className="h-8 w-64 bg-slate-100 rounded-lg animate-pulse" />
        </div>
        <div className="flex gap-4">
          <div className="h-10 w-32 bg-slate-100 rounded-full animate-pulse" />
          <div className="h-10 w-32 bg-slate-100 rounded-full animate-pulse" />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-[1fr_300px] gap-8">
        {/* Calendar Skeleton */}
        <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden p-8 space-y-6">
          <div className="flex items-center justify-between pb-6 border-b border-slate-50">
            <div className="h-10 w-48 bg-slate-50 rounded-xl animate-pulse" />
            <div className="flex gap-2">
              <div className="h-10 w-10 bg-slate-50 rounded-full animate-pulse" />
              <div className="h-10 w-10 bg-slate-50 rounded-full animate-pulse" />
            </div>
          </div>
          <div className="space-y-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex gap-4">
                <div className="h-12 w-20 bg-slate-50 rounded-xl animate-pulse" />
                <div className="h-12 flex-1 bg-slate-50 rounded-xl animate-pulse" />
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar Skeleton */}
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
            <div className="h-4 w-32 bg-slate-50 rounded-full animate-pulse" />
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 w-full bg-slate-50 rounded-2xl animate-pulse" />
              ))}
            </div>
          </div>
          <div className="h-40 w-full bg-slate-50 rounded-[32px] animate-pulse" />
        </div>
      </div>
    </div>
  );
}

