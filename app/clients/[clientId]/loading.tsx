export default function ClientPageLoading() {
  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto animate-pulse">
      {/* 헤더 */}
      <div className="space-y-2">
        <div className="h-7 w-48 bg-[#ebebeb] rounded-lg" />
        <div className="h-4 w-32 bg-[#ebebeb] rounded-lg" />
      </div>

      {/* 상태 카드 4개 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-card shadow-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#ebebeb] rounded-badge" />
              <div className="h-4 w-16 bg-[#ebebeb] rounded-lg" />
            </div>
            <div className="h-7 w-20 bg-[#ebebeb] rounded-lg" />
            <div className="h-3 w-24 bg-[#ebebeb] rounded-lg" />
          </div>
        ))}
      </div>

      {/* 차트 영역 */}
      <div className="bg-white rounded-card shadow-card p-6 space-y-4">
        <div className="h-5 w-32 bg-[#ebebeb] rounded-lg" />
        <div className="h-48 w-full bg-[#ebebeb] rounded-xl" />
      </div>

      {/* 하단 카드 2개 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-white rounded-card shadow-card p-6 space-y-3">
            <div className="h-5 w-28 bg-[#ebebeb] rounded-lg" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="h-4 w-full bg-[#ebebeb] rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
