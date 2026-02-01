/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
/**
 * VS Code compatible task configuration types
 * Based on VS Code tasks.json schema
 */

export type TaskType = 'shell' | 'process' | 'npm' | 'custom';

export type PresentationReveal = 'always' | 'never' | 'silent';

export type PresentationPanel = 'shared' | 'dedicated' | 'new';

export type PresentationFocus = boolean;

export type PresentationClear = boolean;

export interface TaskPresentation {
  reveal?: PresentationReveal;
  panel?: PresentationPanel;
  focus?: PresentationFocus;
  clear?: PresentationClear;
  echo?: boolean;
  showReuseMessage?: boolean;
  close?: boolean;
}

export interface ProblemMatcher {
  owner?: string;
  pattern?: ProblemPattern | ProblemPattern[];
  fileLocation?: string | string[];
  severity?: 'error' | 'warning' | 'info';
  source?: string;
  background?: BackgroundMatcher;
}

export interface ProblemPattern {
  regexp: string;
  file?: number;
  location?: number;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  severity?: number;
  code?: number;
  message?: number;
  loop?: boolean;
}

export interface BackgroundMatcher {
  activeOnStart?: boolean;
  beginsPattern?: string | { regexp: string };
  endsPattern?: string | { regexp: string };
}

export interface TaskGroup {
  kind?: 'build' | 'test' | 'clean' | 'rebuild';
  isDefault?: boolean;
}

export interface TaskOptions {
  cwd?: string;
  env?: Record<string, string>;
  shell?: {
    executable?: string;
    args?: string[];
  };
}

export interface Task {
  label: string;
  type: TaskType;
  command: string;
  args?: string[];
  options?: TaskOptions;
  group?: TaskGroup | string;
  presentation?: TaskPresentation;
  problemMatcher?: string | string[] | ProblemMatcher | ProblemMatcher[];
  dependsOn?: string | string[];
  dependsOrder?: 'parallel' | 'sequence';
  runOptions?: {
    runOn?: 'default' | 'folderOpen';
  };
  detail?: string;
  isBackground?: boolean;
}

export interface TasksConfiguration {
  version: '2.0.0';
  tasks: Task[];
  inputs?: TaskInput[];
}

export type TaskInputType = 'promptString' | 'pickString' | 'command';

export interface TaskInput {
  id: string;
  type: TaskInputType;
  description?: string;
  default?: string;
  options?: string[];
}

// Built-in problem matchers that VS Code provides
export const BUILTIN_PROBLEM_MATCHERS = {
  '$tsc': 'TypeScript compiler',
  '$tsc-watch': 'TypeScript compiler (watch mode)',
  '$eslint-compact': 'ESLint compact format',
  '$eslint-stylish': 'ESLint stylish format',
  '$gcc': 'GCC compiler',
  '$msCompile': 'Microsoft C/C++ compiler',
  '$go': 'Go compiler',
  '$rustc': 'Rust compiler',
  '$cargo': 'Cargo (Rust)',
  '$node-sass': 'Node Sass compiler',
  '$jshint': 'JSHint',
  '$jshint-stylish': 'JSHint stylish',
  '$lessc': 'LESS compiler',
} as const;

export interface TaskExecution {
  taskId: string;
  taskLabel: string;
  processId?: number;
  startTime: number;
  endTime?: number;
  exitCode?: number;
  problems: Problem[];
}

export interface Problem {
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  code?: string;
  source?: string;
}
