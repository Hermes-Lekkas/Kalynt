/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import React from 'react'
import {
    NotebookPen, Clipboard, Pencil, Maximize, Lightbulb,
    Code, Search, Wrench, FlaskConical, Bug, BookOpen, Zap,
    Megaphone, Newspaper, MessageSquare, Target, Mail, Star,
    Book, List, HelpCircle, FileText, ListOrdered,
    Sparkles, ArrowRight, RefreshCw, MessageCircle, Palette, Shuffle, User,
    Calendar, CheckSquare, Scale, Mic, Shield, Send, Bell, Calculator,
    Microscope, BarChart, Link, Cloud, Briefcase
} from 'lucide-react'

// Editor Modes - Templates and AI configuration for different use cases

export type EditorMode =
    | 'general'
    | 'programming'
    | 'marketing'
    | 'documentation'
    | 'creative'
    | 'meeting'
    | 'sales'
    | 'research'

export interface SlashCommand {
    name: string
    description: string
    icon: React.ReactNode
    prompt: string
}

export interface EditorModeConfig {
    id: EditorMode
    name: string
    icon: React.ReactNode
    description: string
    placeholder: string
    template: string
    systemPrompt: string
    commands: SlashCommand[]
}

export const EDITOR_MODES: EditorModeConfig[] = [
    {
        id: 'general',
        name: 'General',
        icon: <NotebookPen size={16} />,
        description: 'Free-form writing and notes',
        placeholder: 'Start writing... (type / for AI commands)',
        template: '',
        systemPrompt: 'You are a helpful writing assistant. Help the user write clearly and effectively.',
        commands: [
            { name: 'summarize', description: 'Summarize text', icon: <Clipboard size={14} />, prompt: 'Summarize the following text concisely:' },
            { name: 'fix', description: 'Fix grammar', icon: <Pencil size={14} />, prompt: 'Fix grammar and spelling errors:' },
            { name: 'expand', description: 'Expand text', icon: <Maximize size={14} />, prompt: 'Expand and elaborate on this text:' },
            { name: 'simplify', description: 'Simplify', icon: <Lightbulb size={14} />, prompt: 'Simplify this text for easier understanding:' },
        ]
    },
    {
        id: 'programming',
        name: 'Programming',
        icon: <Code size={16} />,
        description: 'Code editing and development',
        placeholder: 'Write or paste code... (try /explain, /refactor, /test)',
        template: `# Project Name

## Overview
Describe your project here.

## Setup
\`\`\`bash
# Installation steps
\`\`\`

## Code
\`\`\`javascript
// Your code here
\`\`\`

## Notes
- 
`,
        systemPrompt: 'You are an expert software developer. Help with code review, debugging, refactoring, and best practices. Always provide clean, well-documented code.',
        commands: [
            { name: 'explain', description: 'Explain code', icon: <Search size={14} />, prompt: 'Explain what this code does step by step:' },
            { name: 'refactor', description: 'Refactor code', icon: <Wrench size={14} />, prompt: 'Refactor this code for better readability and performance:' },
            { name: 'test', description: 'Generate tests', icon: <FlaskConical size={14} />, prompt: 'Write unit tests for this code:' },
            { name: 'debug', description: 'Find bugs', icon: <Bug size={14} />, prompt: 'Identify potential bugs and issues in this code:' },
            { name: 'document', description: 'Add docs', icon: <BookOpen size={14} />, prompt: 'Add comprehensive documentation comments to this code:' },
            { name: 'optimize', description: 'Optimize', icon: <Zap size={14} />, prompt: 'Optimize this code for better performance:' },
        ]
    },
    {
        id: 'marketing',
        name: 'Marketing',
        icon: <Megaphone size={16} />,
        description: 'Copy, campaigns, and content',
        placeholder: 'Write marketing copy... (try /headline, /caption, /cta)',
        template: `# Campaign: [Name]

## Target Audience
- Demographics:
- Pain points:
- Goals:

## Key Messages
1. 
2. 
3. 

## Content Ideas

### Headlines

### Body Copy

### Call to Action

## Channels
- [ ] Social media
- [ ] Email
- [ ] Blog
- [ ] Ads
`,
        systemPrompt: 'You are a creative marketing expert and copywriter. Write compelling, persuasive content that drives engagement and conversions. Use proven copywriting frameworks like AIDA, PAS, and emotional triggers.',
        commands: [
            { name: 'headline', description: 'Generate headlines', icon: <Newspaper size={14} />, prompt: 'Write 5 compelling headlines for:' },
            { name: 'caption', description: 'Social caption', icon: <MessageSquare size={14} />, prompt: 'Write an engaging social media caption:' },
            { name: 'cta', description: 'Call to action', icon: <Target size={14} />, prompt: 'Create a compelling call-to-action for:' },
            { name: 'email', description: 'Email copy', icon: <Mail size={14} />, prompt: 'Write a marketing email for:' },
            { name: 'ad', description: 'Ad copy', icon: <Megaphone size={14} />, prompt: 'Write ad copy (headline + body) for:' },
            { name: 'tagline', description: 'Tagline', icon: <Star size={14} />, prompt: 'Create 5 catchy taglines for:' },
        ]
    },
    {
        id: 'documentation',
        name: 'Documentation',
        icon: <Book size={16} />,
        description: 'Technical docs and guides',
        placeholder: 'Write documentation... (try /outline, /explain-simply)',
        template: `# Title

## Overview
Brief description of what this document covers.

## Prerequisites
- 

## Getting Started

### Step 1: 

### Step 2:

### Step 3:

## Reference

## FAQ

## Troubleshooting

---
Last updated: ${new Date().toLocaleDateString()}
`,
        systemPrompt: 'You are a technical writer creating clear, comprehensive documentation. Use simple language, provide examples, and structure content logically. Follow best practices for technical documentation.',
        commands: [
            { name: 'outline', description: 'Create outline', icon: <List size={14} />, prompt: 'Create a detailed outline for documenting:' },
            { name: 'explain-simply', description: 'Simplify', icon: <Lightbulb size={14} />, prompt: 'Explain this in simple terms for beginners:' },
            { name: 'example', description: 'Add example', icon: <FileText size={14} />, prompt: 'Provide a clear example for:' },
            { name: 'faq', description: 'Generate FAQ', icon: <HelpCircle size={14} />, prompt: 'Generate FAQ questions and answers for:' },
            { name: 'steps', description: 'Step-by-step', icon: <ListOrdered size={14} />, prompt: 'Write step-by-step instructions for:' },
        ]
    },
    {
        id: 'creative',
        name: 'Creative Writing',
        icon: <Sparkles size={16} />,
        description: 'Stories, scripts, and content',
        placeholder: 'Let your creativity flow... (try /continue, /rewrite)',
        template: `# [Title]

## Synopsis


## Characters
- **Name**: Description

## Setting


## Chapter 1


---
Word count: 0
`,
        systemPrompt: 'You are a creative writing assistant with expertise in storytelling, character development, and narrative structure. Help craft compelling stories with vivid descriptions, engaging dialogue, and emotional depth.',
        commands: [
            { name: 'continue', description: 'Continue story', icon: <ArrowRight size={14} />, prompt: 'Continue this story naturally:' },
            { name: 'rewrite', description: 'Rewrite', icon: <RefreshCw size={14} />, prompt: 'Rewrite this passage with more vivid language:' },
            { name: 'dialogue', description: 'Write dialogue', icon: <MessageCircle size={14} />, prompt: 'Write realistic dialogue for this scene:' },
            { name: 'describe', description: 'Describe', icon: <Palette size={14} />, prompt: 'Write a vivid description of:' },
            { name: 'twist', description: 'Plot twist', icon: <Shuffle size={14} />, prompt: 'Suggest a surprising plot twist for:' },
            { name: 'character', description: 'Develop character', icon: <User size={14} />, prompt: 'Develop this character with backstory and motivation:' },
        ]
    },
    {
        id: 'meeting',
        name: 'Meeting Notes',
        icon: <Calendar size={16} />,
        description: 'Agendas and action items',
        placeholder: 'Take meeting notes... (try /action-items, /follow-up)',
        template: `# Meeting: [Topic]
Date: ${new Date().toLocaleDateString()}
Time: 
Attendees: 

## Agenda
1. 
2. 
3. 

## Discussion Notes


## Decisions Made
- 

## Action Items
| Task | Owner | Due Date |
|------|-------|----------|
|      |       |          |

## Next Steps


## Follow-up Meeting
Date: 
`,
        systemPrompt: 'You are a meeting assistant helping to organize, summarize, and extract actionable insights from meetings. Focus on clarity, action items, and accountability.',
        commands: [
            { name: 'action-items', description: 'Extract actions', icon: <CheckSquare size={14} />, prompt: 'Extract all action items from these notes with owners and deadlines:' },
            { name: 'summarize-meeting', description: 'Summarize', icon: <Clipboard size={14} />, prompt: 'Summarize this meeting with key decisions and outcomes:' },
            { name: 'follow-up', description: 'Follow-up email', icon: <Mail size={14} />, prompt: 'Write a follow-up email summarizing this meeting:' },
            { name: 'agenda', description: 'Create agenda', icon: <List size={14} />, prompt: 'Create a meeting agenda for:' },
            { name: 'decisions', description: 'List decisions', icon: <Scale size={14} />, prompt: 'List all decisions made in these notes:' },
        ]
    },
    {
        id: 'sales',
        name: 'Sales',
        icon: <Briefcase size={16} />,
        description: 'Proposals and outreach',
        placeholder: 'Write sales content... (try /pitch, /objection, /proposal)',
        template: `# Opportunity: [Company Name]

## Prospect Information
- **Company**: 
- **Contact**: 
- **Role**: 
- **Industry**: 
- **Size**: 

## Pain Points
1. 
2. 
3. 

## Our Solution


## Value Proposition


## Pricing


## Timeline


## Next Steps
- [ ] 

## Notes

`,
        systemPrompt: 'You are a sales expert helping craft persuasive proposals, handle objections, and close deals. Focus on value, ROI, and building trust. Use consultative selling techniques.',
        commands: [
            { name: 'pitch', description: 'Elevator pitch', icon: <Mic size={14} />, prompt: 'Write a compelling elevator pitch for:' },
            { name: 'objection', description: 'Handle objection', icon: <Shield size={14} />, prompt: 'Provide responses to handle this sales objection:' },
            { name: 'proposal', description: 'Write proposal', icon: <FileText size={14} />, prompt: 'Write a sales proposal for:' },
            { name: 'outreach', description: 'Cold outreach', icon: <Send size={14} />, prompt: 'Write a cold outreach email for:' },
            { name: 'follow-up-sales', description: 'Follow up', icon: <Bell size={14} />, prompt: 'Write a follow-up message after:' },
            { name: 'roi', description: 'Calculate ROI', icon: <Calculator size={14} />, prompt: 'Help articulate the ROI for:' },
        ]
    },
    {
        id: 'research',
        name: 'Research',
        icon: <Microscope size={16} />,
        description: 'Analysis and notes',
        placeholder: 'Document your research... (try /analyze, /compare)',
        template: `# Research: [Topic]

## Research Question


## Hypothesis


## Methodology


## Findings

### Key Insight 1

### Key Insight 2

### Key Insight 3

## Data & Evidence


## Analysis


## Conclusions


## Recommendations


## Sources
1. 
2. 
3. 

---
Researcher: 
Date: ${new Date().toLocaleDateString()}
`,
        systemPrompt: 'You are a research analyst helping to gather, analyze, and synthesize information. Focus on objectivity, evidence-based conclusions, and actionable insights.',
        commands: [
            { name: 'analyze', description: 'Analyze data', icon: <BarChart size={14} />, prompt: 'Analyze and interpret this data or finding:' },
            { name: 'compare', description: 'Compare', icon: <Scale size={14} />, prompt: 'Compare and contrast these items:' },
            { name: 'synthesize', description: 'Synthesize', icon: <Link size={14} />, prompt: 'Synthesize these findings into key insights:' },
            { name: 'cite', description: 'Format citation', icon: <BookOpen size={14} />, prompt: 'Format this as a proper citation:' },
            { name: 'hypothesis', description: 'Hypothesis', icon: <Cloud size={14} />, prompt: 'Generate hypotheses based on:' },
            { name: 'methodology', description: 'Methodology', icon: <Search size={14} />, prompt: 'Suggest research methodology for:' },
        ]
    }
]

export function getModeConfig(mode: EditorMode): EditorModeConfig {
    return EDITOR_MODES.find(m => m.id === mode) || EDITOR_MODES[0]
}

export function getModeCommands(mode: EditorMode): SlashCommand[] {
    return getModeConfig(mode).commands
}

export function getModeSystemPrompt(mode: EditorMode): string {
    return getModeConfig(mode).systemPrompt
}
