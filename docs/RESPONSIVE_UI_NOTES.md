# Responsive UI update

Auctorail no longer treats every viewport as a 460px phone canvas.

Breakpoints:
- `< 768px`: full-width mobile composition.
- `768px–1099px`: tablet working canvas.
- `>= 1100px`: desktop workspace up to 1320px with multi-column layouts where supported.

The responsive overrides are kept in `web/responsive-layout.css` and intentionally load after the screen styles so screenshot-fidelity rules do not re-lock the interface to the original narrow mobile reference.
