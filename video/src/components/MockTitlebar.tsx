import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

interface MockTitlebarProps {
  delay?: number;
  activeTab?: string;
  peerCount?: number;
}

export const MockTitlebar: React.FC<MockTitlebarProps> = ({
  delay = 0,
  activeTab = "Editor",
  peerCount = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeIn = spring({
    frame: frame - delay,
    fps,
    config: { damping: 20, stiffness: 100, mass: 0.4 },
  });

  const opacity = interpolate(fadeIn, [0, 1], [0, 1]);

  const tabs = ["Editor", "Tasks", "History", "Files"];

  return (
    <div
      style={{
        height: 36,
        backgroundColor: "rgba(10,10,10,0.85)",
        backdropFilter: "blur(32px)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        gap: 12,
        opacity,
        flexShrink: 0,
      }}
    >
      {/* Branding */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginRight: 8,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#ffffff",
            fontFamily: "'Inter', system-ui, sans-serif",
            letterSpacing: "0.02em",
          }}
        >
          Kalynt
        </span>
        <span
          style={{
            fontSize: 10,
            padding: "2px 6px",
            borderRadius: 4,
            backgroundColor: "rgba(59,130,246,0.2)",
            color: "#60a5fa",
            fontWeight: 600,
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          v1.0
        </span>
        <span
          style={{
            fontSize: 9,
            padding: "2px 5px",
            borderRadius: 3,
            backgroundColor: "rgba(59,130,246,0.15)",
            color: "#93c5fd",
            fontWeight: 500,
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          BETA
        </span>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginLeft: 8 }}>
        {tabs.map((tab) => (
          <div
            key={tab}
            style={{
              padding: "4px 12px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: tab === activeTab ? 500 : 400,
              color: tab === activeTab ? "#ffffff" : "#737373",
              backgroundColor:
                tab === activeTab ? "rgba(255,255,255,0.1)" : "transparent",
              fontFamily: "'Inter', system-ui, sans-serif",
            }}
          >
            {tab}
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* Status indicators */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {peerCount > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              color: "#22c55e",
              fontFamily: "'Inter', system-ui, sans-serif",
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                backgroundColor: "#22c55e",
                boxShadow: "0 0 6px #22c55e80",
              }}
            />
            {peerCount} peers
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            color: "#3b82f6",
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          AI: Local
        </div>
      </div>

      {/* Window controls */}
      <div style={{ display: "flex", gap: 8, marginLeft: 16 }}>
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            backgroundColor: "#ef4444",
          }}
        />
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            backgroundColor: "#eab308",
          }}
        />
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            backgroundColor: "#22c55e",
          }}
        />
      </div>
    </div>
  );
};
