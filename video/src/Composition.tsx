import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  useCurrentFrame,
} from "remotion";
import type { CompositionProps } from "./Root";
import { Hook } from "./scenes/Hook";
import { IDEReveal } from "./scenes/IDEReveal";
import { AgentDemo } from "./scenes/AgentDemo";
import { ShadowWorkspace } from "./scenes/ShadowWorkspace";
import { P2PCollab } from "./scenes/P2PCollab";
import { LocalLLM } from "./scenes/LocalLLM";
import { Features } from "./scenes/Features";
import { CTA } from "./scenes/CTA";

// Scene timing (frames at 30fps) - 30 second video = 900 frames
// Scene 1: Hook         0-100    (3.3s)
// Scene 2: IDE Reveal   90-220   (4.3s)
// Scene 3: Agent Demo   210-350  (4.7s)
// Scene 4: Shadow WS    340-460  (4.0s)
// Scene 5: P2P Collab   450-580  (4.3s)
// Scene 6: Local LLM    570-690  (4.0s)
// Scene 7: Features     680-790  (3.7s)
// Scene 8: CTA          780-900  (4.0s)

const FADE = 12;

const FadeInOut: React.FC<{
  children: React.ReactNode;
  duration: number;
  fadeIn?: boolean;
  fadeOut?: boolean;
}> = ({ children, duration, fadeIn = true, fadeOut = true }) => {
  const frame = useCurrentFrame();

  const inVal = fadeIn
    ? interpolate(frame, [0, FADE], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;

  const outVal = fadeOut
    ? interpolate(frame, [duration - FADE, duration], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;

  return (
    <AbsoluteFill style={{ opacity: Math.min(inVal, outVal) }}>
      {children}
    </AbsoluteFill>
  );
};

export const MainComposition: React.FC<CompositionProps> = (props) => {
  return (
    <AbsoluteFill style={{ backgroundColor: props.backgroundColor }}>
      {/* Scene 1: Hook - "Your IDE is watching you code" */}
      <Sequence from={0} durationInFrames={100}>
        <FadeInOut duration={100} fadeIn={false}>
          <Hook
            hookLine={props.hookLine}
            tagline={props.tagline}
            primaryColor={props.primaryColor}
            backgroundColor={props.backgroundColor}
            textColor={props.textColor}
          />
        </FadeInOut>
      </Sequence>

      {/* Scene 2: IDE Reveal - Full IDE mockup with code typing */}
      <Sequence from={90} durationInFrames={130}>
        <FadeInOut duration={130}>
          <IDEReveal
            backgroundColor={props.backgroundColor}
            primaryColor={props.primaryColor}
          />
        </FadeInOut>
      </Sequence>

      {/* Scene 3: Agent Demo - AI agent writing code */}
      <Sequence from={210} durationInFrames={140}>
        <FadeInOut duration={140}>
          <AgentDemo
            backgroundColor={props.backgroundColor}
            primaryColor={props.primaryColor}
            textColor={props.textColor}
          />
        </FadeInOut>
      </Sequence>

      {/* Scene 4: Shadow Workspace - Sandboxed validation */}
      <Sequence from={340} durationInFrames={120}>
        <FadeInOut duration={120}>
          <ShadowWorkspace
            backgroundColor={props.backgroundColor}
            primaryColor={props.primaryColor}
            textColor={props.textColor}
          />
        </FadeInOut>
      </Sequence>

      {/* Scene 5: P2P Collab - Mesh network visualization */}
      <Sequence from={450} durationInFrames={130}>
        <FadeInOut duration={130}>
          <P2PCollab
            backgroundColor={props.backgroundColor}
            primaryColor={props.primaryColor}
            accentColor={props.accentColor}
            textColor={props.textColor}
          />
        </FadeInOut>
      </Sequence>

      {/* Scene 6: Local LLM - Hardware stats and model list */}
      <Sequence from={570} durationInFrames={120}>
        <FadeInOut duration={120}>
          <LocalLLM
            backgroundColor={props.backgroundColor}
            primaryColor={props.primaryColor}
            accentColor={props.accentColor}
            textColor={props.textColor}
          />
        </FadeInOut>
      </Sequence>

      {/* Scene 7: Feature Grid - Everything at a glance */}
      <Sequence from={680} durationInFrames={110}>
        <FadeInOut duration={110}>
          <Features
            backgroundColor={props.backgroundColor}
            primaryColor={props.primaryColor}
            textColor={props.textColor}
          />
        </FadeInOut>
      </Sequence>

      {/* Scene 8: CTA - Star on GitHub */}
      <Sequence from={780} durationInFrames={120}>
        <FadeInOut duration={120} fadeOut={false}>
          <CTA
            ctaText={props.ctaText}
            ctaUrl={props.ctaUrl}
            primaryColor={props.primaryColor}
            accentColor={props.accentColor}
            backgroundColor={props.backgroundColor}
            textColor={props.textColor}
          />
        </FadeInOut>
      </Sequence>
    </AbsoluteFill>
  );
};
