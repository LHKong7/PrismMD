# New Reading/Writing Themes + Inline Agent Collaboration

## Background / Context

1. The existing 8 themes leaned heavily toward coding aesthetics (Nord, Dracula, Solarized). Users wanted more themes suited for prose reading and writing — warm, comfortable palettes for long sessions.
2. The editor's AI integration was limited to a single "Rewrite" button on text selection. Users wanted richer inline AI collaboration: multiple actions, custom instructions, and keyboard-driven workflows.

## Design Decisions

### Themes
- Added 4 new themes: **Parchment** (warm ivory), **Sepia** (e-reader cream), **Rose** (soft pink), **Campfire** (warm dark). This brings the total to 12 themes (7 light, 5 dark), addressing the light-theme deficit.
- Campfire fills the gap as the only warm-toned dark theme (all others — Dark, Nord, Solarized Dark, Dracula — are cool-toned).
- All semantic colors satisfy WCAG AA contrast (4.5:1 for light themes, lighter foregrounds for dark themes against dark backgrounds).

### Inline Agent Collaboration
- Chose to expand `EditorAIBubble.tsx` into a multi-action toolbar rather than creating a separate component, keeping the codebase simpler.
- No new Zustand store — the component manages its own `phase/result/error` state since the interaction is self-contained.
- `Cmd/Ctrl+K` keybinding added directly in CM6 keymap to trigger the AI bubble with focus on the custom instruction input.
- Tone sub-options rendered as horizontal chips to avoid dropdown complexity inside a portal.

## Changes

### `src/lib/theme/themes.ts`
- Appended 4 `ThemeDefinition` objects: Parchment (line ~334), Sepia (~371), Rose (~408), Campfire (~445)

### `src/components/editor/EditorAIBubble.tsx`
- Complete rewrite from single-button to multi-action toolbar
- 5 quick-action buttons: Rewrite, Shorten, Expand, Fix Grammar, Tone
- Tone expands into 4 sub-options: Formal, Casual, Academic, Creative
- Custom instruction input with Enter-to-submit
- Added Retry button in done/error phases
- Each action maps to a specific system prompt via `SYSTEM_PROMPTS` record

### `src/components/editor/CodeMirrorEditor.tsx`
- Added `focusCustomInput` state
- Added `Mod-k` keybinding to CM6 keymap that triggers AI bubble with custom input focused
- Passes `focusCustomInput` prop to `EditorAIBubble`

### `src/i18n/locales/en.json` + `zh.json`
- Added i18n keys: `editorAI.shorten`, `editorAI.expand`, `editorAI.fixGrammar`, `editorAI.changeTone`, 4 tone variants, `editorAI.customPlaceholder`, `editorAI.processing`, `editorAI.retry`
- Generalized `editorAI.rewrite` from "AI Rewrite" to "Rewrite" since it's now one of several actions

## Verification

1. `npm run typecheck` — passes with no errors
2. **Themes**: Settings > Theme > select Parchment / Sepia / Rose / Campfire — colors render correctly
3. **Inline AI**: Edit mode > select text > toolbar appears with 5 actions + custom input > click any action > result appears > Accept/Reject/Retry work > `Cmd+K` focuses custom input > Tone sub-options expand/collapse
