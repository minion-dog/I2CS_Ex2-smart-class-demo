# Conclusion

## What we built
SmartClass, a teaching tool for the classroom: a phone-first website for students and lecturers
(plus an optional Android app), on free services (Firebase, GitHub Pages, Google Gemini). It covers all
five features of the Ex2 sheet: automatic attendance with a photo-based check and a live/offline
**spreadsheet**, real-time and offline comments, KISS polls, an AI lecture summary, and an AI
homework review that compares each student with the class.

## The main result: attendance that cannot be photographed
Our **flicker code** shows a QR whose every frame is random and whose average is plain grey.
The information is in *how fast* each square changes, which only a live film shows.

| Measured | Result |
|---|---|
| A single photo, a merged photo of 3–90 frames, a burst of 3 | never readable |
| Standard QR readers (ZXing, OpenCV) on live frames | 0 / 150 |
| A forwarded photo held up to our scanner | never readable (nothing changes) |
| Our scanner, steady or shaking | reads in under 2 s |
| From far away (simulated) | readable at 10% of the picture height; strong shake still reads in ~1.7 s |
| Through a Zoom stream (real test) | not readable, which is why attendance is physical only |

## What changed on the way (design by testing)
1. **Noise QR v1 → flicker code v2:** our first design averaged to the QR; a phone's HDR photo
   read it. We redesigned so that every average is grey.
2. **Location → no location:** once only a live scan works, location added nothing and asked for
   a permission. The team decided: physical attendance only.
3. **Zoom attendance → none:** Zoom's video loses the flicker, and any number shown for Zoom
   students can be forwarded. Out of scope.
4. **Far reading:** real phones needed the code to fill the picture. We made the squares 1.6×
   bigger (short capital-letter text, 25×25), added auto-zoom, zoom buttons, pinch, and a wider
   alignment for hand shake.
5. **Test before Firebase:** a local Python server with the same rules let us test on real phones
   early; the data layer (Strategy pattern) made that a one-file change.

## Limitations (honest)
- A student in the room can **film** the code and replay it live for a friend within 60 seconds;
  the head count from a class photo is the check against that.
- The Android app is built in Android Studio on our PC; our cloud build environment could not reach
  Google's servers, so its pure-Java core is what we test automatically.
- AI (Gemini) works with a built-in key the lecturer never types; it lives in Firestore
  (lecturer-only). The public demo site has no Firebase yet, so it has no AI; on our own PC the key
  comes from an untracked local file.
- No push notifications on the free plan (in-app only while open).

## What we learned
- Design is iterative: two of our biggest decisions came from failing real-phone tests, not from
  the first plan.
- Writing the same algorithm in two languages with the same tests caught bugs in both.
- Security rules are a real server: thinking "who may write what, once" up front kept the client simple.
- AI is a strong tool when every step is checked; [`AI_USAGE.md`](AI_USAGE.md) logs what the AI did
  and what we decided.
