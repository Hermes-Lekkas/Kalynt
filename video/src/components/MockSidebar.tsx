import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

interface WorkspaceItem {
  name: string;
  color: string;
  active?: boolean;
}

interface MockSidebarProps {
  workspaces?: WorkspaceItem[];
  delay?: number;
}

const defaultWorkspaces: WorkspaceItem[] = [
  { name: "kalynt-core", color: "#3b82f6", active: true },
  { name: "my-saas-app", color: "#22c55e" },
  { name: "portfolio-v3", color: "#eab308" },
];

export const MockSidebar: React.FC<MockSidebarProps> = ({
  workspaces = defaultWorkspaces,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slideIn = spring({
    frame: frame - delay,
    fps,
    config: { damping: 20, stiffness: 80, mass: 0.6 },
  });

  const translateX = interpolate(slideIn, [0, 1], [-240, 0]);
  const opacity = interpolate(slideIn, [0, 1], [0, 1]);

  return (
    <div
      style={{
        width: 220,
        backgroundColor: "#050505",
        borderRight: "1px solid rgba(255,255,255,0.05)",
        display: "flex",
        flexDirection: "column",
        opacity,
        transform: `translateX(${translateX}px)`,
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 16px 10px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.08em",
          color: "#525252",
          fontFamily: "'Inter', system-ui, sans-serif",
          textTransform: "uppercase",
        }}
      >
        <span style={{ color: "#3b82f6", fontSize: 14 }}>&#x1F4C1;</span>
        WORKSPACES
      </div>

      {/* Workspace list */}
      <div style={{ padding: "4px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
        {workspaces.map((ws, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              borderRadius: 8,
              backgroundColor: ws.active ? "rgba(59,130,246,0.08)" : "transparent",
              borderLeft: ws.active ? "2px solid #3b82f6" : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: ws.color,
                boxShadow: ws.active ? `0 0 8px ${ws.color}60` : "none",
              }}
            />
            <span
              style={{
                fontSize: 13,
                color: ws.active ? "#ffffff" : "#a3a3a3",
                fontFamily: "'Inter', system-ui, sans-serif",
                fontWeight: ws.active ? 500 : 400,
              }}
            >
              {ws.name}
            </span>
          </div>
        ))}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Footer - AI status */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid rgba(255,255,255,0.05)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 11,
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          <span style={{ color: "#525252" }}>AI Sync</span>
          <span style={{ color: "#22c55e" }}>Local</span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 11,
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          <span style={{ color: "#525252" }}>Nodes</span>
          <span style={{ color: "#3b82f6" }}>3 peers</span>
        </div>

        {/* User avatar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 8,
            padding: "8px 0",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
              boxShadow: "0 0 12px rgba(59,130,246,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              color: "#fff",
              fontWeight: 700,
            }}
          >
            H
          </div>
          <div style={{ fontSize: 12, color: "#a3a3a3", fontFamily: "'Inter', system-ui, sans-serif" }}>
            Hermes
          </div>
        </div>
      </div>
    </div>
  );
};
