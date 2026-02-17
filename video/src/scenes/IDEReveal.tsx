import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { MockTitlebar } from "../components/MockTitlebar";
import { MockSidebar } from "../components/MockSidebar";
import { MockEditor } from "../components/MockEditor";
import { MockTerminal } from "../components/MockTerminal";
import { GlowOrb } from "../components/GlowOrb";

interface IDERevealProps {
  backgroundColor: string;
  primaryColor: string;
}

const editorLines = [
  {
    lineNum: 1,
    indent: 0,
    tokens: [
      { text: "import ", color: "#c586c0" },
      { text: "{ ", color: "#d4d4d4" },
      { text: "useEncryption", color: "#9cdcfe" },
      { text: " } ", color: "#d4d4d4" },
      { text: "from ", color: "#c586c0" },
      { text: "'./hooks/useEncryption'", color: "#ce9178" },
    ],
  },
  {
    lineNum: 2,
    indent: 0,
    tokens: [
      { text: "import ", color: "#c586c0" },
      { text: "{ ", color: "#d4d4d4" },
      { text: "P2PService", color: "#4ec9b0" },
      { text: " } ", color: "#d4d4d4" },
      { text: "from ", color: "#c586c0" },
      { text: "'./services/p2pService'", color: "#ce9178" },
    ],
  },
  { lineNum: 3, indent: 0, tokens: [] },
  {
    lineNum: 4,
    indent: 0,
    tokens: [
      { text: "export ", color: "#c586c0" },
      { text: "const ", color: "#569cd6" },
      { text: "CollabSession ", color: "#dcdcaa" },
      { text: "= () ", color: "#d4d4d4" },
      { text: "=> ", color: "#d4d4d4" },
      { text: "{", color: "#d4d4d4" },
    ],
  },
  {
    lineNum: 5,
    indent: 1,
    tokens: [
      { text: "const ", color: "#569cd6" },
      { text: "{ encrypt, decrypt } ", color: "#9cdcfe" },
      { text: "= ", color: "#d4d4d4" },
      { text: "useEncryption", color: "#dcdcaa" },
      { text: "()", color: "#d4d4d4" },
    ],
  },
  {
    lineNum: 6,
    indent: 1,
    tokens: [
      { text: "const ", color: "#569cd6" },
      { text: "peers ", color: "#9cdcfe" },
      { text: "= ", color: "#d4d4d4" },
      { text: "P2PService", color: "#4ec9b0" },
      { text: ".", color: "#d4d4d4" },
      { text: "getConnectedPeers", color: "#dcdcaa" },
      { text: "()", color: "#d4d4d4" },
    ],
  },
  { lineNum: 7, indent: 0, tokens: [] },
  {
    lineNum: 8,
    indent: 1,
    tokens: [
      { text: "// AES-256-GCM encrypted sync", color: "#6a9955" },
    ],
  },
  {
    lineNum: 9,
    indent: 1,
    tokens: [
      { text: "const ", color: "#569cd6" },
      { text: "syncDoc ", color: "#9cdcfe" },
      { text: "= ", color: "#d4d4d4" },
      { text: "await ", color: "#c586c0" },
      { text: "encrypt", color: "#dcdcaa" },
      { text: "(", color: "#d4d4d4" },
      { text: "document", color: "#9cdcfe" },
      { text: ".", color: "#d4d4d4" },
      { text: "content", color: "#9cdcfe" },
      { text: ")", color: "#d4d4d4" },
    ],
  },
  {
    lineNum: 10,
    indent: 1,
    tokens: [
      { text: "peers", color: "#9cdcfe" },
      { text: ".", color: "#d4d4d4" },
      { text: "broadcast", color: "#dcdcaa" },
      { text: "(", color: "#d4d4d4" },
      { text: "syncDoc", color: "#9cdcfe" },
      { text: ")", color: "#d4d4d4" },
    ],
  },
  {
    lineNum: 11,
    indent: 0,
    tokens: [{ text: "}", color: "#d4d4d4" }],
  },
];

const terminalLines = [
  { prefix: "$", text: " npm run dev", color: "#d4d4d4" },
  { text: "Vite v7.3.1 ready in 420ms", color: "#22c55e" },
  { text: "Local:   http://localhost:5173", color: "#3b82f6" },
  { text: "AIME Agent initialized (CodeQwen-7B)", color: "#eab308" },
  { text: "P2P: Connected to 3 peers", color: "#22c55e" },
];

export const IDEReveal: React.FC<IDERevealProps> = ({
  backgroundColor,
  primaryColor,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // IDE window scale animation
  const windowScale = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 60, mass: 0.8 },
  });

  const scale = interpolate(windowScale, [0, 1], [0.85, 1]);
  const windowOpacity = interpolate(windowScale, [0, 1], [0, 1]);

  // Glow behind the IDE window
  const glowPulse = interpolate(
    Math.sin(frame * 0.04),
    [-1, 1],
    [0.3, 0.6]
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <GlowOrb color={primaryColor} size={900} x={960} y={540} />

      {/* IDE Window */}
      <div
        style={{
          width: 1680,
          height: 920,
          borderRadius: 16,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: `0 0 80px rgba(59,130,246,${glowPulse}), 0 25px 50px rgba(0,0,0,0.8)`,
          display: "flex",
          flexDirection: "column",
          opacity: windowOpacity,
          transform: `scale(${scale})`,
        }}
      >
        <MockTitlebar delay={5} peerCount={3} />

        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <MockSidebar delay={10} />

          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <MockEditor
              lines={editorLines}
              fileName="CollabSession.tsx"
              typingStartFrame={15}
              typingSpeed={4}
              highlightLine={9}
            />
            <MockTerminal
              lines={terminalLines}
              typingStartFrame={50}
              typingSpeed={4}
              height={160}
            />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
