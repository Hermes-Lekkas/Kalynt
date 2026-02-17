import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  delay: number;
}

interface MockAgentPanelProps {
  messages: ChatMessage[];
  delay?: number;
  width?: number;
}

export const MockAgentPanel: React.FC<MockAgentPanelProps> = ({
  messages,
  delay = 0,
  width = 380,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slideIn = spring({
    frame: frame - delay,
    fps,
    config: { damping: 18, stiffness: 80, mass: 0.6 },
  });

  const translateX = interpolate(slideIn, [0, 1], [380, 0]);
  const opacity = interpolate(slideIn, [0, 1], [0, 1]);

  return (
    <div
      style={{
        width,
        backgroundColor: "#050505",
        borderLeft: "1px solid rgba(255,255,255,0.05)",
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
          padding: "12px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: "#3b82f6",
            boxShadow: "0 0 8px rgba(59,130,246,0.5)",
          }}
        />
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#ffffff",
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          AIME Agent
        </span>
        <div style={{ flex: 1 }} />
        <span
          style={{
            fontSize: 10,
            padding: "2px 8px",
            borderRadius: 9999,
            backgroundColor: "rgba(34,197,94,0.15)",
            color: "#22c55e",
            fontFamily: "'Inter', system-ui, sans-serif",
            fontWeight: 500,
          }}
        >
          Active
        </span>
      </div>

      {/* Encryption badge */}
      <div
        style={{
          padding: "6px 16px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 10,
          color: "#525252",
          fontFamily: "'Inter', system-ui, sans-serif",
          borderBottom: "1px solid rgba(255,255,255,0.03)",
        }}
      >
        <span>&#x1F512;</span> End-to-end encrypted
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          padding: "12px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          overflow: "hidden",
        }}
      >
        {messages.map((msg, i) => {
          const msgProgress = spring({
            frame: frame - delay - msg.delay,
            fps,
            config: { damping: 18, stiffness: 100, mass: 0.4 },
          });

          const msgOpacity = interpolate(msgProgress, [0, 1], [0, 1]);
          const msgTranslateY = interpolate(msgProgress, [0, 1], [20, 0]);

          const isUser = msg.role === "user";
          const isSystem = msg.role === "system";

          return (
            <div
              key={i}
              style={{
                opacity: msgOpacity,
                transform: `translateY(${msgTranslateY}px)`,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                alignItems: isUser ? "flex-end" : "flex-start",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: "#525252",
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontWeight: 500,
                }}
              >
                {isUser ? "You" : isSystem ? "System" : "AIME"}
              </span>
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  backgroundColor: isUser
                    ? "rgba(59,130,246,0.15)"
                    : isSystem
                    ? "rgba(234,179,8,0.1)"
                    : "rgba(255,255,255,0.05)",
                  border: `1px solid ${
                    isUser
                      ? "rgba(59,130,246,0.2)"
                      : isSystem
                      ? "rgba(234,179,8,0.15)"
                      : "rgba(255,255,255,0.08)"
                  }`,
                  maxWidth: "95%",
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  color: isSystem ? "#eab308" : "#d4d4d4",
                  fontFamily: "'Inter', system-ui, sans-serif",
                }}
              >
                {msg.content}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {frame - delay > 0 && (
          <div
            style={{
              display: "flex",
              gap: 4,
              padding: "8px 12px",
              opacity: Math.sin(frame * 0.1) * 0.3 + 0.5,
            }}
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: "#3b82f6",
                  opacity: Math.sin((frame + i * 8) * 0.15) * 0.5 + 0.5,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Input bar */}
      <div
        style={{
          padding: "10px 12px",
          borderTop: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            backgroundColor: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            fontSize: 12,
            color: "#525252",
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          Ask AIME anything...
        </div>
      </div>
    </div>
  );
};
