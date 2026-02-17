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

interface P2PCollabProps {
  backgroundColor: string;
  primaryColor: string;
  accentColor: string;
  textColor: string;
}

const PeerNode: React.FC<{
  x: number;
  y: number;
  label: string;
  color: string;
  delay: number;
  isCenter?: boolean;
}> = ({ x, y, label, color, delay, isCenter = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pop = spring({
    frame: frame - delay,
    fps,
    config: { damping: 12, stiffness: 100, mass: 0.5 },
  });

  const scale = interpolate(pop, [0, 1], [0, 1]);
  const opacity = interpolate(pop, [0, 1], [0, 1]);
  const size = isCenter ? 72 : 56;

  const breathe = interpolate(
    Math.sin((frame - delay) * 0.05),
    [-1, 1],
    [0.95, 1.05]
  );

  return (
    <div
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        opacity,
        transform: `scale(${scale * breathe})`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: isCenter
            ? `linear-gradient(135deg, ${color}, #8b5cf6)`
            : `linear-gradient(135deg, ${color}80, ${color}40)`,
          border: `2px solid ${color}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: isCenter ? 28 : 22,
          fontWeight: 700,
          color: "#ffffff",
          fontFamily: "'Inter', system-ui, sans-serif",
          boxShadow: `0 0 ${isCenter ? 30 : 16}px ${color}50`,
        }}
      >
        {label[0]}
      </div>
      <span
        style={{
          fontSize: 12,
          color: "#a3a3a3",
          fontFamily: "'Inter', system-ui, sans-serif",
          fontWeight: 500,
        }}
      >
        {label}
      </span>
    </div>
  );
};

const ConnectionLine: React.FC<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  delay: number;
  color: string;
}> = ({ x1, y1, x2, y2, delay, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 20, stiffness: 60, mass: 0.5 },
  });

  const drawLen = interpolate(progress, [0, 1], [0, 1]);
  const opacity = interpolate(progress, [0, 1], [0, 0.6]);

  // Data packet animation
  const packetT = ((frame - delay) * 0.02) % 1;
  const packetX = x1 + (x2 - x1) * packetT;
  const packetY = y1 + (y2 - y1) * packetT;
  const packetOpacity = progress > 0.8 ? 0.8 : 0;

  const endX = x1 + (x2 - x1) * drawLen;
  const endY = y1 + (y2 - y1) * drawLen;

  return (
    <>
      <svg
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
      >
        <line
          x1={x1}
          y1={y1}
          x2={endX}
          y2={endY}
          stroke={color}
          strokeWidth={2}
          opacity={opacity}
          strokeDasharray="6,4"
        />
      </svg>
      {/* Data packet */}
      <div
        style={{
          position: "absolute",
          left: packetX - 4,
          top: packetY - 4,
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: color,
          opacity: packetOpacity,
          boxShadow: `0 0 10px ${color}`,
        }}
      />
    </>
  );
};

export const P2PCollab: React.FC<P2PCollabProps> = ({
  backgroundColor,
  primaryColor,
  accentColor,
  textColor,
}) => {
  const frame = useCurrentFrame();

  const centerX = 960;
  const centerY = 480;
  const radius = 240;

  const peers = [
    { label: "Hermes", angle: 0, color: primaryColor },
    { label: "Alice", angle: 72, color: "#22c55e" },
    { label: "Bob", angle: 144, color: "#eab308" },
    { label: "Carol", angle: 216, color: "#8b5cf6" },
    { label: "Dave", angle: 288, color: "#ef4444" },
  ];

  const peerPositions = peers.map((p) => ({
    ...p,
    x: centerX + Math.cos((p.angle * Math.PI) / 180) * radius,
    y: centerY + Math.sin((p.angle * Math.PI) / 180) * radius,
  }));

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <GlowOrb color={primaryColor} size={500} x={960} y={480} />

      {/* Title */}
      <div
        style={{
          position: "absolute",
          top: 40,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          zIndex: 10,
        }}
      >
        <AnimatedText
          text="Serverless P2P Collaboration"
          fontSize={36}
          color="#60a5fa"
          fontWeight={600}
          delay={0}
          style={{ letterSpacing: "0.04em" }}
        />
        <AnimatedText
          text="End-to-end encrypted with AES-256-GCM. No server in the middle."
          fontSize={20}
          color="#737373"
          fontWeight={400}
          delay={8}
        />
      </div>

      {/* Connection lines */}
      {peerPositions.map((peer, i) =>
        peerPositions
          .slice(i + 1)
          .map((other, j) => (
            <ConnectionLine
              key={`${i}-${j}`}
              x1={peer.x}
              y1={peer.y}
              x2={other.x}
              y2={other.y}
              delay={15 + i * 5 + j * 3}
              color={peer.color}
            />
          ))
      )}

      {/* Peer nodes */}
      {peerPositions.map((peer, i) => (
        <PeerNode
          key={i}
          x={peer.x}
          y={peer.y}
          label={peer.label}
          color={peer.color}
          delay={10 + i * 8}
          isCenter={i === 0}
        />
      ))}

      {/* Encryption badge */}
      <div
        style={{
          position: "absolute",
          bottom: 80,
          display: "flex",
          alignItems: "center",
          gap: 24,
        }}
      >
        {["WebRTC", "CRDTs (Yjs)", "AES-256-GCM"].map((tech, i) => {
          const { fps } = useVideoConfig();
          const pop = spring({
            frame: frame - 60 - i * 10,
            fps,
            config: { damping: 15, stiffness: 100, mass: 0.4 },
          });
          return (
            <div
              key={i}
              style={{
                opacity: interpolate(pop, [0, 1], [0, 1]),
                transform: `scale(${interpolate(pop, [0, 1], [0.8, 1])})`,
                padding: "8px 20px",
                borderRadius: 9999,
                backgroundColor: "rgba(59,130,246,0.1)",
                border: "1px solid rgba(59,130,246,0.2)",
                color: "#60a5fa",
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "'Inter', system-ui, sans-serif",
              }}
            >
              {tech}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
