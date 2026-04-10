"use client";

import { useToastStore } from "@/stores/toastStore";

const typeStyles = {
  success: "bg-green-50 border-green-200 text-green-800",
  error: "bg-[#ff385c]/8 border-[#ff385c]/20 text-rausch",
  info: "bg-surface border-border-light text-nearblack",
};

const typeIcons = {
  success: "✅",
  error: "⚠️",
  info: "ℹ️",
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2 max-sm:bottom-20 max-sm:left-4 max-sm:right-4">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`border rounded-card shadow-card px-4 py-3 flex items-center gap-2.5 text-sm font-medium animate-in slide-in-from-bottom-2 ${typeStyles[toast.type]}`}
        >
          <span className="text-base">{typeIcons[toast.type]}</span>
          <span className="flex-1">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-secondary hover:text-nearblack text-xs ml-2"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
