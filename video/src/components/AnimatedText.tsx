import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

interface AnimatedTextProps {
  text: string;
  delay?: number;
  fontSize?: number;
  color?: string;
  fontWeight?: number;
  style?: React.CSSProperties;
}

export const AnimatedText: React.FC<AnimatedTextProps> = ({
  text,
  delay = 0,
  fontSize = 64,
  color = "#ffffff",
  fontWeight = 700,
  style = {},
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 20, stiffness: 100, mass: 0.5 },
  });

  const opacity = interpolate(progress, [0, 1], [0, 1]);
  const translateY = interpolate(progress, [0, 1], [40, 0]);

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        fontSize,
        fontWeight,
        color,
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
        lineHeight: 1.2,
        ...style,
      }}
    >
      {text}
    </div>
  );
};
