"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export default function NavigationProgress() {
  const pathname = usePathname();
  const prevPathname = useRef(pathname);
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const completeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 링크 클릭 시 진행 시작
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href === pathname || href.startsWith("#") || href.startsWith("http")) return;

      if (completeTimer.current) clearTimeout(completeTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);

      setVisible(true);
      setProgress(0);
      requestAnimationFrame(() => setProgress(72));
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [pathname]);

  // pathname 변경 시 완료 처리
  useEffect(() => {
    if (pathname === prevPathname.current) return;
    prevPathname.current = pathname;

    setProgress(100);
    completeTimer.current = setTimeout(() => {
      hideTimer.current = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 150);
    }, 200);

    return () => {
      if (completeTimer.current) clearTimeout(completeTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [pathname]);

  if (!visible) return null;

  return (
    <div
      className="fixed top-0 left-0 z-[9999] h-[2px] bg-rausch pointer-events-none"
      style={{
        width: `${progress}%`,
        transition: progress === 100
          ? "width 0.2s ease, opacity 0.15s ease"
          : "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        opacity: progress === 100 && !visible ? 0 : 1,
      }}
    />
  );
}
