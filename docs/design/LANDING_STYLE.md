# Landing style

How the landing's home page is composed and how it moves (ADR-148). Its colours, type and shapes
are the app's own, read from the shared tokens like every other page: nothing here names a
colour.

## Where it comes from

On 2026-11-23 the owner supplied a style guide measured from another health app's public site.
A first build followed it to the letter (ADR-147) and read as that product's page, not
SharpIt's. What is kept from it is what any landing may borrow: composition and motion. What was
dropped is what made it someone else's: its palette, its weights, its gradient.

The test for any future borrowing: with the logo hidden, the page must still read as SharpIt.

## Borrow the mechanics, never the skin

| May be borrowed from a reference              | Is always ours                                      |
| --------------------------------------------- | --------------------------------------------------- |
| Little text; the product shown, not described | The palette: ink, lime on data, canvas, white cards |
| A hero that contains the device               | The type: the app's faces at regular and medium     |
| Large cards: a visual, a name, one sentence   | The shapes: capsules, hairlines, thin rings         |
| Motion tied to the scroll                     | The widgets: verdict, repaired week, arbitration    |
| A generous rhythm between sections            | The voice: « tu », a coach that says when it doubts |

## Composition

- **Floating capsule navigation**, over the page from the hero to the footer.
- **Hero**: a full-screen rounded field of ink (`landing-night`) holding the promise, the
  download pill and the app's light screen, with product facts floating beside it. The field,
  not a card border, contains the composition; the phone runs off its foot.
- **Integrations** as one row of marks, no enclosing cards.
- **A statement**, large, alone on the page.
- **Feature cards**: white on the canvas, 32 px corners, no border, no shadow; a widget, a name,
  one sentence.
- **A closing block** of ink, then the footer.

## Motion

GSAP and ScrollTrigger, in `landing-motion.tsx`. The landing is the one page where
`DESIGN_RULES.md`'s bans on pins, parallax and scroll-revealed text do not apply.

- **On load**: the field opens, the headline rises line by line from behind a mask, the phone
  lands, the facts settle, the navigation drops in.
- **Scrubbed to the scroll**, so nothing runs ahead of the reader: the hero's depth (copy, phone
  and each fact at its own speed), the statement coming to ink word by word, the track of cards
  pinned and travelling sideways on a wide screen, the closing block growing to the page's
  width.
- **Once, on entry**: headlines, cards, diagrams drawing, counts running up.
- No overshoot. Under Reduce Motion none of it runs and the page reads as rendered.

## Not shown until it exists

Ratings, awards, member stories: SharpIt is in beta, and none is invented.
