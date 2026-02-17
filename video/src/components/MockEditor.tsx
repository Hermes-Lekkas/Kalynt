import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

interface CodeLine {
  lineNum: number;
  indent: number;
  tokens: { text: string; color: string }[];
}

interface MockEditorProps {
  lines: CodeLine[];
  fileName?: string;
  typingStartFrame?: number;
  typingSpeed?: number;
  highlightLine?: number;
  showCursor?: boolean;
}

const COLORS = {
  bg: "#0a0a0a",
  gutter: "#171717",
  gutterText: "#525252",
  lineHighlight: "rgba(59, 130, 246, 0.06)",
  cursor: "#3b82f6",
  tabBg: "#000000",
  tabActive: "#0a0a0a",
  tabBorder: "#3b82f6",
  tabText: "#a3a3a3",
  tabTextActive: "#ffffff",
};

export const MockEditor: React.FC<MockEditorProps> = ({
  lines,
  fileName = "index.ts",
  typingStartFrame = 0,
  typingSpeed = 2,
  highlightLine,
  showCursor = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const totalChars = lines.reduce(
    (sum, line) =>
      sum + line.tokens.reduce((s, t) => s + t.text.length, 0) + line.indent * 2,
    0
  );

  const typedChars = Math.floor(
    Math.max(0, (frame - typingStartFrame) * typingSpeed)
  );

  let charCount = 0;

  return (
    <div
      style={{
        backgroundColor: COLORS.bg,
        borderRadius: 12,
        overflow: "hidden",
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
        fontSize: 15,
        lineHeight: 1.7,
        border: "1px solid #262626",
        flex: 1,
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          backgroundColor: COLORS.tabBg,
          borderBottom: "1px solid #262626",
          height: 36,
          alignItems: "flex-end",
        }}
      >
        <div
          style={{
            padding: "6px 16px",
            backgroundColor: COLORS.tabActive,
            color: COLORS.tabTextActive,
            fontSize: 13,
            borderTop: `2px solid ${COLORS.tabBorder}`,
            borderRight: "1px solid #262626",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span style={{ color: "#3b82f6" }}>TS</span>
          {fileName}
        </div>
        <div
          style={{
            padding: "6px 16px",
            color: COLORS.tabText,
            fontSize: 13,
          }}
        >
          utils.ts
        </div>
      </div>

      {/* Code area */}
      <div style={{ padding: "8px 0" }}>
        {lines.map((line, i) => {
          const lineChars =
            line.indent * 2 +
            line.tokens.reduce((s, t) => s + t.text.length, 0);
          const lineStart = charCount;
          charCount += lineChars;

          const isHighlighted = highlightLine === line.lineNum;
          const lineVisible = typedChars > lineStart;

          if (!lineVisible) return null;

          const lineTyped = Math.min(typedChars - lineStart, lineChars);

          let rendered = 0;
          const indentStr = "  ".repeat(line.indent);
          const indentVisible = Math.min(lineTyped, line.indent * 2);

          rendered += line.indent * 2;

          return (
            <div
              key={i}
              style={{
                display: "flex",
                backgroundColor: isHighlighted
                  ? COLORS.lineHighlight
                  : "transparent",
                minHeight: 26,
              }}
            >
              {/* Gutter */}
              <div
                style={{
                  width: 52,
                  textAlign: "right",
                  paddingRight: 16,
                  color: isHighlighted ? "#3b82f6" : COLORS.gutterText,
                  userSelect: "none",
                  flexShrink: 0,
                }}
              >
                {line.lineNum}
              </div>
              {/* Code */}
              <div style={{ display: "flex", flexWrap: "nowrap" }}>
                <span style={{ color: "#525252" }}>
                  {indentStr.slice(0, indentVisible)}
                </span>
                {line.tokens.map((token, j) => {
                  const tokenStart = rendered;
                  rendered += token.text.length;
                  const tokenTyped = Math.min(
                    Math.max(0, lineTyped - tokenStart),
                    token.text.length
                  );
                  if (tokenTyped === 0) return null;
                  return (
                    <span key={j} style={{ color: token.color }}>
                      {token.text.slice(0, tokenTyped)}
                    </span>
                  );
                })}
                {/* Cursor */}
                {showCursor &&
                  lineTyped < lineChars &&
                  lineTyped > 0 &&
                  frame % 30 < 20 && (
                    <span
                      style={{
                        display: "inline-block",
                        width: 2,
                        height: 18,
                        backgroundColor: COLORS.cursor,
                        marginLeft: 1,
                        verticalAlign: "middle",
                      }}
                    />
                  )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
