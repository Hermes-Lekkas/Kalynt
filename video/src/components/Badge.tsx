import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

interface BadgeProps {
  text: string;
  color: string;
  delay?: number;
}

export const Badge: React.FC<BadgeProps> = ({ text, color, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 15, stiffness: 120, mass: 0.4 },
  });

  const opacity = interpolate(progress, [0, 1], [0, 1]);
  const scale = interpolate(progress, [0, 1], [0.8, 1]);

  return (
    <div
      style={{
        opacity,
        transform: `scale(${scale})`,
        display: "inline-flex",
        width: "fit-content",
        padding: "8px 20px",
        borderRadius: 9999,
        backgroundColor: `${color}20`,
        border: `1px solid ${color}40`,
        color,
        fontSize: 20,
        fontWeight: 600,
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
        letterSpacing: "0.02em",
      }}
    >
      {text}
    </div>
  );
};
