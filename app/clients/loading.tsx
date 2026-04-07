export default function ClientsLoading() {
  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* 헤더 스켈레톤 */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-40 bg-[#ebebeb] rounded-lg animate-pulse" />
          <div className="h-4 w-56 bg-[#ebebeb] rounded-lg animate-pulse" />
        </div>
        <div className="flex items-center gap-4">
          <div className="h-7 w-20 bg-[#ebebeb] rounded-lg animate-pulse" />
          <div className="h-7 w-20 bg-[#ebebeb] rounded-lg animate-pulse" />
          <div className="h-7 w-20 bg-[#ebebeb] rounded-lg animate-pulse" />
        </div>
      </div>

      {/* 카드 그리드 스켈레톤 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-white rounded-card shadow-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="h-5 w-28 bg-[#ebebeb] rounded-lg animate-pulse" />
              <div className="h-5 w-12 bg-[#ebebeb] rounded-badge animate-pulse" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-full bg-[#ebebeb] rounded-lg animate-pulse" />
              <div className="h-4 w-3/4 bg-[#ebebeb] rounded-lg animate-pulse" />
            </div>
            <div className="flex items-center justify-between pt-1">
              <div className="h-3 w-20 bg-[#ebebeb] rounded-lg animate-pulse" />
              <div className="h-3 w-16 bg-[#ebebeb] rounded-lg animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
