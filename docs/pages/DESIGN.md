# Eliscript Pages Design Specification

> **Internal documentation only.** Do not link to, render, or expose this file from any live `.html` page on the published site.

This document records the visual, interactive, and architectural invariants for the Eliscript documentation site so future edits preserve its design intent across releases.

---

## 1. Architecture & Publishing Invariants

- **Entry & tree layout**: `docs/index.html` is the sole site root entry; all subpages, stylesheets, scripts, icons, and documentation resources live under `docs/pages/`.
- **Live Eliscript runtime (no handwritten site JS)**: All interactive behaviours (landing code switcher, language tabs, API module filter, click-to-copy commands, header scroll choreography, dynamic version/year stamping) are authored in `docs/pages/site.eli` and compiled in the browser by `docs/pages/loader.eli` (bundled into `dist/docs-site/site.js` as `pages/assets/eliscript-loader.js` during assembly). Zero generated `.js`/`.mjs` files are committed under `docs/`.
- **Generated API page**: `docs/pages/api.html` and `docs/pages/api-index.json` are generated exclusively by `tools/surface/generate-api.eli` (`bun tools/surface/generate-api.mjs`) and checked with `--check`.

---

## 2. Color System & Brand Tokens

| Token | Hex / Value | Role |
| :--- | :--- | :--- |
| **Pure Black Chrome** | `#0a0b09` (`rgb(10, 11, 9)`) | At-rest top bar background and base chrome dark tone |
| **Warm Paper** | `#f6f4ec` (`--paper`) | Primary page ground (`radial-gradient` dot grid on hero), inverted header target (`rgba(246, 244, 236, 0.90)`) |
| **Bright Paper** | `#fffefa` (`--paper-bright`) | Elevated cards, tables, sticky TOC, SVG plate frame, top-bar text at `p = 0` |
| **Sand** | `#ede9dc` (`--sand`) | Warm card offset shadow (`box-shadow: 10px 10px 0 var(--sand)`) |
| **Charcoal Ink** | `#171815` (`--ink`) | Display headings, primary buttons, dark code slabs & footer |
| **Muted Moss** | `#5b5f55` (`--muted`) | Body copy and metadata labels |
| **Avocado** | `#2d5a34` (`--avocado`) | Primary green accent, text links, focus rings, card badges |
| **Sage** | `#e6efe0` / `#c7d9bd` | Soft green pill surfaces, callout fills, roadmap bottom strip |
| **Lime** | `#c4d83e` (`--lime`) | Code pane uppercase labels and dark-mode version pill |
| **Avocado-Pit Red (牛油果核红)** | `#ef6049` (`--coral`) | Logo center accent, active code tab, scrolled `Elisp` letter peak color |
| **Deep Avocado-Pit Red** | `#d24832` (`--coral-deep`) | Hero underline highlight, light-background hover CTA, `p = 1.0` fused `Elisp` ink |

### Banned Legacy Elements
- Do **not** restore `docs/pages/assets/eliscript-hero.jpg` (replaced by `docs/pages/assets/eliscript-concept.svg`).
- Do **not** reintroduce cold cyan `#1397b0` drop-shadows or `#dceff2` strips; use warm sand/charcoal shadows and `--sage` (`#e6efe0`).

---

## 3. Header Scroll Choreography (1 Full Viewport Span)

The `.site-header` transitions smoothly across **one full viewport height** so readers see the transition gradually unfold as they scroll past the hero:

```text
scrollSpan = max(window.innerHeight, 560)
p = clamp(window.scrollY / scrollSpan, 0, 1)
```

### Three Visual Phases

| Metric | Phase 1: At Rest (`p = 0.00`) | Phase 2: Mid-Scroll (`p = 0.48–0.50`) | Phase 3: Full Screen (`p >= 1.00`) |
| :--- | :--- | :--- | :--- |
| **Bar Background** | Pure opaque black `rgba(10, 11, 9, 1.00)` | Translucent frosted smoke `rgba(46, 48, 42, 0.72)` + `blur(16px)` | Frosted Warm Paper `rgba(246, 244, 236, 0.90)` + `blur(12px)` |
| **Logo Backlit Halo (`--header-halo`)** | Subtle `0.36` (separates black parentheses cleanly from pure black) | **Peak** `0.94` + warm-paper & avocado-pit-red rim bloom | **Fused** `0.00` (warm-paper halo matches `#f6f4ec` background and dissolves seamlessly) |
| **Peak Accent (`--header-halo-peak`)** | `0.00` | `1.00` (`4 * p * (1 - p)`) | `0.00` |
| **Wordmark `Elis` + `p` (`--header-elisp-color`)** | Crisp ivory `rgb(255, 254, 250)` | Vibrant **Avocado-Pit Red** `rgb(239, 96, 73)` (`#ef6049`) with coral glow | Contrast-safe **Deep Avocado-Pit Red** `rgb(210, 72, 50)` (`#d24832`) |
| **Wordmark `cri` + `t` (`.brand-rest`)** | Solid `rgb(255, 254, 250)` | Softened `rgba(255, 254, 250, 0.86)` so `Elisp` stands out | Crisp ink `#171815` (`data-header-tone="light"`) |
| **Tone Crossover (`data-header-tone`)** | `"dark"` | `"dark"` | `"light"` (switches at `p >= 0.66`) |

### Timing & Contrast Guarantees
1. **Piecewise smoothstep curves** (`t * t * (3 - 2 * t)`):
   - Background RGBA interpolates smoothly `(10, 11, 9, 1.00) -> (46, 48, 42, 0.72)` across `p in [0, 0.50]`, then `(46, 48, 42, 0.72) -> (246, 244, 236, 0.90)` across `p in [0.50, 1.00]`.
   - Backlit halo follows a bell curve: rises `0.36 -> 0.94` across `p in [0, 0.48]`, then decays `0.94 -> 0.00` across `p in [0.48, 0.96]` so the halo vanishes completely before full warm-paper lock.
   - `data-header-tone` flips from `"dark"` to `"light"` at `p = 0.66` (around background luminance `L ~ 0.18`), ensuring nav link contrast stays above WCAG AA throughout the inversion.
2. **Direct scroll tracking**: CSS properties driven every animation frame (`background`, `.brand::before` opacity/filter/transform, `.brand-mark` rim shadow, `.brand-elisp` color) have **no CSS `transition` delay** on those variables, preventing rubber-band lag during fast wheel or trackpad scrolling. Discrete `[data-header-tone="light"]` UI chrome (nav link inks, `.brand-ver`, `.nav-cta`) uses a crisp `200ms ease` transition.
3. **Scroll indicator fallback**: With JS disabled, `.site-header` defaults cleanly to `p = 0` (pure black bar, `0.36` halo, white `Eliscript`).

---

## 4. Brand Assets & Hero Lockup

- **All 4 brand PNGs stay active and verified**:
  1. `docs/pages/assets/eliscript-logo.png`: Navbar brand icon (`36×36`, `30×30` on `<= 680px`) AND open Home Hero sculptural mark (`72×72`, `56×56` on `<= 680px`) beside the `.eyebrow` lockup.
  2. `docs/pages/assets/eliscript-logo-light.png`: Navbar eclipsed halo (`::before` under `mix-blend-mode: screen`) AND dark `.site-footer` brand emblem (`28×28`).
  3. `docs/pages/assets/eliscript-logo-avocado.png`: Core features section emblem (`52×52`) and sticky `.doc-nav` emblem (`42×42`).
  4. `docs/pages/assets/eliscript-avocado-badge.png`: Bottom `.band-sage` roadmap emblem (`56×56`).
- **Home Hero diagram (`docs/pages/assets/eliscript-concept.svg`)**: Self-contained vector `< 6 KB` (`viewBox="0 0 600 340"`), framed inside `.concept-plate` (`10px 10px 0 var(--sand)` shadow). Sculptural Lisp parentheses enclose persistent structural sharing (`v0 -> v1`) compiling into pure language targets. Inner margin between right cards and right parenthesis must stay generous (`>= 20px` in viewBox units) so no text overlaps the stroke.

---

## 5. Pure-Language Copy Boundary

Public overview surfaces—Home Hero, `eliscript-concept.svg`, Home status strip, code-lab tabs (`recur`, `data`, `interop`, `compat`, `async`), 6 feature cards, Playground default sample, and top-level headlines/tabs in `language.html` & `getting-started.html`—must emphasize **Eliscript the language**:
- Emacs Lisp core compatibility (`.el` & `.eli`, Lisp-2, `nil`-only falsiness)
- Persistent immutable data structures & structural sharing
- Structural matching, `recur`, `defmodule`, checked macros, structured async, and explicit JS interop

Do **not** highlight non-language internal protocols or hardware targets (`mdp`, `gepo`, `mds`, `ARM`/`ARM64`, `Val64`, `0-glue GC`, `343 fixed-point`, `314 ERT`) in top-level showcase copy.

---

## 6. Responsive & Verification Checklist

- **Desktop breakpoint**: `max-width: 1200px`; two-column Hero (`0.92fr 1.08fr`), collapsing to one column at `<= 960px`.
- **Mobile (`<= 680px`, checked at `390×844`)**: Hide `.brand-ver`, `.nav-optional`, and navbar `GitHub` link so `[logo + Eliscript | Start Language API | Playground →]` fits on one row with zero horizontal overflow (`scrollWidth <= innerWidth`).
- **Required checks before commit**:
  ```bash
  bun tools/surface/generate-api.mjs --check
  bun test tests/pages-site.test.mjs tests/api-index.test.mjs tests/browser-playground.test.mjs tests/pages-assembly.test.mjs tests/pages-runtime.test.mjs tests/docs-site.test.mjs
  ```
