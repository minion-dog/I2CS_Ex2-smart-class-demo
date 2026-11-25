# SmartClass design system: four themes

Our own visual system for the website (25 Nov 2026). Instead of one look, the site has four
themes the user can switch live with the palette button in the top bar. The choice is saved in
the browser (`localStorage` key `smartclass-theme`). With no saved choice, a phone in dark mode
starts on **midnight**, otherwise on **workshop**. No brand's colours, fonts, logos or layouts
are copied.

## How it is built

- `web/css/app.css` holds every component, written only against tokens (colours, borders,
  shadows, radius, fonts, background pattern).
- `web/css/themes.css` holds one `[data-theme="…"]` block per theme that sets those tokens, plus
  a few small per-theme touches.
- `web/js/theme.js` is a small classic script in `<head>`. It sets the theme before the first
  paint (no flash) and runs the palette button.
- Fonts are self-hosted in `web/vendor/fonts` (SIL Open Font License files included), so the site
  works offline.

Main tokens: `--bg`, `--card`, `--sunk`, `--text`, `--muted`, `--line`, `--brand` (main action),
`--accent` (focus, progress), `--ok` / `--warn` / `--error` (+ `-soft`), `--card-border`,
`--card-shadow`, `--btn-shadow`, `--btn-shadow-press`, `--btn-press-move`, `--paper-pattern`,
`--radius`, `--radius-card`, `--radius-btn`, `--font-display`, `--display-weight`, `--tabbar-bg`.

## The four themes

| Theme | Hebrew | Feel | Background | Main action | Headings |
|---|---|---|---|---|---|
| workshop | סדנה | Bold notebook: thick ink frames, hard offset shadows, buttons that press down | Putty `#efe6d2` with graph paper | Ultramarine `#2346d8`, yellow and red accents | Rubik 800 |
| clay | פלסטלינה | Soft and plushy: puffy cards with inner and outer shadows, pastel stat tiles, springy buttons | Warm `#fbf2ea` with pastel light | Peach `#ff8a5c` | Secular One |
| glass | זכוכית | Light and airy: frosted cards (`backdrop-filter`), pill buttons, thin large headings | Water light `#eaf2f7` | Sea blue `#0b6cb3` | Heebo 300 |
| midnight | חצות | Calm dark mode: deep navy, a faint teal glow at the top | Navy `#0a1121` | Mint `#5eead4` | Rubik |

## Shared rules (all themes)

1. **One main action per card.** Only the main button uses `--brand`; `.secondary` and
   `.danger` never compete with it.
2. **Numbers are typed.** Stats, times, the sheet and the quiz timer use IBM Plex Mono so live
   numbers do not jump.
3. **Projector stage.** The quiz and poll stage keeps its own dark stage and answer colours in
   every theme.
4. **Phone first.** At ≤700px the tabs become a bottom bar with SVG icons, within thumb reach.
   Touch targets are at least 44px.
5. **Hebrew RTL first.** Logical CSS properties (`margin-inline`, `inset-inline`) serve RTL and
   LTR from one stylesheet; dates are wrapped in an LTR isolate inside Hebrew text.
6. **Accessible.** Text contrast is at least 4.5:1 in every theme; focus rings are visible; the
   load animation (cards rising in) is turned off when the phone asks for reduced motion.
7. **No decorative emojis** in titles or buttons; icons are inline SVG.

## Android

`res/values/themes.xml` and `res/values-night/themes.xml` set the app's light and dark colours;
the quiz screen uses the projector-stage green.

## Checked

Screenshots of every theme at 390px (phone: login, scan, lecture) and 1440px (lecturer desktop),
Hebrew RTL. Fixed in this pass: the top bar overflowing on phones (theme name hidden there), and
content showing through the bottom tab bar (solid tab bars).
