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
import { Logo } from "../components/Logo";

interface CTAProps {
  ctaText: string;
  ctaUrl: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
}

export const CTA: React.FC<CTAProps> = ({
  ctaText,
  ctaUrl,
  primaryColor,
  accentColor,
  backgroundColor,
  textColor,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pulse = interpolate(Math.sin(frame * 0.08), [-1, 1], [1, 1.03]);

  const buttonProgress = spring({
    frame: frame - 25,
    fps,
    config: { damping: 14, stiffness: 100, mass: 0.5 },
  });
  const buttonOpacity = interpolate(buttonProgress, [0, 1], [0, 1]);
  const buttonScale = interpolate(buttonProgress, [0, 1], [0.8, 1]);

  const urlProgress = spring({
    frame: frame - 40,
    fps,
    config: { damping: 20, stiffness: 80, mass: 0.5 },
  });
  const urlOpacity = interpolate(urlProgress, [0, 1], [0, 1]);

  // Stats
  const stats = [
    { label: "Lines of Code", value: "67,785" },
    { label: "Local LLMs", value: "3+" },
    { label: "Cloud Required", value: "Zero" },
  ];

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <GlowOrb color={primaryColor} size={800} x={960} y={540} />
      <GlowOrb color="#8b5cf6" size={400} x={300} y={200} delay={5} />
      <GlowOrb color={accentColor} size={300} x={1600} y={800} delay={10} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 32,
          zIndex: 1,
        }}
      >
        <Logo delay={0} size={96} />

        <AnimatedText
          text="Kalynt"
          fontSize={80}
          color={textColor}
          fontWeight={700}
          delay={5}
        />

        <AnimatedText
          text="The Privacy-First AI IDE"
          fontSize={30}
          color="#a3a3a3"
          fontWeight={400}
          delay={12}
        />

        {/* Stats row */}
        <div style={{ display: "flex", gap: 48, marginTop: 8 }}>
          {stats.map((stat, i) => {
            const statPop = spring({
              frame: frame - 18 - i * 6,
              fps,
              config: { damping: 15, stiffness: 100, mass: 0.4 },
            });
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  opacity: interpolate(statPop, [0, 1], [0, 1]),
                  transform: `translateY(${interpolate(statPop, [0, 1], [15, 0])}px)`,
                }}
              >
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 700,
                    color: primaryColor,
                    fontFamily: "'Inter', system-ui, sans-serif",
                  }}
                >
                  {stat.value}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "#525252",
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontWeight: 500,
                  }}
                >
                  {stat.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA Button */}
        <div
          style={{
            opacity: buttonOpacity,
            transform: `scale(${buttonScale * pulse})`,
            padding: "16px 44px",
            borderRadius: 14,
            background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
            color: textColor,
            fontSize: 28,
            fontWeight: 700,
            fontFamily: "'Inter', system-ui, sans-serif",
            boxShadow: `0 0 40px ${primaryColor}50`,
            letterSpacing: "0.01em",
          }}
        >
          {ctaText}
        </div>

        {/* URL */}
        <div
          style={{
            opacity: urlOpacity,
            fontSize: 20,
            color: "#525252",
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 400,
          }}
        >
          {ctaUrl}
        </div>
      </div>
    </AbsoluteFill>
  );
};
