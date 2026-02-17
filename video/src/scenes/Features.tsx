import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { GlowOrb } from "../components/GlowOrb";
import { AnimatedText } from "../components/AnimatedText";
import { Logo } from "../components/Logo";

interface FeatureGridItem {
  icon: string;
  title: string;
  desc: string;
  color: string;
}

interface FeaturesProps {
  backgroundColor: string;
  primaryColor: string;
  textColor: string;
}

const features: FeatureGridItem[] = [
  {
    icon: "\u{1F9E0}",
    title: "ReAct Agent Loop",
    desc: "Plans, reasons, executes",
    color: "#3b82f6",
  },
  {
    icon: "\u{270F}\uFE0F",
    title: "Monaco Editor",
    desc: "VS Code core with AI completions",
    color: "#8b5cf6",
  },
  {
    icon: "\u{1F50D}",
    title: "Security Scanning",
    desc: "Static analysis built in",
    color: "#ef4444",
  },
  {
    icon: "\u{1F4BB}",
    title: "Integrated Terminal",
    desc: "GPU-accelerated with xterm.js",
    color: "#22c55e",
  },
  {
    icon: "\u{1F50C}",
    title: "Extension System",
    desc: "LSP + DAP protocol support",
    color: "#eab308",
  },
  {
    icon: "\u{1F30D}",
    title: "Cross Platform",
    desc: "Windows, macOS, Linux",
    color: "#06b6d4",
  },
];

const FeatureGridCard: React.FC<{
  item: FeatureGridItem;
  index: number;
}> = ({ item, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const delay = 10 + index * 8;
  const pop = spring({
    frame: frame - delay,
    fps,
    config: { damping: 15, stiffness: 100, mass: 0.4 },
  });

  const opacity = interpolate(pop, [0, 1], [0, 1]);
  const scale = interpolate(pop, [0, 1], [0.85, 1]);
  const translateY = interpolate(pop, [0, 1], [20, 0]);

  return (
    <div
      style={{
        opacity,
        transform: `scale(${scale}) translateY(${translateY}px)`,
        padding: "24px",
        borderRadius: 16,
        backgroundColor: `${item.color}08`,
        border: `1px solid ${item.color}20`,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ fontSize: 32 }}>{item.icon}</div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: item.color,
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        {item.title}
      </div>
      <div
        style={{
          fontSize: 14,
          color: "#737373",
          fontFamily: "'Inter', system-ui, sans-serif",
          lineHeight: 1.4,
        }}
      >
        {item.desc}
      </div>
    </div>
  );
};

export const Features: React.FC<FeaturesProps> = ({
  backgroundColor,
  primaryColor,
  textColor,
}) => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <GlowOrb color={primaryColor} size={500} x={960} y={540} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 36,
          zIndex: 1,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Logo delay={0} size={48} />
          <AnimatedText
            text="Everything You Need"
            fontSize={40}
            color={textColor}
            fontWeight={700}
            delay={0}
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 20,
            width: 1100,
          }}
        >
          {features.map((f, i) => (
            <FeatureGridCard key={i} item={f} index={i} />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
