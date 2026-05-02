import { useId } from "react";

export const BRAND_NAME = "商图 AI 助手";
export const BRAND_TAGLINE = "电商图像智能助手";

export function BrandMark({ className = "" }: { className?: string }) {
  const idPrefix = useId().replace(/:/gu, "");
  const bagGradientId = `${idPrefix}-brand-bag`;
  const cardGradientId = `${idPrefix}-brand-card`;

  return (
    <span className={`brand-mark ${className}`} aria-hidden="true">
      <svg viewBox="0 0 48 48" focusable="false">
        <defs>
          <linearGradient id={bagGradientId} x1="9" x2="39" y1="8" y2="42" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#0f766e" />
            <stop offset="0.54" stopColor="#2563eb" />
            <stop offset="1" stopColor="#7c3aed" />
          </linearGradient>
          <linearGradient id={cardGradientId} x1="13" x2="35" y1="17" y2="33" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.96" />
            <stop offset="1" stopColor="#dbeafe" stopOpacity="0.88" />
          </linearGradient>
        </defs>
        <rect width="48" height="48" rx="12" fill={`url(#${bagGradientId})`} />
        <path d="M16 20.5h16l-1.25 16H17.25L16 20.5Z" fill="#f8fafc" fillOpacity="0.95" />
        <path d="M18.5 20.5c.45-4.45 2.48-7 5.5-7s5.05 2.55 5.5 7" fill="none" stroke="#f8fafc" strokeLinecap="round" strokeWidth="2.5" />
        <rect x="13.5" y="22" width="21" height="14" rx="4" fill={`url(#${cardGradientId})`} opacity="0.94" />
        <path d="m17 32 4-4.35 3.25 3.2 2.5-2.35L32 33" fill="none" stroke="#0f766e" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
        <circle cx="29.5" cy="25.8" r="1.8" fill="#f97316" />
        <path d="M35.5 11.2v5.1M32.95 13.75h5.1M38.4 18.8v3.4M36.7 20.5h3.4" stroke="#fef3c7" strokeLinecap="round" strokeWidth="2" />
      </svg>
    </span>
  );
}

export function BrandName() {
  return (
    <p className="brand-name" title={BRAND_NAME}>
      <span className="brand-name__commerce">商图</span>
      <span className="brand-name__ai">AI</span>
      <span className="brand-name__assistant">助手</span>
    </p>
  );
}
