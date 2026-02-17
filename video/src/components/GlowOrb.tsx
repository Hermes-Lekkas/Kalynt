import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

interface GlowOrbProps {
  color: string;
  size?: number;
  x: number;
  y: number;
  delay?: number;
}

export const GlowOrb: React.FC<GlowOrbProps> = ({
  color,
  size = 400,
  x,
  y,
  delay = 0,
}) => {
  const frame = useCurrentFrame();

  const breathe = interpolate(
    Math.sin((frame - delay) * 0.03),
    [-1, 1],
    [0.4, 0.7]
  );

  const drift = Math.sin((frame - delay) * 0.01) * 20;

  return (
    <div
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2 + drift,
        width: size,
        height: size,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${color}${Math.round(breathe * 255)
          .toString(16)
          .padStart(2, "0")} 0%, transparent 70%)`,
        filter: "blur(60px)",
        pointerEvents: "none",
      }}
    />
  );
};
