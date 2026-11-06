# Workflow and language review

On November 6, 2026, I compared the existing app with tournament tools that solve
the same organizer tasks. The scope is creation, scoring, sharing and help.
The existing visual identity, competition rules and local storage model remain.

## References

| Product and source | Relevant pattern | Decision for TournaStudio |
| --- | --- | --- |
| [Bracket HQ maker](https://brackethq.com/maker/) | Format-specific controls explain group counts, advancement and round-robin meetings | Show only settings that affect the selected format and explain the resulting structure |
| [Challonge participant management](https://kb.challonge.com/en/article/participant-management-1m6ooqe/) | Participant setup explains ordering and seeding | Explain list-order seeding and catch duplicate names before the final creation step |
| [Tournify score entry](https://help.tournifyapp.com/en/articles/9144326-enter-scores) | A direct scoring action leads to the result form | Use Enter result, Save result and Save changes; keep required score inputs visible |
| [Toornament first tournament guide](https://help.toornament.com/starter/your-first-tournament) | Setup follows organizer tasks and exposes a public-view link | Give sharing one starting point and make its output easy to find |

These are observations from official public pages and documentation, not claims
from an account-based trial. The design decisions are my interpretation.
Hosted public pages and remote scorekeeper accounts cannot be copied into a
static app. TournaStudio shares independent copies and explains that limitation.

## Priorities established before implementation

| Priority | Location | Observed problem | Improvement |
| --- | --- | --- | --- |
| High | CreateFlow | A rounds input appears for formats where it has no effect; hidden invalid values can survive format changes | Show applicable settings and use valid defaults for unused options |
| High | CreateFlow | Duplicate names are rejected only after reaching the final step | Validate names while participants are being entered |
| High | Workspace Matches | Stage selector does not filter the list; Next round appears for static brackets | Filter actual matches and offer round generation only where supported |
| High | MatchControl | Editing scores retains the old winner selection and can produce a needless error | Recalculate ordinary played results while keeping explicit exceptional decisions |
| High | MatchControl | Required set entry is hidden among referee notes | Place scoring inputs before optional administration |
| High | ShareCenter | Repeated transfer controls compete; copy feedback does not identify which output was copied | Lead with a guided action, group advanced options and focus the generated output |
| Medium | ImportCenter | Fork with new identity does not explain what a recipient gets | Use Save as new tournament and explain update compatibility |
| Medium | Home and help | Generic labels and technical descriptions obscure the next step | Use task names, destination guidance and a short workflow guide |
| Medium | Mobile sidebar | Opening Help or Import leaves two active dialog regions | Close the drawer before opening the selected dialog and restore focus on exit |

## Language rules

Use a verb and its object for commands. Distinguish generating content from
copying it, saving a result from downloading a backup, and reviewing an import
from replacing saved work. Keep advanced terminology beside an explanation.
In Persian, importing data is not signing in, and a tournament snapshot is a
copy of tournament data, not a picture. English and Persian describe the same
effect. Keep technical names in file formats and code where compatibility needs
them.

## Verification

The independent second pass inspected Match, Share and Help in English and
Persian at 390, 768 and 1440 pixels, plus generated update instructions. It found
two further copy problems: public JSON looked like a complete backup, and
advanced key-verification explanations appeared in the ordinary sharing flow.
The export now says Public tournament JSON, and technical caveats sit inside
More sharing options. No engine, cryptography or stored-data format changed.

Before and after captures and test logs are retained in the ignored
`.local/ux-2026-11-06/` folder. Final check results and publication details are
recorded in `RELEASE_STATUS.md` and the GitHub release notes. Visual and automated
checks do not replace usability sessions with tournament organizers.
