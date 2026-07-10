---
name: Snack Squad
description: A collectible snack-culture board built for fast logging, social ranking, and lightweight office competition.
---

<!-- SEED: resolve exact tokens through the approved Impeccable palette and high-fidelity mock gates before frontend implementation. -->

# Design System: Snack Squad

## Overview

**Creative North Star: "The Collectible Culture Board"**

Snack Squad should feel like a polished community board where recognizable snacks become collectible objects. The interface is used by employees at a desk under ordinary office lighting, often for a quick midday check-in, so its boldness must support fast scanning instead of becoming spectacle.

The approved direction combines Letterboxd-like social list energy, Panini-style ranking and ownership cues, and the legibility of grocery shelf labels. A near-black shell, committed cobalt fields, acid-yellow actions, strong product photography, and oversized rank numerals provide identity. Familiar controls, restrained motion, and consistent task surfaces keep it trustworthy.

**Key Characteristics:**

- Asymmetric product layout rather than interchangeable dashboard cards.
- Realistic snack/package photography as recognition and identity.
- Dense horizontal activity strips, a strong Top 10 rail, and compact contest surfaces.
- Persistent desktop navigation and genuinely recomposed mobile bottom navigation.
- Playful, competitive, and polished without becoming childish or aggressive.

## Colors

The palette is committed and high-contrast. Exact values remain unresolved until the dedicated Impeccable palette artifact is approved.

### Primary

- **Squad Cobalt** (`[to be resolved during implementation]`): Carries major active surfaces, search emphasis, navigation selection, and bracket moments.

### Secondary

- **Action Yellow** (`[to be resolved during implementation]`): Reserved for primary actions, confirmed votes, and rare high-value feedback.

### Tertiary

- **Competition Red** (`[to be resolved during implementation]`): Used sparingly for active contest tension, errors, and meaningful changes—not decoration.

### Neutral

- **Counter Black** (`[to be resolved during implementation]`): The primary shell and visual anchor; use a softened near-black rather than featureless pure black.
- **Label White** (`[to be resolved during implementation]`): Primary text and bright task surfaces.
- **Shelf Gray** (`[to be resolved during implementation]`): Dividers, secondary surfaces, inactive controls, and supporting text.

**The Earned Accent Rule.** Cobalt identifies structure, yellow identifies action, and red identifies consequence. Never use all three merely to decorate one component.

**The Office-Light Rule.** Every surface must remain legible in a bright workplace. Dark atmosphere never excuses low-contrast gray text.

## Typography

**Display Font:** Single contemporary sans family (`[font family to be chosen during implementation]`)
**Body Font:** Same family (`[font family to be chosen during implementation]`)
**Rank Font:** Condensed or tabular companion for rankings only (`[font family to be chosen during implementation]`)

**Character:** Sturdy, direct, and social. Ordinary interface labels remain calm and highly readable; compression and oversized weight are reserved for rankings and snack identity.

### Hierarchy

- **Display:** Used only for a snack search prompt, contest winner, or equivalent rare focal moment; never for routine labels.
- **Headline:** Screen and major-region titles with a compact fixed scale.
- **Title:** Snack names, matchup names, and report items.
- **Body:** Activity metadata, profile summaries, and explanatory copy with a maximum reading measure of 65-75 characters.
- **Label:** Navigation, timestamps, counts, and control text; sentence case by default.

**The Rank Voice Rule.** Condensed, oversized numerals belong to rankings and scores only. Applying that voice to every heading turns the product into sports-betting theater.

## Elevation

The system is flat by default. Depth comes from tonal fields, strong dividers, image crops, and content overlap—not ambient glass or floating containers. Popovers and transient menus may use one compact shadow after the exact palette is established.

**The Flat Board Rule.** Activity rows and ranking rails sit in one coherent plane. Shadows appear only when an element genuinely moves above that plane.

## Components

Canonical component tokens will be defined after the approved palette and high-fidelity north-star screen are implemented. The direction probe establishes topology and character, not final component anatomy.

Do not treat the probe's downvote buttons, comment counts, invented clubs, three-item mobile navigation, or sports-score styling as product components. Snack Squad is upvote-only, has no comments, and mobile navigation must include Home, Log, Contests, and Profile.

## Do's and Don'ts

### Do:

- **Do** make logging a snack the clearest action on every relevant screen.
- **Do** use realistic snack photography in deliberate rectangular crops or clean product cutouts.
- **Do** use asymmetric hierarchy: activity board, Top 10, and contest state should not look like identical modules.
- **Do** preserve familiar product controls, visible keyboard focus, touch-friendly targets, and color-independent state cues.
- **Do** keep routine state transitions responsive, interruptible, and below 300 ms, with reduced-motion alternatives.
- **Do** treat `docs/design/collectible-culture-direction.png` as the structural north star while keeping the final UI semantic and responsive.

### Don't:

- **Don't** make Snack Squad resemble a generic SaaS analytics dashboard.
- **Don't** make it resemble a childish candy-store website or a noisy sports-betting interface.
- **Don't** reproduce template-driven AI markers: interchangeable card grids, gradient text, glass panels, decorative metrics, excessive pills, giant rounded containers, or soft wide shadows.
- **Don't** use a purple-blue gradient, beige editorial background, tiny uppercase eyebrow above every section, or numbered section scaffolding.
- **Don't** invent comments, downvotes, ratings, analytics charts, clubs, or other functionality because it appeared in a generated mock.
- **Don't** use package photography as a marketing hero when the user is trying to complete a task.
- **Don't** animate keyboard actions, routine navigation, or frequent list interactions for decoration.
