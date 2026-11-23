# Design rules

Read this before touching any UI. Each line is a decision, not a taste: a draft that breaks one
is not done. On the public pages (`apps/hub`) these rules win over older guidance in this folder.

## Never

- No gradients, no glow.
- No icons in rounded boxes.
- No all caps, no eyebrow labels above headings.
- No nested cards, no decorative pills.
- No bold. Regular (400) and medium (500) only.
- No numbered lists as decoration (01, 02, 03).
- No scroll-driven animation, no entrance animation, no stagger.

## Always

- Sentence case everywhere.
- Semantic tokens (`background`, `card`, `foreground`, `muted-foreground`, `border`, `accent`),
  never a hex or oklch value in a component.
- Surfaces stay neutral. The accent shows only on what is active, selected or changed.
- Shadows only on things that float (menus, dialogs, toasts).
- Motion under 300 ms, exits faster than entries, no bounce. Buttons press to 0.97. Keyboard
  focus moves instantly; only the pointer gets a transition.
- One type scale, two weights.

## Before saying done

- Look at it: 390 px wide, dark mode, and the whole page by keyboard.
- Then cut: the subtitle that repeats the heading, the badge nobody asked for, the second shadow,
  the icon beside every label.
