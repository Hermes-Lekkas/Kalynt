import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { AnimatedText } from "../components/AnimatedText";
import { GlowOrb } from "../components/GlowOrb";

interface ShadowWorkspaceProps {
  backgroundColor: string;
  primaryColor: string;
  textColor: string;
}

const DiffLine: React.FC<{
  type: "add" | "remove" | "context";
  text: string;
  delay: number;
}> = ({ type, text, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 20, stiffness: 120, mass: 0.3 },
  });

  const opacity = interpolate(progress, [0, 1], [0, 1]);

  const colors = {
    add: { bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.3)", text: "#22c55e", prefix: "+" },
    remove: { bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.3)", text: "#ef4444", prefix: "-" },
    context: { bg: "transparent", border: "transparent", text: "#525252", prefix: " " },
  };

  const c = colors[type];

  return (
    <div
      style={{
        opacity,
        padding: "4px 12px",
        backgroundColor: c.bg,
        borderLeft: `3px solid ${c.border}`,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 14,
        lineHeight: 1.6,
        color: c.text,
        display: "flex",
        gap: 12,
      }}
    >
      <span style={{ color: "#525252", width: 12 }}>{c.prefix}</span>
      <span>{text}</span>
    </div>
  );
};

export const ShadowWorkspace: React.FC<ShadowWorkspaceProps> = ({
  backgroundColor,
  primaryColor,
  textColor,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const panelProgress = spring({
    frame: frame - 5,
    fps,
    config: { damping: 18, stiffness: 70, mass: 0.6 },
  });
  const panelOpacity = interpolate(panelProgress, [0, 1], [0, 1]);
  const panelScale = interpolate(panelProgress, [0, 1], [0.9, 1]);

  // Checkmark animation
  const checkDelay = 80;
  const checkProgress = spring({
    frame: frame - checkDelay,
    fps,
    config: { damping: 12, stiffness: 100, mass: 0.5 },
  });
  const checkOpacity = interpolate(checkProgress, [0, 1], [0, 1]);
  const checkScale = interpolate(checkProgress, [0, 1], [0.5, 1]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <GlowOrb color={primaryColor} size={600} x={960} y={540} />
      <GlowOrb color="#22c55e" size={300} x={1500} y={300} delay={10} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 32,
          zIndex: 1,
        }}
      >
        {/* Title */}
        <AnimatedText
          text="Shadow Workspace"
          fontSize={40}
          color="#60a5fa"
          fontWeight={600}
          delay={0}
          style={{ letterSpacing: "0.04em" }}
        />
        <AnimatedText
          text="AI changes are sandboxed before touching your code"
          fontSize={22}
          color="#737373"
          fontWeight={400}
          delay={8}
        />

        {/* Diff panel */}
        <div
          style={{
            width: 900,
            borderRadius: 16,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.08)",
            backgroundColor: "#0a0a0a",
            boxShadow: "0 0 40px rgba(59,130,246,0.15), 0 20px 40px rgba(0,0,0,0.6)",
            opacity: panelOpacity,
            transform: `scale(${panelScale})`,
          }}
        >
          {/* Diff header */}
          <div
            style={{
              padding: "10px 16px",
              backgroundColor: "#050505",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              fontFamily: "'Inter', system-ui, sans-serif",
              color: "#a3a3a3",
            }}
          >
            <span style={{ color: "#eab308" }}>&#x1F6E1;&#xFE0F;</span>
            Shadow Diff: LoginForm.tsx
            <div style={{ flex: 1 }} />
            <span style={{ color: "#22c55e", fontSize: 11 }}>+12 lines</span>
            <span style={{ color: "#ef4444", fontSize: 11 }}>-3 lines</span>
          </div>

          {/* Diff content */}
          <div style={{ padding: "8px 0" }}>
            <DiffLine type="context" text="export function LoginForm() {" delay={15} />
            <DiffLine type="remove" text="  const handleSubmit = (data: any) => {" delay={22} />
            <DiffLine type="add" text="  const handleSubmit = (data: LoginInput) => {" delay={28} />
            <DiffLine type="add" text="    const result = loginSchema.safeParse(data)" delay={34} />
            <DiffLine type="add" text="    if (!result.success) {" delay={40} />
            <DiffLine type="add" text='      setError(result.error.format())' delay={46} />
            <DiffLine type="add" text="      return" delay={52} />
            <DiffLine type="add" text="    }" delay={56} />
            <DiffLine type="context" text="    await authenticate(data)" delay={60} />
            <DiffLine type="remove" text="  }" delay={64} />
            <DiffLine type="add" text="  }" delay={68} />
          </div>
        </div>

        {/* Validation result */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            opacity: checkOpacity,
            transform: `scale(${checkScale})`,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              backgroundColor: "rgba(34,197,94,0.15)",
              border: "2px solid #22c55e",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              boxShadow: "0 0 20px rgba(34,197,94,0.3)",
            }}
          >
            &#x2713;
          </div>
          <div
            style={{
              fontSize: 18,
              color: "#22c55e",
              fontFamily: "'Inter', system-ui, sans-serif",
              fontWeight: 600,
            }}
          >
            All tests pass. Safe to apply.
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
