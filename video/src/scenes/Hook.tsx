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

interface HookProps {
  hookLine: string;
  tagline: string;
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
}

export const Hook: React.FC<HookProps> = ({
  hookLine,
  tagline,
  primaryColor,
  backgroundColor,
  textColor,
}) => {
  const frame = useCurrentFrame();

  // Surveillance scan line
  const scanY = interpolate(frame, [0, 50], [-100, 1200], {
    extrapolateRight: "clamp",
  });
  const scanOpacity = interpolate(frame, [0, 8, 42, 50], [0, 0.4, 0.4, 0], {
    extrapolateRight: "clamp",
  });

  // Glitch on hook text
  const glitch1 = frame > 18 && frame < 22 ? Math.sin(frame * 80) * 4 : 0;
  const glitch2 = frame > 38 && frame < 41 ? Math.sin(frame * 60) * 3 : 0;

  // Red flash for the "watching" emphasis
  const redFlash =
    frame > 18 && frame < 22
      ? interpolate(frame, [18, 20, 22], [0, 0.15, 0])
      : 0;

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Subtle grid pattern */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(59,130,246,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59,130,246,0.03) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
          opacity: interpolate(frame, [0, 30], [0, 1], {
            extrapolateRight: "clamp",
          }),
        }}
      />

      <GlowOrb color="#ef4444" size={400} x={960} y={540} delay={0} />
      <GlowOrb color={primaryColor} size={300} x={300} y={300} delay={10} />

      {/* Red surveillance overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: `rgba(239,68,68,${redFlash})`,
        }}
      />

      {/* Scan line */}
      <div
        style={{
          position: "absolute",
          top: scanY,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg, transparent, #ef4444, transparent)`,
          opacity: scanOpacity,
          boxShadow: "0 0 30px rgba(239,68,68,0.5)",
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 28,
          transform: `translateX(${glitch1 + glitch2}px)`,
          zIndex: 1,
        }}
      >
        <AnimatedText
          text={hookLine}
          fontSize={76}
          color={textColor}
          fontWeight={700}
          delay={5}
        />
        <AnimatedText
          text={tagline}
          fontSize={60}
          color={primaryColor}
          fontWeight={600}
          delay={30}
        />
      </div>
    </AbsoluteFill>
  );
};
