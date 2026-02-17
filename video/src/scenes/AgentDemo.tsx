import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { MockTitlebar } from "../components/MockTitlebar";
import { MockEditor } from "../components/MockEditor";
import { MockAgentPanel } from "../components/MockAgentPanel";
import { GlowOrb } from "../components/GlowOrb";
import { AnimatedText } from "../components/AnimatedText";

interface AgentDemoProps {
  backgroundColor: string;
  primaryColor: string;
  textColor: string;
}

const agentMessages = [
  {
    role: "user" as const,
    content: "Add input validation to the login form",
    delay: 10,
  },
  {
    role: "assistant" as const,
    content: "I'll add Zod validation with email format checking and password strength rules. Let me edit LoginForm.tsx...",
    delay: 30,
  },
  {
    role: "system" as const,
    content: "Shadow workspace created. Validating changes...",
    delay: 55,
  },
  {
    role: "assistant" as const,
    content: "Done! Added email regex + password min 8 chars with special char requirement. All tests pass in shadow workspace.",
    delay: 75,
  },
];

const editorLines = [
  {
    lineNum: 1,
    indent: 0,
    tokens: [
      { text: "import ", color: "#c586c0" },
      { text: "{ z } ", color: "#d4d4d4" },
      { text: "from ", color: "#c586c0" },
      { text: "'zod'", color: "#ce9178" },
    ],
  },
  { lineNum: 2, indent: 0, tokens: [] },
  {
    lineNum: 3,
    indent: 0,
    tokens: [
      { text: "const ", color: "#569cd6" },
      { text: "loginSchema ", color: "#4fc1ff" },
      { text: "= ", color: "#d4d4d4" },
      { text: "z", color: "#4ec9b0" },
      { text: ".", color: "#d4d4d4" },
      { text: "object", color: "#dcdcaa" },
      { text: "({", color: "#d4d4d4" },
    ],
  },
  {
    lineNum: 4,
    indent: 1,
    tokens: [
      { text: "email", color: "#9cdcfe" },
      { text: ": ", color: "#d4d4d4" },
      { text: "z", color: "#4ec9b0" },
      { text: ".", color: "#d4d4d4" },
      { text: "string", color: "#dcdcaa" },
      { text: "().", color: "#d4d4d4" },
      { text: "email", color: "#dcdcaa" },
      { text: "(),", color: "#d4d4d4" },
    ],
  },
  {
    lineNum: 5,
    indent: 1,
    tokens: [
      { text: "password", color: "#9cdcfe" },
      { text: ": ", color: "#d4d4d4" },
      { text: "z", color: "#4ec9b0" },
      { text: ".", color: "#d4d4d4" },
      { text: "string", color: "#dcdcaa" },
      { text: "().", color: "#d4d4d4" },
      { text: "min", color: "#dcdcaa" },
      { text: "(", color: "#d4d4d4" },
      { text: "8", color: "#b5cea8" },
      { text: ")", color: "#d4d4d4" },
    ],
  },
  {
    lineNum: 6,
    indent: 2,
    tokens: [
      { text: ".", color: "#d4d4d4" },
      { text: "regex", color: "#dcdcaa" },
      { text: "(", color: "#d4d4d4" },
      { text: "/[!@#$%^&*]/", color: "#d16969" },
      { text: ")", color: "#d4d4d4" },
    ],
  },
  {
    lineNum: 7,
    indent: 0,
    tokens: [{ text: "})", color: "#d4d4d4" }],
  },
  { lineNum: 8, indent: 0, tokens: [] },
  {
    lineNum: 9,
    indent: 0,
    tokens: [
      { text: "export ", color: "#c586c0" },
      { text: "function ", color: "#569cd6" },
      { text: "LoginForm", color: "#dcdcaa" },
      { text: "() {", color: "#d4d4d4" },
    ],
  },
  {
    lineNum: 10,
    indent: 1,
    tokens: [
      { text: "const ", color: "#569cd6" },
      { text: "result ", color: "#9cdcfe" },
      { text: "= ", color: "#d4d4d4" },
      { text: "loginSchema", color: "#4fc1ff" },
      { text: ".", color: "#d4d4d4" },
      { text: "safeParse", color: "#dcdcaa" },
      { text: "(input)", color: "#d4d4d4" },
    ],
  },
];

export const AgentDemo: React.FC<AgentDemoProps> = ({
  backgroundColor,
  primaryColor,
  textColor,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const windowScale = spring({
    frame,
    fps,
    config: { damping: 20, stiffness: 70, mass: 0.6 },
  });
  const scale = interpolate(windowScale, [0, 1], [0.92, 1]);
  const windowOpacity = interpolate(windowScale, [0, 1], [0, 1]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <GlowOrb color={primaryColor} size={700} x={700} y={500} />
      <GlowOrb color="#8b5cf6" size={400} x={1400} y={300} delay={10} />

      {/* Scene label */}
      <div
        style={{
          position: "absolute",
          top: 30,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          zIndex: 10,
        }}
      >
        <AnimatedText
          text="Autonomous AI Agent"
          fontSize={28}
          color="#60a5fa"
          fontWeight={600}
          delay={0}
          style={{ letterSpacing: "0.05em" }}
        />
      </div>

      {/* IDE Window */}
      <div
        style={{
          width: 1680,
          height: 880,
          marginTop: 20,
          borderRadius: 16,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow:
            "0 0 60px rgba(59,130,246,0.3), 0 25px 50px rgba(0,0,0,0.8)",
          display: "flex",
          flexDirection: "column",
          opacity: windowOpacity,
          transform: `scale(${scale})`,
        }}
      >
        <MockTitlebar delay={0} />

        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
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
              fileName="LoginForm.tsx"
              typingStartFrame={25}
              typingSpeed={2.5}
              highlightLine={5}
            />
          </div>

          <MockAgentPanel messages={agentMessages} delay={5} width={400} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
