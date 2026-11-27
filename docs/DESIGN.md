# SmartClass design system: "soft colours"

Our own visual system for the website (25 Nov 2026). We tried several looks (bold "advert" styles,
a very formal one, four switchable themes) and picked a middle way: friendly enough for students,
calm enough for a university course. It mixes two of our mockups: the soft colour tints of one
and the green course band of another. No brand's colours, fonts, logos or layouts are copied.

## Principles

1. **White canvas, one action colour.** The page is white; only the main action of a card uses
   violet (`--brand`).
2. **A soft tint per kind of content.** Each kind of card has its own pale colour, so you know what
   it is before you read it: quiz violet, attendance green, questions blue, notes/recording yellow,
   "by hand" rose. Cards on a tint drop their frame; items inside them sit on white.
3. **The course band.** A teal band at the top of every signed-in page: a greeting by time of day
   and first name, the open lecture's title, and its time with "live now". With no open lecture it
   says so. On phones it runs edge to edge with rounded bottom corners; on wide screens it is a
   rounded card. Two faint circles decorate it.
4. **Friendly type, calm sizes.** Heebo for text, Rubik 600 for titles and big numbers, IBM Plex
   Mono for times and codes. Normal reading sizes; only the band title and stat numbers are large.
5. **Rounded and flat.** Cards 22px, buttons 14px, no drop shadows; buttons shrink slightly when
   pressed.
6. **Phone first, RTL first.** On phones the tabs are a bottom bar with icons. On screens 1000px
   and wider they become a side menu on the right (Hebrew), with the open page on a white pill.
   Logical CSS properties serve RTL and LTR from one stylesheet.
7. **Accessible.** Text contrast at least 4.5:1 in light and dark, visible focus rings, touch
   targets at least 44px, the load animation off when the device asks for reduced motion, no
   decorative emojis in titles or buttons.

## Screens (the fusion mockup, `mid-4`)

- **Lecturer, open lecture:** the course band holds the lecture's buttons (end lecture, "QR to
  projector", close). Under it four soft number boxes (present out of the class list, on the photo,
  waiting for the photo, marked by hand), then a "who is here" table (avatar, name, scan time, on
  the photo, status tag, remove) beside a small entry-code card (blue) and a "now in the lecture"
  card (violet) with shortcuts to the quiz, the class photo and the sheet/export. Comments, quiz,
  recording and the class photo follow below. The QR is small here and goes full screen only with
  "QR to projector".
- **Student:** the band (greeting, the open lecture), a ticket half on the band with today's status
  and a ring of lectures attended, then on the lecture tab three small boxes (questions, quiz,
  assignments) before the comments and the quiz.

## Files

- `web/css/app.css`: every component, written only against tokens.
- `web/css/themes.css`: the tokens for light (`soft`) and dark (`night`), the tints, the course
  band, the bottom bar and the side menu.
- `web/js/theme.js`: sets light/dark before the first paint; the topbar button switches them and
  the choice is kept per browser. With no choice the device's own setting decides.
- `web/js/ui/page.js` `setHero(title, sub)`: fills the course band; `lecturer.js` and `student.js`
  call it when a lecture opens or closes.
- Fonts are self-hosted in `web/vendor/fonts` (SIL Open Font License files included).

## Tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` / `--card` | `#ffffff` / `#ffffff` | `#12141b` / `#1a1d27` | Page, cards |
| `--sunk` | `#f4f5f8` | `#232735` | Inputs, comments |
| `--text` / `--muted` | `#1b1f2a` / `#5d6472` | `#e9ebf2` / `#a2a8b8` | Text |
| `--line` | `#e6e8ee` | `#2b3040` | Card frames, dividers |
| `--brand` | `#5b4bdb` | `#9d92ff` | The one action colour |
| `--course` | `#0f7b6c` | `#145e54` | The course band |
| `--t-violet` `--t-green` `--t-blue` `--t-sun` `--t-rose` | pastel | low-alpha washes | Content tints |
| `--ok` / `--warn` / `--error` / `--manual` | green / amber / red / rose | lighter | States and badges |

## Where the tints go

| Card | Tint |
|---|---|
| Attendance list (lecturer), "present" stat | green |
| Quiz (lecturer and student) | violet |
| Comments / questions | blue |
| Recording and summary, demo note | yellow |
| Marked by hand | rose |

## Android

The app uses the same system: `res/values(-night)/themes.xml` make the top bar teal (it joins
the course band) and white / deep blue-grey backgrounds. `Ui.java` draws the parts:
`Ui.hero(...)` is the course band with the greeting (top of the student home, lecturer home,
lecture, live lecture and assignments screens), `Ui.button(...)` is the rounded violet action
button, and `Ui.card(parent, Ui.TINT_...)` is a rounded card in one of the soft tints.

## Checked

Screenshots at 390px (phone: login, scan, lecture with a comment and reactions) and 1440px
(lecturer with an open lecture), light and dark, Hebrew RTL. All tests and the Playwright smoke
tests pass.
