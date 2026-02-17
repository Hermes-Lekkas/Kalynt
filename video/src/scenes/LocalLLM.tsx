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

interface LocalLLMProps {
  backgroundColor: string;
  primaryColor: string;
  accentColor: string;
  textColor: string;
}

const StatBar: React.FC<{
  label: string;
  value: string;
  percentage: number;
  color: string;
  delay: number;
}> = ({ label, value, percentage, color, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 20, stiffness: 60, mass: 0.5 },
  });

  const barWidth = interpolate(progress, [0, 1], [0, percentage]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);

  return (
    <div style={{ opacity, display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 14,
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        <span style={{ color: "#a3a3a3", fontWeight: 500 }}>{label}</span>
        <span style={{ color, fontWeight: 600 }}>{value}</span>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: "rgba(255,255,255,0.06)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${barWidth}%`,
            borderRadius: 3,
            background: `linear-gradient(90deg, ${color}, ${color}80)`,
            boxShadow: `0 0 10px ${color}40`,
          }}
        />
      </div>
    </div>
  );
};

const ModelCard: React.FC<{
  name: string;
  params: string;
  speed: string;
  active?: boolean;
  delay: number;
}> = ({ name, params, speed, active = false, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pop = spring({
    frame: frame - delay,
    fps,
    config: { damping: 15, stiffness: 100, mass: 0.4 },
  });

  const opacity = interpolate(pop, [0, 1], [0, 1]);
  const translateY = interpolate(pop, [0, 1], [20, 0]);

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        padding: "16px 20px",
        borderRadius: 12,
        backgroundColor: active
          ? "rgba(59,130,246,0.1)"
          : "rgba(255,255,255,0.03)",
        border: `1px solid ${
          active ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.06)"
        }`,
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          backgroundColor: active ? "#22c55e" : "#525252",
          boxShadow: active ? "0 0 8px #22c55e80" : "none",
        }}
      />
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: active ? "#ffffff" : "#a3a3a3",
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "#525252",
            fontFamily: "'Inter', system-ui, sans-serif",
            marginTop: 2,
          }}
        >
          {params}
        </div>
      </div>
      <div
        style={{
          fontSize: 13,
          color: active ? "#22c55e" : "#525252",
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 500,
        }}
      >
        {speed}
      </div>
    </div>
  );
};

export const LocalLLM: React.FC<LocalLLMProps> = ({
  backgroundColor,
  primaryColor,
  accentColor,
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
      <GlowOrb color="#8b5cf6" size={300} x={300} y={300} delay={10} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
          zIndex: 1,
        }}
      >
        {/* Title */}
        <AnimatedText
          text="Run AI Locally"
          fontSize={40}
          color="#60a5fa"
          fontWeight={600}
          delay={0}
          style={{ letterSpacing: "0.04em" }}
        />
        <AnimatedText
          text="No internet. No API keys. No data leaving your machine."
          fontSize={20}
          color="#737373"
          fontWeight={400}
          delay={8}
        />

        <div
          style={{
            display: "flex",
            gap: 40,
            marginTop: 16,
            width: 1200,
          }}
        >
          {/* Models list */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              padding: "24px",
              borderRadius: 16,
              backgroundColor: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#525252",
                fontFamily: "'Inter', system-ui, sans-serif",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 4,
              }}
            >
              Available Models
            </div>
            <ModelCard
              name="CodeQwen 1.5 7B"
              params="7B params | GGUF Q4"
              speed="42 tok/s"
              active
              delay={15}
            />
            <ModelCard
              name="Llama 3 8B Instruct"
              params="8B params | GGUF Q4"
              speed="38 tok/s"
              delay={22}
            />
            <ModelCard
              name="Mistral 7B v0.3"
              params="7B params | GGUF Q5"
              speed="35 tok/s"
              delay={29}
            />
          </div>

          {/* Hardware stats */}
          <div
            style={{
              width: 400,
              display: "flex",
              flexDirection: "column",
              gap: 20,
              padding: "24px",
              borderRadius: 16,
              backgroundColor: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#525252",
                fontFamily: "'Inter', system-ui, sans-serif",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 4,
              }}
            >
              System Resources
            </div>
            <StatBar
              label="CPU"
              value="34%"
              percentage={34}
              color="#3b82f6"
              delay={20}
            />
            <StatBar
              label="RAM"
              value="6.2 GB / 16 GB"
              percentage={39}
              color="#8b5cf6"
              delay={26}
            />
            <StatBar
              label="GPU (VRAM)"
              value="4.1 GB / 8 GB"
              percentage={51}
              color="#22c55e"
              delay={32}
            />
            <StatBar
              label="Disk I/O"
              value="120 MB/s"
              percentage={24}
              color="#eab308"
              delay={38}
            />

            {/* Cloud comparison */}
            <div
              style={{
                marginTop: 12,
                padding: "12px 16px",
                borderRadius: 10,
                backgroundColor: "rgba(239,68,68,0.06)",
                border: "1px solid rgba(239,68,68,0.15)",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ fontSize: 18 }}>&#x2601;&#xFE0F;</span>
              <div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#ef4444",
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontWeight: 600,
                    textDecoration: "line-through",
                  }}
                >
                  Cloud API: $0.03/1K tokens
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#22c55e",
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontWeight: 600,
                    marginTop: 2,
                  }}
                >
                  Local: Free forever
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
