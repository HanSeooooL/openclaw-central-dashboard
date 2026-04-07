interface StatusCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: string;
  color?: "blue" | "purple" | "green" | "yellow" | "red";
}

const iconBg: Record<string, string> = {
  blue: "bg-[#ff385c]/10",
  purple: "bg-purple-50",
  green: "bg-green-50",
  yellow: "bg-amber-50",
  red: "bg-red-50",
};

const valueColor: Record<string, string> = {
  blue: "text-[#ff385c]",
  purple: "text-purple-600",
  green: "text-green-700",
  yellow: "text-amber-700",
  red: "text-[#ff385c]",
};

export default function StatusCard({ title, value, subtitle, icon, color = "blue" }: StatusCardProps) {
  return (
    <div className="bg-white shadow-card rounded-card p-5 transition-shadow hover:shadow-card-hover">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-secondary font-medium">{title}</p>
          <p className={`text-2xl font-bold mt-1 tracking-tight ${valueColor[color]}`}>{value}</p>
          {subtitle && <p className="text-xs text-secondary mt-1">{subtitle}</p>}
        </div>
        <span className={`text-xl w-10 h-10 rounded-badge flex items-center justify-center flex-shrink-0 ${iconBg[color]}`}>
          {icon}
        </span>
      </div>
    </div>
  );
}
