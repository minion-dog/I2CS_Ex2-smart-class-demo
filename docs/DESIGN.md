# SmartClass design system: "paper & chalk"

Our own visual system for the website and the Android app (25 Nov 2026). The goal is a tool that
looks like it belongs in a classroom: warm paper, ink, and a chalkboard for the projector, with one
loud colour for the main action. We looked at a few well-known product styles for ideas (a calm
dark tool, a warm cream "notebook" site, a playful learning app), then mixed and changed them into
our own system. No brand's colours, fonts, logos or layouts are copied.

## Principles

1. **One loud colour.** Tomato (`--brand`) is only for the main action of a card ("Start camera",
   "Ask now"). Everything else is ink, paper and lines.
2. **Flat paper, framed cards.** Cards are sheets on the paper: a 1px line, no drop shadow.
3. **Chunky buttons.** Buttons have a darker "ledge" under them and sink when pressed, a small
   playful touch that also shows clearly what is tappable.
4. **Numbers are typed.** Counters, times and the sheet use a typewriter face (IBM Plex Mono), so
   live numbers do not jump and read as data.
5. **Chalkboard for the projector.** The quiz and poll stage is chalkboard green with a faint dot
   grid. The answer colours (red, blue, yellow, green, purple, teal) appear only there.
6. **Calm, readable, RTL first.** Hebrew is the main language; logical CSS properties
   (`margin-inline`, `inset-inline`) keep RTL and LTR in one stylesheet. Text contrast is at
   least 4.5:1 in light and dark.

## Tokens (`web/css/app.css`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f1efe7` | `#17181b` | Paper (with faint notebook dots) |
| `--card` | `#fffdf8` | `#1f2125` | Cards, inputs |
| `--sunk` | `#e8e5da` | `#2a2c31` | Wells: bars, table headers |
| `--text` | `#22241c` | `#eceae2` | Ink |
| `--muted` | `#5c5e53` | `#a9aa9f` | Secondary text |
| `--line` | `#d3d0c2` | `#393b41` | Card frames, dividers |
| `--brand` | `#d9502a` | `#f06a40` | The one loud colour (main action, card-title rule, brand tag) |
| `--brand-ledge` | `#9c3517` | `#a8411f` | Button ledge |
| `--accent` | `#2f6f62` | `#6cc3ae` | Focus ring, progress |
| `--ok` / `--warn` / `--error` | green / amber / red | lighter | States, each with a `-soft` tint for badges |
| `--note` | `#fff1a8` | `#4a4215` | Sticky notes (demo banner) |
| `--chalk` | `#1f3b31` | same | Projector stage |

Radius: 8px buttons and inputs, 10px cards, 4px badges. Touch targets are at least 44px.

## Type

- **IBM Plex Sans Hebrew** (400/500/600/700) for all text, self-hosted in `web/vendor/fonts`
  (SIL Open Font License, `OFL-IBM-Plex.txt`). It covers Hebrew and Latin with one voice.
- **IBM Plex Mono** 500 for numbers: stats, times, the attendance sheet, the quiz timer.
- Card titles: 1.15rem / 700 with a short tomato rule before them, the system's only decoration.

## Components

| Component | Rule |
|---|---|
| Top bar | Paper card, the mark "Smart" + a tomato "Class" stamp (rotated −2°) |
| Tabs | Ink text, a 3px tomato underline on the open tab |
| Button | Tomato with a ledge (main); `.secondary` = paper with a line; `.danger` = outlined red (never competes with the main action) |
| Badge | Tinted background + coloured text (present green, manual purple, waiting amber) |
| Banner | A sticky note with a strip of tape, slightly rotated |
| Stat | Framed tile, big mono number, small muted label |
| Comment | Framed; the lecturer's comment has a tomato edge and tint; private = purple edge |
| Emoji reactions | Small pills; mine get the tomato tint |
| Quiz stage | Chalkboard green, paper question card, coloured answer tiles with a ledge |

## Android

`res/values/themes.xml` and `res/values-night/themes.xml` use the same colours (tomato primary,
teal secondary, paper / dark background); the quiz screen uses the chalkboard green.

## Checked

Screenshots at 390px (phone) and 1440px (desktop), light and dark, Hebrew RTL. Removed in this
pass: decorative emojis in titles and buttons, two loud buttons in one card, a red "end lecture"
button that looked like the main action, an empty gap above the scan result, dates turning into
",25.11" inside Hebrew text (now an LTR isolate).
