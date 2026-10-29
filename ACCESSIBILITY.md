# Accessibility in TournaStudio

I target WCAG 2.2 AA for the organizer and spectator interfaces. The checks below describe the work that can be repeated locally. They are not a certification or a claim that every assistive technology has been tested.

## Supported interaction patterns

- Forms use visible labels, semantic inputs, and readable error messages. Errors are announced through an alert region.
- Dialogs receive focus, contain keyboard focus while open, close with Escape, and return focus to the opener when it remains available. Controls inside closed disclosure sections are excluded from the focus cycle.
- Mobile navigation uses a named modal drawer, an expanded-state trigger and an inert background. Escape closes it and restores focus. Its contents scroll at small viewport heights.
- Main routes update the document title and focus the main region. Current routes and sections expose their state; workspace section changes and confirmed saves have status announcements.
- Stage connections, schedule changes, seeding, and scene ordering have controls that do not require dragging.
- Brackets have keyboard controls and match buttons. Standings and wide tables remain scrollable inside their own region at narrow widths.
- Persian uses right-to-left layout, local fonts, translated controls, and bidirectional isolation for mixed-script names. Long labels can wrap.
- Presentation mode has keyboard controls, an exit control, and focus handling. Reduced-motion preferences are respected by the interface and can be configured for tournament displays.
- Spectator scenes and public score changes have polite, atomic announcements. Timer ticks do not repeat announcements every second. The announcement text uses the same public projection as the display.
- Player statistics use labeled forms and explicit status text. Review warnings explain why observations are excluded from totals. Private-data export is a separate action with a visible explanation.

## Local automated checks

Run the full browser suite after building:

```sh
npm run build
npx playwright test
```

Playwright covers Chromium, Firefox, and WebKit. The accessibility assertions use axe-core with `wcag2a`, `wcag2aa`, `wcag21aa`, and `wcag22aa` tags. The result describes the rendered state that was examined, not every possible combination of custom theme, content, and browser setting.

Relevant checks include:

- `tests/e2e/event-rehearsal.spec.ts`: 320-pixel touch and keyboard use, long mixed-script Gol hand logs, language changes, focus restoration and referee-dialog AA checks. Its event case also verifies a same-profile projector view during offline scoring.
- `tests/e2e/startup-loading.spec.ts`: canceling a loading import dialog, restoring keyboard focus and recovering a received code when the import screen cannot load.
- `tests/e2e/assistive-navigation.spec.ts`: English/Persian mobile focus containment, inert backgrounds, Escape/restoration, current page semantics, route titles, section names, keyboard scrolling, public score announcements, reduced motion and forced colors. Reflow checks use 640 by 360 and 320 by 180 CSS-pixel viewports, equivalent to the available layout area at 200% and 400% of a 1280 by 720 baseline.
- `tests/e2e/fide-dutch.spec.ts`: translated Swiss policy errors and 320-pixel Persian controls.
- `tests/e2e/persian-audit.spec.ts`: Persian half-space card names wrap within narrow fieldsets, and mobile roster names have a full row. Both workflows retain edits after reload.
- `tests/e2e/language-switch-layout.spec.ts`: live English/Persian switching, reload, manual bracket orientation, measured SVG text bounds at the largest supported theme font size, unchanged saved data and standalone/printed export alignment.
- `tests/e2e/mixed-script-fields.spec.ts`: creation drafts, participant and roster names, settings and stage names keep their values and content-based alignment when the interface language changes at desktop and mobile widths.
- `tests/e2e/presentation-localization.spec.ts`: translated schedule labels, Persian countdown digits, RTL scene controls, nested bracket/table keyboard handling and public broadcast score announcements.
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

Browser accessibility-tree assertions, keyboard interaction and visual reflow checks establish the implemented behavior described above. They do not establish the quality of a particular screen reader's spoken Persian or replace human device testing. No complete NVDA, JAWS, VoiceOver, TalkBack, switch-control, braille-display or speech-input audit is claimed. Custom themes, imported artwork, unusual font settings, and every possible tournament size are not independently certified for contrast or reflow. Viewport reflow tests are not a claim that a person tested every browser's zoom UI.

Report an accessibility issue with the screen, language, browser, assistive technology, and steps that reproduce it. Avoid attaching private tournament data. A small anonymized example is enough for most layout and keyboard issues.
