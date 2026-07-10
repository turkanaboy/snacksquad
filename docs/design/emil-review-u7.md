# U7 Emil interaction review

| Before | After | Why |
| --- | --- | --- |
| Mobile users had to infer that the four-round bracket scrolls horizontally. | Added compact, native round jump links above the mobile bracket. | Navigation is explicit, keyboard-accessible, and uses interruptible native scrolling without decorative motion. |
| A replaced vote could look like a second submission until the refreshed totals arrived. | The selected entry uses `aria-pressed`, a persistent cobalt edge, and refreshed matchup totals after every mutation. | The control communicates current state and preserves the bracket's one-vote replacement model. |
| Long snack names could compete with vote totals inside narrow matchup rows. | Names truncate on one line while the full accessible button name remains available to assistive technology. | Layout stays stable without discarding the semantic label. |
| Bracket interactions could have inherited hover behavior on touch devices. | Hover feedback is restricted to fine pointers; mobile relies on focus, pressed state, and the 58px row target. | Touch interactions avoid sticky hover and retain clear, reachable feedback. |
| A contest transition could invite decorative page or bracket animation. | State changes remain immediate; the existing reduced-motion rule covers the small press transition. | The interface feels responsive and avoids motion that does not explain state. |

All material findings from this review were resolved in U7.
