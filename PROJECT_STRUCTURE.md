# Kalynt Project Structure

Generated on: 2/5/2026, 6:07:41 AM

```
├── .github
│   └── workflows
│       └── release.yml
├── apps
│   └── desktop
│       ├── .kalynt
│       │   └── sessions
│       ├── electron
│       │   ├── handlers
│       │   │   ├── app-info.ts
│       │   │   ├── build.ts
│       │   │   ├── code-execution.ts
│       │   │   ├── debug.ts
│       │   │   ├── dependency.ts
│       │   │   ├── file-system.ts
│       │   │   ├── git.ts
│       │   │   ├── llm-inference.ts
│       │   │   ├── model-download.ts
│       │   │   ├── nuke-handler.ts
│       │   │   ├── runtime.ts
│       │   │   ├── safeStorage.ts
│       │   │   ├── terminal.ts
│       │   │   └── update-handler.ts
│       │   ├── services
│       │   │   ├── hardware-service.ts
│       │   │   └── runtime-manager.ts
│       │   ├── terminal
│       │   │   ├── dependencyManager.ts
│       │   │   ├── languageGateway.ts
│       │   │   ├── shellIntegration.ts
│       │   │   ├── taskRunner.ts
│       │   │   ├── terminalManager.ts
│       │   │   └── terminalService.ts
│       │   ├── utils
│       │   │   └── pathValidator.ts
│       │   ├── main.ts
│       │   └── preload.ts
│       ├── public
│       │   ├── favicon.ico
│       │   ├── Kalynt_16x16.ico
│       │   ├── Kalynt_256x256.ico
│       │   ├── Kalynt_32x32.ico
│       │   └── Kalynt_48x48.ico
│       ├── release
│       │   ├── win-unpacked
│       │   │   ├── locales
│       │   │   │   ├── af.pak
│       │   │   │   ├── am.pak
│       │   │   │   ├── ar.pak
│       │   │   │   ├── bg.pak
│       │   │   │   ├── bn.pak
│       │   │   │   ├── ca.pak
│       │   │   │   ├── cs.pak
│       │   │   │   ├── da.pak
│       │   │   │   ├── de.pak
│       │   │   │   ├── el.pak
│       │   │   │   ├── en-GB.pak
│       │   │   │   ├── en-US.pak
│       │   │   │   ├── es-419.pak
│       │   │   │   ├── es.pak
│       │   │   │   ├── et.pak
│       │   │   │   ├── fa.pak
│       │   │   │   ├── fi.pak
│       │   │   │   ├── fil.pak
│       │   │   │   ├── fr.pak
│       │   │   │   ├── gu.pak
│       │   │   │   ├── he.pak
│       │   │   │   ├── hi.pak
│       │   │   │   ├── hr.pak
│       │   │   │   ├── hu.pak
│       │   │   │   ├── id.pak
│       │   │   │   ├── it.pak
│       │   │   │   ├── ja.pak
│       │   │   │   ├── kn.pak
│       │   │   │   ├── ko.pak
│       │   │   │   ├── lt.pak
│       │   │   │   ├── lv.pak
│       │   │   │   ├── ml.pak
│       │   │   │   ├── mr.pak
│       │   │   │   ├── ms.pak
│       │   │   │   ├── nb.pak
│       │   │   │   ├── nl.pak
│       │   │   │   ├── pl.pak
│       │   │   │   ├── pt-BR.pak
│       │   │   │   ├── pt-PT.pak
│       │   │   │   ├── ro.pak
│       │   │   │   ├── ru.pak
│       │   │   │   ├── sk.pak
│       │   │   │   ├── sl.pak
│       │   │   │   ├── sr.pak
│       │   │   │   ├── sv.pak
│       │   │   │   ├── sw.pak
│       │   │   │   ├── ta.pak
│       │   │   │   ├── te.pak
│       │   │   │   ├── th.pak
│       │   │   │   ├── tr.pak
│       │   │   │   ├── uk.pak
│       │   │   │   ├── ur.pak
│       │   │   │   ├── vi.pak
│       │   │   │   ├── zh-CN.pak
│       │   │   │   └── zh-TW.pak
│       │   │   ├── resources
│       │   │   │   ├── app.asar.unpacked
│       │   │   │   ├── app-update.yml
│       │   │   │   ├── app.asar
│       │   │   │   └── elevate.exe
│       │   │   ├── chrome_100_percent.pak
│       │   │   ├── chrome_200_percent.pak
│       │   │   ├── d3dcompiler_47.dll
│       │   │   ├── dxcompiler.dll
│       │   │   ├── dxil.dll
│       │   │   ├── ffmpeg.dll
│       │   │   ├── icudtl.dat
│       │   │   ├── Kalynt.exe
│       │   │   ├── libEGL.dll
│       │   │   ├── libGLESv2.dll
│       │   │   ├── LICENSES.chromium.html
│       │   │   ├── resources.pak
│       │   │   ├── snapshot_blob.bin
│       │   │   ├── v8_context_snapshot.bin
│       │   │   ├── vk_swiftshader_icd.json
│       │   │   ├── vk_swiftshader.dll
│       │   │   └── vulkan-1.dll
│       │   ├── builder-debug.yml
│       │   ├── builder-effective-config.yaml
│       │   ├── Kalynt 1.0.0-beta.exe
│       │   ├── Kalynt Setup 1.0.0-beta.exe
│       │   ├── Kalynt Setup 1.0.0-beta.exe.blockmap
│       │   └── latest.yml
│       ├── scripts
│       ├── src
│       │   ├── components
│       │   │   ├── ide
│       │   │   │   ├── terminal
│       │   │   │   │   ├── CommandBlock.tsx
│       │   │   │   │   ├── CommandPalette.tsx
│       │   │   │   │   ├── TerminalContextMenu.tsx
│       │   │   │   │   ├── TerminalHeader.tsx
│       │   │   │   │   ├── TerminalSearch.tsx
│       │   │   │   │   ├── TerminalSplitView.tsx
│       │   │   │   │   ├── TerminalStatusBar.tsx
│       │   │   │   │   ├── types.ts
│       │   │   │   │   ├── useTerminalIO.ts
│       │   │   │   │   ├── useTerminalManager.ts
│       │   │   │   │   └── useTerminalSession.ts
│       │   │   │   ├── Breadcrumbs.tsx
│       │   │   │   ├── CodeBlockRenderer.tsx
│       │   │   │   ├── CommandPalette.tsx
│       │   │   │   ├── FileExplorer.css
│       │   │   │   ├── FileExplorer.tsx
│       │   │   │   ├── GitPanel.tsx
│       │   │   │   ├── IDEActivityBar.tsx
│       │   │   │   ├── IDEBottomTerminal.tsx
│       │   │   │   ├── IDEPanelContainer.tsx
│       │   │   │   ├── IDETabList.tsx
│       │   │   │   ├── IDEToolbar.tsx
│       │   │   │   ├── IDEWorkspace.css
│       │   │   │   ├── IDEWorkspace.tsx
│       │   │   │   ├── InlineEditWidget.tsx
│       │   │   │   ├── SearchPanel.tsx
│       │   │   │   └── Terminal.tsx
│       │   │   ├── workspaces
│       │   │   │   └── WorkspaceRouter.tsx
│       │   │   ├── AIMESettings.tsx
│       │   │   ├── CollaborationPanel.tsx
│       │   │   ├── Editor.tsx
│       │   │   ├── ErrorBoundary.tsx
│       │   │   ├── FilesPanel.css
│       │   │   ├── FilesPanel.tsx
│       │   │   ├── MainContent.tsx
│       │   │   ├── MemberManagement.css
│       │   │   ├── MemberManagement.tsx
│       │   │   ├── ModelManager.tsx
│       │   │   ├── NotificationSystem.tsx
│       │   │   ├── PluginsPanel.tsx
│       │   │   ├── ResourceMonitor.tsx
│       │   │   ├── Sidebar.tsx
│       │   │   ├── StartupLayout.tsx
│       │   │   ├── TaskBoard.tsx
│       │   │   ├── Titlebar.tsx
│       │   │   ├── UnifiedAgentPanel.tsx
│       │   │   ├── UnifiedSettingsPanel.css
│       │   │   ├── UnifiedSettingsPanel.tsx
│       │   │   ├── UpdateButton.tsx
│       │   │   ├── UpdateModal.tsx
│       │   │   ├── VersionPanel.css
│       │   │   ├── VersionPanel.tsx
│       │   │   └── WelcomeScreen.tsx
│       │   ├── config
│       │   │   ├── api.ts
│       │   │   ├── constants.ts
│       │   │   ├── editorModes.tsx
│       │   │   └── index.ts
│       │   ├── hooks
│       │   │   ├── useAgent.ts
│       │   │   ├── useAI.ts
│       │   │   ├── useEncryption.tsx
│       │   │   ├── useGhostText.ts
│       │   │   ├── useP2P.ts
│       │   │   ├── usePermissions.ts
│       │   │   ├── useStorage.ts
│       │   │   └── useYjs.ts
│       │   ├── instructions
│       │   │   ├── flagshipModelInstructions.ts
│       │   │   ├── index.ts
│       │   │   ├── largeModelInstructions.ts
│       │   │   ├── smallModelInstructions.ts
│       │   │   └── types.ts
│       │   ├── services
│       │   │   ├── agentService.ts
│       │   │   ├── aiService.ts
│       │   │   ├── collabEngine.ts
│       │   │   ├── encryptedProvider.ts
│       │   │   ├── encryptionService.ts
│       │   │   ├── fileTransferService.ts
│       │   │   ├── hardwareService.ts
│       │   │   ├── ideAgentTools.ts
│       │   │   ├── ideCommands.ts
│       │   │   ├── integrationService.ts
│       │   │   ├── languageRuntimeService.ts
│       │   │   ├── memberSyncService.ts
│       │   │   ├── modelDownloadService.ts
│       │   │   ├── offlineLLMService.ts
│       │   │   ├── p2pService.ts
│       │   │   ├── peerAuthService.ts
│       │   │   ├── projectService.ts
│       │   │   ├── storageService.ts
│       │   │   ├── updateIntegrityService.ts
│       │   │   └── versionControlService.ts
│       │   ├── stores
│       │   │   ├── appStore.ts
│       │   │   ├── memberStore.ts
│       │   │   ├── modelStore.ts
│       │   │   ├── notificationStore.ts
│       │   │   └── updateStore.ts
│       │   ├── styles
│       │   │   └── window-animations.css
│       │   ├── types
│       │   │   ├── agentTypes.ts
│       │   │   ├── aime.ts
│       │   │   ├── debug.d.ts
│       │   │   ├── offlineModels.ts
│       │   │   ├── permissions.ts
│       │   │   ├── tasks.d.ts
│       │   │   └── workspaceCategories.tsx
│       │   ├── utils
│       │   │   ├── keybindings.ts
│       │   │   ├── logger.ts
│       │   │   ├── path-validator.ts
│       │   │   └── uuid.ts
│       │   ├── App.tsx
│       │   ├── index.css
│       │   ├── main.tsx
│       │   └── vite-env.d.ts
│       ├── .env.example
│       ├── .gitignore
│       ├── eslint-report.json
│       ├── index.html
│       ├── models_list.csv
│       ├── package.json
│       ├── postcss.config.cjs
│       ├── tailwind.config.cjs
│       ├── tsconfig.json
│       ├── tsconfig.node.json
│       └── vite.config.ts
├── packages
│   ├── crdt
│   │   ├── src
│   │   │   └── index.ts
│   │   └── package.json
│   ├── networking
│   │   ├── src
│   │   │   └── index.ts
│   │   └── package.json
│   └── shared
│       ├── src
│       │   └── index.ts
│       └── package.json
├── release_notes
│   ├── v1.0.1-beta-security.md
│   ├── v1.0.1-beta.md
│   └── v1.0.3-beta.md
├── scripts
│   └── generate-structure.js
├── .env.example
├── .eslintrc.json
├── .gitignore
├── applied_fixes.md
├── AUTO_UPDATE_GUIDE.md
├── bugs.md
├── CHANGELOG.md
├── CONTRIBUTING.md
├── CROSS_PLATFORM_BUILD.md
├── implement.md
├── LICENSE
├── OBFUSCATION.md
├── package-lock.json
├── package.json
├── PROJECT_STRUCTURE.md
├── README.md
├── SECURITY.md
└── snyk_report.json
```
