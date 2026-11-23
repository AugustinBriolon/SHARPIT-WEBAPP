# Landing style

The style guide the landing's home page is built to (ADR-147). It was supplied by the owner on
2026-11-23 as a reference measured from a health app's public site, and is the first authority
for the landing's art direction: colours, type, spacing, composition. It binds `apps/hub`'s home
page only, through the `landing-style` class in `apps/hub/src/app/globals.css`; the rest of the
web keeps to [`DESIGN_RULES.md`](./DESIGN_RULES.md).

A bright white page, near-black headlines, mist-blue cards, real device imagery. Colour is held
back in the shell; the data hues appear only inside product visuals.

## Colours

| Name           | Value                               | Role                                          |
| -------------- | ----------------------------------- | --------------------------------------------- |
| Paper white    | `#ffffff`                           | Page, navigation, footer                      |
| Charcoal       | `#1f2025`                           | Download controls, dark blocks                |
| Ink            | `#222326`                           | Headings and primary text                     |
| Cloud card     | `#ebf0f8`                           | Feature cards; text on charcoal               |
| Body gray      | `#747679`                           | Body copy, quiet links, helper text           |
| Recovery green | `#31ce01`                           | Data visuals only                             |
| Metric blue    | `#415eee`                           | Data visuals only                             |
| Sleep lilac    | `#b9a6ff`                           | Data visuals only                             |
| Coral          | `#ffab94`                           | Data visuals only                             |
| Hero sky       | `linear-gradient(#d2e5ff, #fff9ee)` | The hero's field, cool daylight to warm paper |

## Type

System stack first (`-apple-system`, then Inter). Three weights: 400, 500, 600.

| Role          | Weight | Size | Line height | Tracking |
| ------------- | ------ | ---- | ----------- | -------- |
| Hero display  | 600    | 80   | 1           | -0.03em  |
| Display       | 600    | 64   | 1           | -0.03em  |
| Card heading  | 600    | 40   | 1           | -0.03em  |
| Section label | 600    | 24   | 0.9         | -0.01em  |
| Body          | 400    | 24   | 1.3         | 0        |
| Nav, actions  | 500    | 16   | 1.4         | 0        |
| Caption       | 400    | 12   | 1.1         | 0        |

Sizes are the desktop values; the page clamps them down on a narrow screen.

## Space and shape

- Base unit 8 px. Sections sit 80 px apart; a card pads 32 px; elements sit 16 px apart.
- Cards 24 to 32 px corners. Images 16 to 24 px. Buttons and pills fully round. Navigation 32 px.
- Cards have no border and no shadow. Two shadows exist: `rgb(0 0 0 / 25%) 0 0 16px -8px` under
  floating imagery, `rgb(0 0 0 / 15%) 0 2px 16px 0` under a floating control.

## Components

- **Floating capsule navigation.** A white bar, 32 px corners, backdrop blur, over the page.
- **Charcoal download pill.** Charcoal fill, cloud label, short and capsule-shaped.
- **Daylight hero.** The hero sky as a tall rounded field that contains the headline and the
  device; the field, not a card border, holds the composition.
- **Partner row.** A 24 px heading over one row of marks, no enclosing cards.
- **Cloud feature card.** Cloud surface, a product visual, a 40 px name, 24 px body gray copy.

## Do

- White canvas, cloud cards for large feature surfaces.
- Display headings in ink at weight 600 with -0.03em tracking.
- Keep the data hues to product visuals.

## Do not

- No saturated hue as a page background or on a conversion button.
- No heading above weight 600, none without its tracking.
- No square button. No border or heavy shadow on a card.
- No stack of dense sections where the 80 px rhythm should be.

## What the landing does not take from the guide

- **Ratings, awards, member stories.** SharpIt is in beta: there are none to show, and none is
  invented.
- **A watch render.** The app's real screen stands alone; product facts float beside it instead.
- **Partner wordmarks.** The integrations' own marks are used, with their names.
