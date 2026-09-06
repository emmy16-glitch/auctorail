# Auctorail responsive UI and browser QA notes

This document records the responsive-layout rules for the current redesigned Auctorail web product.

The UI is not the authorization security boundary, but poor responsive behavior can make technical results unreadable, hide important decision states, or make the product look broken during a demo.

## Supported presentation targets

The product should remain readable and usable at common widths including:

```text
~390px   mobile
~768px   tablet / narrow desktop
~1024px  desktop transition
~1440px  full desktop
```

The automated QA flow exercises multiple viewports rather than relying only on one desktop screenshot.

## Important redesigned surfaces

Responsive behavior should be checked on:

- Home;
- Watch Demo;
- Checking / Live;
- Execution/result states;
- Permissions;
- Activity;
- Verify;
- Content Trust;
- Security Lab;
- SDK/Docs.

## No horizontal overflow

A key release requirement is:

```text
page scrollWidth <= viewport width
```

Long technical values such as addresses, hashes, transaction IDs, evidence IDs and code samples must not force the entire page wider than the viewport.

## Grid collapse rule

When a desktop CSS grid collapses to one column, prefer:

```css
grid-template-columns: minmax(0, 1fr);
```

rather than relying only on:

```css
grid-template-columns: 1fr;
```

Why:

Grid items can have intrinsic minimum content widths. A long hash or code line can make a nominal `1fr` track wider than the mobile container.

Also use `min-width: 0` on grid/flex children that must be allowed to shrink.

## SDK “How it works” grid

The redesigned SDK section should not remain a fixed four-column layout on narrow screens.

Expected behavior:

```text
desktop → 4 columns
narrow/mobile → reduced column count / stacked layout
```

Key/value rows must wrap or shrink instead of forcing overflow.

## Long technical values

Use one of these intentionally:

- wrapping (`overflow-wrap:anywhere`);
- controlled truncation with a way to inspect/copy full value;
- scrollable code block local to the block rather than page-wide overflow.

Do not allow a 66-character hash to decide the page width.

## Typography

Technical numeric contexts use tabular/lining numerals where appropriate so changing digits do not cause distracting layout jumps.

Mobile readability should remain reasonable without globally shrinking body text to solve layout bugs.

Fix containers first.

## Navigation

On narrow screens:

- primary navigation must remain reachable;
- brand should not crowd out controls;
- current surface should remain understandable;
- touch targets should remain large enough to use;
- sticky/fixed elements must not hide content.

## Home AutoTerminal

The Home product story includes animated terminal-style sequences.

### Normal motion

Lines can type/cycle progressively.

### Reduced motion

When `prefers-reduced-motion` is enabled, the terminal should still advance in a calm way, using lower-motion transitions rather than freezing permanently.

Accessibility preference should reduce animation intensity, not remove required information progression.

## Result states

`ALLOW`, `HOLD`, `BLOCK`, `EXECUTED` and error states must remain visually distinct on mobile.

Do not rely only on color; labels/text should convey the state.

## Technical-detail disclosures

Deep key/value data can live behind explicit “technical details” disclosures on constrained screens, while the main decision, amount/status and next action remain visible.

This improves hierarchy without hiding essential security outcomes.

## Content Trust / OCR

Content Trust may load OCR/Tesseract assets. Responsive layout should account for:

- text-input areas;
- uploaded content previews;
- loading states;
- evidence/result sections;
- long extracted text.

Extracted text should wrap within the content area.

## Browser QA

The current GitHub Playwright workflow verifies the final product flow across multiple viewports and includes:

- landing;
- demo;
- live flow;
- SDK;
- Security Lab;
- local API checks;
- screenshot artifacts.

Latest current redesign workflow is green.

## Manual mobile checklist

At ~390px:

- [ ] no horizontal page scroll;
- [ ] Home headline fits naturally;
- [ ] terminal sequence stays inside viewport;
- [ ] buttons do not overlap;
- [ ] Guided Demo scenario/result remains readable;
- [ ] Checking progress content wraps;
- [ ] execution status and amount remain visible;
- [ ] addresses/hashes do not widen page;
- [ ] Permissions controls fit;
- [ ] Activity detail rows wrap;
- [ ] Verify input/result fits;
- [ ] Security Lab controls remain usable;
- [ ] SDK code/steps do not overflow;
- [ ] footer/brand does not create duplicate accessibility/selector problems.

## Regression causes to watch

Common causes of overflow:

- fixed pixel widths;
- fixed multi-column grids;
- `white-space: nowrap` on technical values;
- flex/grid children without `min-width:0`;
- code blocks that overflow the whole document instead of themselves;
- large padding on both container and child;
- absolutely positioned decorations;
- duplicated desktop/mobile components both consuming layout space.

## QA selector stability

Browser tests should select the intended semantic surface rather than overly broad selectors that become ambiguous when a footer or another brand instance is added.

For example, if the test means the persistent header brand, scope the selector to the header/top navigation rather than matching every `.brand-lockup` in the DOM.

Tests should verify the product contract without unnecessarily coupling to incidental DOM duplication.

## Accessibility

Responsive quality includes:

- readable contrast;
- visible focus states;
- keyboard access to disclosures/buttons;
- reduced-motion support;
- semantic labels for state;
- not requiring hover for essential information.

## Final responsive rule

**Auctorail's technical depth should compress gracefully. On mobile, reduce columns and decorative complexity—not the clarity of ALLOW/HOLD/BLOCK, exact action facts, or the user's ability to understand what happened.**
