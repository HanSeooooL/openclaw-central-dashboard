interface ResourceBarProps {
  label: string;
  value: number;
  icon: string;
}

export default function ResourceBar({ label, value, icon }: ResourceBarProps) {
  const getColor = (v: number) => {
    if (v < 50) return "bg-green-500";
    if (v < 80) return "bg-amber-500";
    return "bg-[#ff385c]";
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-secondary flex items-center gap-2 font-medium">
          <span>{icon}</span>
          {label}
        </span>
        <span className="text-nearblack font-semibold">{Math.round(value)}%</span>
      </div>
      <div className="h-2 bg-surface rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${getColor(value)}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}
