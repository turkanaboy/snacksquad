---
name: Snack Squad
description: A collectible snack-culture board built for fast logging, social ranking, and lightweight office competition.
---

<!-- Palette and high-fidelity Home north star approved 2026-07-10. -->

# Design System: Snack Squad

## Overview

**Creative North Star: "The Collectible Culture Board"**

Snack Squad should feel like a polished community board where recognizable snacks become collectible objects. The interface is used by employees at a desk under ordinary office lighting, often for a quick midday check-in, so its boldness must support fast scanning instead of becoming spectacle.

The approved direction combines Letterboxd-like social list energy, Panini-style ranking and ownership cues, and the legibility of grocery shelf labels. A near-black shell, committed cobalt fields, acid-yellow actions, strong product photography, and oversized rank numerals provide identity. Familiar controls, restrained motion, and consistent task surfaces keep it trustworthy.

`docs/design/snack-squad-home-north-star.png` is the approved desktop/mobile build target. It is authoritative for composition and component character; the written product requirements remain authoritative for behavior and content.

**Key Characteristics:**

- Asymmetric product layout rather than interchangeable dashboard cards.
- Realistic snack/package photography as recognition and identity.
- Dense horizontal activity strips, a strong Top 10 rail, and compact contest surfaces.
- Persistent desktop navigation and genuinely recomposed mobile bottom navigation.
- Playful, competitive, and polished without becoming childish or aggressive.

## Colors

The palette is committed and high-contrast. `docs/design/snack-squad-palette.png` is the approved palette artifact.

### Primary

- **Squad Cobalt** (`#1647E8`): Carries major active surfaces, search emphasis, navigation selection, and bracket moments.

### Secondary

- **Action Yellow** (`#FFE500`): Reserved for primary actions, confirmed votes, and rare high-value feedback.

### Tertiary

- **Competition Red** (`#FF4D45`): Used sparingly for active contest tension, errors, and meaningful changes—not decoration.

### Neutral

- **Counter Black** (`#0B0D0F`): The primary shell and visual anchor.
- **Board Black** (`#15191E`): Task surfaces that need separation from the shell without floating-card effects.
- **Label White** (`#F4F6F2`): Primary text and bright task surfaces.
- **Shelf Gray** (`#343A40`): Dividers and inactive controls.
- **Receipt Gray** (`#A9B0B7`): Secondary text.

**The Earned Accent Rule.** Cobalt identifies structure, yellow identifies action, and red identifies consequence. Never use all three merely to decorate one component.

**The Office-Light Rule.** Every surface must remain legible in a bright workplace. Dark atmosphere never excuses low-contrast gray text.

Approved WCAG contrast pairings: Label White on Counter Black (17.90:1), Label White on Squad Cobalt (6.23:1), Counter Black on Action Yellow (15.26:1), Counter Black on Competition Red (5.93:1), and Receipt Gray on Counter Black (8.88:1).

## Typography

**Display Font:** `Arial Narrow`, `Roboto Condensed`, `Segoe UI`, sans-serif
**Body Font:** `Inter`, `Segoe UI`, Arial, sans-serif
**Rank Font:** `Arial Narrow`, `Roboto Condensed`, `Segoe UI`, sans-serif with tabular numerals

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

The component system is deliberately small:

- **Geometry:** Square fields and rows; controls may use a restrained 4px radius. No container uses a decorative pill or a radius above 8px.
- **Rules:** One-pixel Shelf Gray dividers establish the board plane. Major selected regions use a 3px cobalt or yellow edge marker in addition to color.
- **Controls:** Primary actions are at least 48px high; all touch targets are at least 44px. Buttons use text plus an icon only when the icon improves recognition.
- **Activity row:** Product image, logger metadata, snack identity, and one upvote action. Desktop rows are dense and horizontal; mobile rows preserve image recognition while reducing metadata.
- **Leaderboard row:** Rank, product image, snack name, and aggregate upvotes. Oversized condensed numerals are exclusive to rank and score.
- **Search:** Cobalt field with a visible label, search icon, live listbox, keyboard selection, empty state, and manual-entry route.
- **Status:** Loading, empty, error, locked, selected, and sudden-death states always pair color with text or iconography.

### Responsive composition

- **Desktop (960px and above):** Persistent 176px navigation rail, fluid activity column, and 280-320px Top 10 rail. Contest state anchors below activity rather than becoming another equal card.
- **Tablet (760-959px):** Navigation rail narrows; Top 10 becomes a horizontal strip below activity.
- **Mobile (below 760px):** Four-item bottom navigation (Home, Log, Contests, Profile), compact header, stacked activity, horizontal Top 10 preview, and no separate Fantasy navigation item.

### Imagery

Use HTTPS package photography or clean product imagery with `object-fit: contain`. Images are recognition aids, never decorative heroes. Failed images fall back to a high-contrast initial tile without changing row height.

### Motion

Routine feedback uses explicit 120-200ms opacity, color, border-color, or transform transitions with ease-out. Pressed controls may scale to 0.98. Popovers originate from their trigger. Navigation and keyboard actions do not animate, and `prefers-reduced-motion` removes nonessential transitions.

Do not treat the probe's downvote buttons, comment counts, invented clubs, three-item mobile navigation, or sports-score styling as product components. Snack Squad is upvote-only, has no comments, and mobile navigation must include Home, Log, Contests, and Profile.

## Do's and Don'ts

### Do:

- **Do** make logging a snack the clearest action on every relevant screen.
- **Do** use realistic snack photography in deliberate rectangular crops or clean product cutouts.
- **Do** use asymmetric hierarchy: activity board, Top 10, and contest state should not look like identical modules.
- **Do** preserve familiar product controls, visible keyboard focus, touch-friendly targets, and color-independent state cues.
- **Do** keep routine state transitions responsive, interruptible, and below 300 ms, with reduced-motion alternatives.
- **Do** treat `docs/design/snack-squad-home-north-star.png` as the approved implementation north star while keeping the final UI semantic and responsive.

### Don't:

- **Don't** make Snack Squad resemble a generic SaaS analytics dashboard.
- **Don't** make it resemble a childish candy-store website or a noisy sports-betting interface.
- **Don't** reproduce template-driven AI markers: interchangeable card grids, gradient text, glass panels, decorative metrics, excessive pills, giant rounded containers, or soft wide shadows.
- **Don't** use a purple-blue gradient, beige editorial background, tiny uppercase eyebrow above every section, or numbered section scaffolding.
- **Don't** invent comments, downvotes, ratings, analytics charts, clubs, or other functionality because it appeared in a generated mock.
- **Don't** use package photography as a marketing hero when the user is trying to complete a task.
- **Don't** animate keyboard actions, routine navigation, or frequent list interactions for decoration.
