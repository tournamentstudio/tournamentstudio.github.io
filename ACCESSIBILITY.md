# Accessibility in TournaStudio

I target WCAG 2.2 AA for the organizer and spectator interfaces. The checks below describe the work that can be repeated locally. They are not a certification or a claim that every assistive technology has been tested.

## Supported interaction patterns

- Forms use visible labels, semantic inputs, and readable error messages. Errors are announced through an alert region.
- Dialogs receive focus, contain keyboard focus while open, close with Escape, and return focus to the opener when it remains available. Controls inside closed disclosure sections are excluded from the focus cycle.
- Stage connections, schedule changes, seeding, and scene ordering have controls that do not require dragging.
- Brackets have keyboard controls and match buttons. Standings and wide tables remain scrollable inside their own region at narrow widths.
- Persian uses right-to-left layout, local fonts, translated controls, and bidirectional isolation for mixed-script names. Long labels can wrap.
- Presentation mode has keyboard controls, an exit control, and focus handling. Reduced-motion preferences are respected by the interface and can be configured for tournament displays.
- Player statistics use labeled forms and explicit status text. Review warnings explain why observations are excluded from totals. Private-data export is a separate action with a visible explanation.

## Local automated checks

Run the full browser suite after building:

```sh
npm run build
npx playwright test
```

Playwright covers Chromium, Firefox, and WebKit. The accessibility assertions use axe-core with `wcag2a`, `wcag2aa`, `wcag21aa`, and `wcag22aa` tags. The result describes the rendered state that was examined, not every possible combination of custom theme, content, and browser setting.

Relevant checks include:

- `tests/e2e/i18n-accessibility.spec.ts`: Persian form errors, modal focus cycles, disclosure sections, focus restoration, saved language, and operator sections.
- `tests/e2e/player-statistics.spec.ts`: player observations, correction history, private export boundaries, Persian at 320 CSS pixels, keyboard opening, and dialog checks.
- `tests/e2e/custom-fields.spec.ts`: long Persian labels, number validation, and narrow layouts.
- Other browser tests cover presentation controls, creation flow focus, schedule controls, weighted scoring, and export dialogs. Search `tests/e2e` for `AxeBuilder` and `toBeFocused` to see the current scope.

GitHub CI is disabled. Tests run locally before a release, and the release report records actual command results. A passing axe scan cannot establish that names, instructions, or focus order are useful in every workflow.

## Manual review checklist

For a release, review the following with representative long English and Persian names:

1. Use only Tab, Shift+Tab, Enter, Space, arrow keys, and Escape to create a tournament, enter a result, open a presentation, and import a backup.
2. Confirm focus is visible, follows a sensible order, stays within an open dialog, and returns to a useful place after closing it. Repeat with disclosure sections open and closed.
3. At 320 CSS pixels, inspect forms and dialogs for clipped controls or page-wide horizontal scrolling. Wide data tables may scroll within their own labeled region.
4. Check text resizing and browser zoom at 200% and 400%. Check that controls and explanatory text remain available without overlapping.
5. With reduced motion enabled, check that essential state changes remain understandable and do not depend on animation.
6. Review contrast for the selected theme and any custom colors. A user-created palette can reduce contrast even when the default palette passes a check.
7. With a screen reader, check headings, landmarks, field labels, validation announcements, live save feedback, table headers, and modal announcements in both languages.

## Checks requiring human assistive-device review

A complete NVDA, JAWS, VoiceOver, or TalkBack reading-order and speech-quality audit has not been completed. Switch-control, braille-display, and speech-input testing has not been completed. Custom themes, imported artwork, unusual font settings, and every possible tournament size are not independently certified for contrast or reflow.

Report an accessibility issue with the screen, language, browser, assistive technology, and steps that reproduce it. Avoid attaching private tournament data. A small anonymized example is enough for most layout and keyboard issues.
