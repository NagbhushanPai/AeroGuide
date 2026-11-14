import { ImageResponse } from "next/og";

import { siteConfig } from "@/lib/site";

// Shared preview image for links to any page. Colours match the dark (navy) theme tokens.
export const alt = `${siteConfig.name}: ${siteConfig.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const NAVY = "#0f1624";
const NAVY_CARD = "#172033";
const CYAN = "#5cc8e6";
const TEXT = "#f1f4f8";
const MUTED = "#a3adbd";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 80,
        background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_CARD} 100%)`,
        color: TEXT,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        {/* The site mark (components/layout/logo.tsx): a heading needle inside a ring. */}
        <svg width="80" height="80" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="13" fill="none" stroke={CYAN} strokeWidth="2" />
          <path d="M16 6 L20 18 L16 15.5 L12 18 Z" fill={CYAN} />
          <circle cx="16" cy="22.5" r="1.5" fill={CYAN} opacity="0.6" />
        </svg>
        <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: -1 }}>{siteConfig.name}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1, maxWidth: 980 }}>
          {siteConfig.tagline}
        </div>
        <div style={{ fontSize: 30, color: MUTED }}>Open data, sourced and dated.</div>
      </div>
      <div style={{ display: "flex", height: 8, width: 160, borderRadius: 4, background: CYAN }} />
    </div>,
    size,
  );
}
