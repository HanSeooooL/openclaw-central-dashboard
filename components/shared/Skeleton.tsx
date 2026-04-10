export function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <div className={`bg-surface animate-pulse rounded ${className}`} />
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-white shadow-card rounded-card p-5 space-y-3">
      <SkeletonLine className="h-3 w-20" />
      <SkeletonLine className="h-7 w-28" />
      <SkeletonLine className="h-3 w-16" />
    </div>
  );
}

export function SkeletonChart({ height = "h-[200px]" }: { height?: string }) {
  return (
    <div className={`bg-white shadow-card rounded-card p-5`}>
      <SkeletonLine className="h-3 w-24 mb-4" />
      <div className={`bg-surface animate-pulse rounded ${height}`} />
    </div>
  );
}
