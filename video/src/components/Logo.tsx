import React from "react";
import { Img, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { interpolate } from "remotion";

interface LogoProps {
  delay?: number;
  size?: number;
}

export const Logo: React.FC<LogoProps> = ({ delay = 0, size = 80 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame: frame - delay,
    fps,
    config: { damping: 12, stiffness: 100, mass: 0.8 },
  });

  const opacity = interpolate(scale, [0, 1], [0, 1]);

  return (
    <div
      style={{
        opacity,
        transform: `scale(${scale})`,
        width: size,
        height: size,
      }}
    >
      <Img
        src={staticFile("logo.png")}
        style={{
          width: size,
          height: size,
          borderRadius: 16,
        }}
      />
    </div>
  );
};
