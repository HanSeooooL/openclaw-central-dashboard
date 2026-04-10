interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
}

export function EmptyState({ icon = "📭", title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <span className="text-3xl mb-3">{icon}</span>
      <p className="text-sm font-medium text-nearblack">{title}</p>
      {description && (
        <p className="text-xs text-secondary mt-1 max-w-xs">{description}</p>
      )}
    </div>
  );
}

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  message = "데이터를 불러올 수 없습니다",
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <span className="text-3xl mb-3">⚠️</span>
      <p className="text-sm font-medium text-nearblack">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 bg-nearblack text-white rounded-lg px-4 py-2 text-xs font-medium hover:opacity-90 transition-opacity"
        >
          다시 시도
        </button>
      )}
    </div>
  );
}
