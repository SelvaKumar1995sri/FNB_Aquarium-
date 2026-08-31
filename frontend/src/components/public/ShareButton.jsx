import { useState } from "react";

function ShareIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="18" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="18" cy="19" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <line x1="8.2" y1="10.8" x2="15.8" y2="6.2" stroke="currentColor" strokeWidth="1.8" />
      <line x1="8.2" y1="13.2" x2="15.8" y2="17.8" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export default function ShareButton({ title, url, resetDelayMs = 2000 }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = url ?? (typeof window !== "undefined" ? window.location.href : "");

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url: shareUrl });
      } catch {
        // User dismissed the native share sheet — nothing to do.
      }
      return;
    }

    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), resetDelayMs);
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label="Share this product"
      className="inline-flex items-center gap-1.5 rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
    >
      <ShareIcon className="h-4 w-4" />
      {copied ? "Link copied!" : "Share"}
    </button>
  );
}
