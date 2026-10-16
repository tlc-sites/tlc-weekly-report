"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-lg border border-border px-3 py-1 text-xs">
      인쇄
    </button>
  );
}
