import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

interface TerminalLine {
  text: string;
  color?: string;
  prefix?: string;
}

interface MockTerminalProps {
  lines: TerminalLine[];
  typingStartFrame?: number;
  typingSpeed?: number;
  height?: number;
}

export const MockTerminal: React.FC<MockTerminalProps> = ({
  lines,
  typingStartFrame = 0,
  typingSpeed = 3,
  height = 180,
}) => {
  const frame = useCurrentFrame();

  const totalChars = lines.reduce(
    (sum, l) => sum + (l.prefix?.length ?? 0) + l.text.length,
    0
  );
  const typedChars = Math.floor(
    Math.max(0, (frame - typingStartFrame) * typingSpeed)
  );

  let charCount = 0;

  return (
    <div
      style={{
        height,
        backgroundColor: "#0a0a0a",
        borderTop: "1px solid #262626",
        fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
        fontSize: 13,
        lineHeight: 1.6,
        padding: "8px 0",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {/* Terminal tab */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0 12px 6px",
          borderBottom: "1px solid #262626",
          marginBottom: 6,
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: "#ffffff",
            fontFamily: "'Inter', system-ui, sans-serif",
            fontWeight: 500,
            borderBottom: "2px solid #3b82f6",
            paddingBottom: 4,
          }}
        >
          Terminal
        </span>
        <span
          style={{
            fontSize: 11,
            color: "#525252",
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          Output
        </span>
      </div>

      <div style={{ padding: "4px 16px" }}>
        {lines.map((line, i) => {
          const lineLen = (line.prefix?.length ?? 0) + line.text.length;
          const lineStart = charCount;
          charCount += lineLen;

          if (typedChars <= lineStart) return null;

          const lineTyped = Math.min(typedChars - lineStart, lineLen);
          const prefixLen = line.prefix?.length ?? 0;

          return (
            <div key={i} style={{ display: "flex" }}>
              {line.prefix && (
                <span style={{ color: "#3b82f6", marginRight: 8 }}>
                  {line.prefix.slice(0, Math.min(lineTyped, prefixLen))}
                </span>
              )}
              <span style={{ color: line.color ?? "#a3a3a3" }}>
                {line.text.slice(
                  0,
                  Math.max(0, lineTyped - prefixLen)
                )}
              </span>
            </div>
          );
        })}
        {/* Blinking cursor */}
        {typedChars < totalChars && frame % 30 < 20 && (
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 16,
              backgroundColor: "#3b82f6",
              opacity: 0.8,
            }}
          />
        )}
      </div>
    </div>
  );
};
