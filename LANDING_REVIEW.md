# First-visit design review

November 6, 2026

I wanted the first page to show what running a tournament feels like before
asking someone to fill in a form. This pass changes the welcome experience for
an empty local library. Existing tournaments, including items in trash, keep the
working library view.

## What the independent reviews found

| Finding | Location | Decision | Priority |
| --- | --- | --- | --- |
| Dashboard navigation and repeated setup headings delayed the introduction | App shell and empty Home | Give first-time visitors a full-width masthead and one main invitation | High |
| A numbered instruction panel explained setup without showing its result | Former Home hero | Replace it with a working four-team example bracket | High |
| The small template illustrations hid the strongest original artwork | Home templates | Use larger game-specific programs with actual setup details | High |
| Too much equal-weight explanatory copy made the page feel procedural | Hero and template section | Separate the invitation, example, starter choices and ownership explanation | Medium |
| Desktop posters made the phone page too long | New template covers, second review | Use compact landscape programs on phones | Medium |

The old page was functional. The first four findings are design judgments, not
claims about measured conversion rates. Contrast, reversed numeric direction and
keyboard focus findings were reproducible accessibility issues in the initial
new implementation and were corrected before publication.

## Implemented direction

The page borrows from printed matchday programs: paper, forest green, thin rules
and tournament-specific artwork. A restrained serif phrase gives the English
headline a different rhythm. Persian keeps Vazirmatn and its own line spacing.
The existing product mark, activity scenes and application colors remain.

The example uses the same elimination and scoring engine as real tournaments.
It starts with four fictional teams, advances each selected winner, announces
the champion and resets. Its state remains in memory. Changing language keeps
the chosen results. The full scoring module loads only after interaction.

Football, Esports and Gol Ya Pooch covers launch the existing creation flow with
editable settings. There are no invented user counts, endorsements or event
photos. Copy explains local storage, backups and independent shared copies.
The welcome page does not replace the library for returning organizers.
The first library read must finish before the app chooses between these views.
A slow read shows loading; a failed read offers retry instead of an empty-library
message. Two storage-fault regressions cover those transitions.

## Review and verification

Three reviewers independently covered visual direction, the creation path and
responsive accessibility. Their second review inspected the actual revised page
and led to shorter phone template covers, more room for Persian headings, darker
sample text and explicit left-to-right score and progress numbers. Keyboard
focus now follows results and reset; Try a match brings its focused control into
view even on a 320 by 568 reduced-motion screen.

Screenshots were inspected in English and Persian at widths of 320, 390, 768 and
1440 pixels. The welcome suite has 11 cases covering those layouts, keyboard
commands, real template settings, language switching, returning libraries and
trash recovery. Three example tests cover progression, reset and language state;
three model tests check engine behavior and isolation. The browser cases passed
on Chromium, Firefox and WebKit. See [RELEASE_STATUS.md](RELEASE_STATUS.md) for
the final production-bundle checks and publication details.

The second critique found no remaining overlap or layout blocker. The example
stays vertically stacked on small phones to keep participant names readable.
Adding more ornament was not judged useful. Device-level testing and sessions
with tournament organizers remain valuable; this review does not establish a
conversion improvement or certify accessibility.
