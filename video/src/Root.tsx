import React from "react";
import { Composition } from "remotion";
import { z } from "zod";
import { MainComposition } from "./Composition";

export const compositionSchema = z.object({
  hookLine: z.string(),
  tagline: z.string(),
  feature1Title: z.string(),
  feature1Desc: z.string(),
  feature2Title: z.string(),
  feature2Desc: z.string(),
  feature3Title: z.string(),
  feature3Desc: z.string(),
  valuePropLine1: z.string(),
  valuePropLine2: z.string(),
  ctaText: z.string(),
  ctaUrl: z.string(),
  primaryColor: z.string(),
  accentColor: z.string(),
  backgroundColor: z.string(),
  textColor: z.string(),
});

export type CompositionProps = z.infer<typeof compositionSchema>;

const defaultProps: CompositionProps = {
  hookLine: "Your IDE is watching you code.",
  tagline: "Kalynt is not.",
  feature1Title: "Local AI Agent",
  feature1Desc: "Run LLMs on your machine. No cloud. No leaks.",
  feature2Title: "P2P Encrypted Collab",
  feature2Desc: "End-to-end encrypted. No server in the middle.",
  feature3Title: "Shadow Workspace",
  feature3Desc: "AI changes sandboxed before touching your code.",
  valuePropLine1: "The IDE that respects your privacy.",
  valuePropLine2: "AI-powered. Locally run. Fully yours.",
  ctaText: "Star on GitHub",
  ctaUrl: "github.com/Hermes-Lekkas/Kalynt",
  primaryColor: "#3b82f6",
  accentColor: "#60a5fa",
  backgroundColor: "#000000",
  textColor: "#ffffff",
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MainComposition"
        component={MainComposition}
        durationInFrames={900}
        fps={30}
        width={1920}
        height={1080}
        schema={compositionSchema}
        defaultProps={defaultProps}
      />
    </>
  );
};
