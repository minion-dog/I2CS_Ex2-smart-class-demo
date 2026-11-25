<div dir="rtl">

# התקנה: Firebase, האתר והאפליקציה

בערך 15 דקות, רק לחיצות (חוץ משלב אחד אופציונלי).

## לפני Firebase: בדיקה עם טלפונים אמיתיים (שרת מקומי)
1. מתקינים Python פעם אחת: Microsoft Store ← "Python 3.12" ← Get.
2. לחיצה כפולה על `Start LAN Server.bat`. נפתח חלון שחור (לא לסגור) והדפדפן נפתח לבד.
3. בדפדפן: "מתקדם" ← "המשך" (תעודת הדגמה, זה צפוי).
4. כניסת מרצה ← הסיסמה מהחלון השחור ← "כניסה + טעינת כיתה לדוגמה".
5. אם Windows שואל על חומת האש: לאשר **רשתות פרטיות**.
6. הטלפון על אותה רשת Wi-Fi: סורקים במצלמה הרגילה את הקוד "הצטרפות מהטלפון", "מתקדם" ← "המשך", ונכנסים עם מייל מרשימת הכיתה (למשל `dana@demo`).
7. מתחילים שיעור במחשב, ובטלפון "סריקה". בפינה רואים "מה הסורק רואה": הקוד הנסתר מופיע שם. סריקה תקינה = נוכחות בכיתה (בלי מיקום).

## חלק א׳: פרויקט Firebase

1. הפרויקט שלנו כבר קיים: `oop-ex2` ב־[console.firebase.google.com](https://console.firebase.google.com). (פרויקט חדש: **Add project** ← בלי Google Analytics; אם מוצע "Gemini" אפשר לדלג.)
2. בתפריט: **Build ← Authentication ← Get started ← Sign-in method**:
   - **Google** ← Enable ← בוחרים support email ← Save.
   - **Email/Password** ← Enable ← Save.
3. **Build ← Firestore Database ← Create database** ← Location: `eur3 (europe-west)` ← **Start in production mode** ← Create.
4. בלשונית **Rules** של Firestore: מוחקים הכל, מדביקים את כל התוכן של `firestore.rules` מהריפו ← **Publish**.
5. **Project settings** (גלגל השיניים) ← **Your apps** ← אייקון ה־Web `</>` ← שם: `SmartClass Web` ← Register.
   מעתיקים את 6 הערכים (`apiKey`, `authDomain`...) לקובץ `web/js/firebase-config.js`, במקום ה־`PASTE`.

## חלק ב׳: חשבון המרצה

6. **Authentication ← Users ← Add user**: הדוא"ל והסיסמה של המרצה ← Add.
7. מעתיקים את ה־**User UID** של המשתמש החדש.
8. **Firestore ← Start collection** ← Collection ID: `staff` ← Document ID: מדביקים את ה־UID ← שדה `email` עם הדוא"ל ← Save.
   מעכשיו החשבון הזה מזוהה כמרצה. כל השאר הם סטודנטים, רק אם הדוא"ל שלהם ברשימת הכיתה.

## חלק ג׳: להעלות את האתר

האתר שלנו כבר באוויר ב־**GitHub Pages**: `https://minion-dog.github.io/I2CS_Ex2-smart-class-demo/`
9. כל שינוי שנדחף לריפו של האתר מתעדכן אחרי כדקה.
10. (אפשרות אחרת בלי פקודות: [app.netlify.com/drop](https://app.netlify.com/drop) וגוררים את התיקייה `web`.)
11. ב־Firebase: **Authentication ← Settings ← Authorized domains ← Add domain** ← `minion-dog.github.io`.

אופציונלי, עם פקודות (Firebase Hosting), מתוך תיקיית הריפו:
```
npm install -g firebase-tools
firebase login
firebase deploy --only hosting,firestore:rules --project <PROJECT_ID>
```

## חלק ד׳: הכנה לשיעור

12. נכנסים לאתר ← **כניסת מרצה** ← לשונית **רשימת כיתה** ← מעלים את `courseid_130158_participants.csv` (או ה־xlsx) מתיקיית ה־Drive של המרצה.
13. **מפתח ה-AI (פעם אחת, מנהל הקורס):** ב־Firestore יוצרים מסמך `config/ai` עם שדה `geminiKey` = המפתח מ־[aistudio.google.com](https://aistudio.google.com) ← **Get API key**. רק חשבון המרצה יכול לקרוא אותו; המרצה לא מקליד כלום. בהרצה מהמחשב שלנו (בלי Firebase): קובץ `web/js/ai-key.local.js` עם השורה `export const GEMINI_KEY = '...';` (הקובץ ב־.gitignore, לא עולה לגיטהאב).
14. בדיקה: פותחים שיעור, ומהטלפון סורקים מהאתר (לשונית **סריקה**).

## חלק ה׳: האפליקציה (Android Studio)

15. ב־Firebase: **Project settings ← Add app ← Android**:
    - Package name: `il.ac.ariel.smartclass`
    - **SHA-1** (חובה בשביל כניסה עם Google): ב־Android Studio, בחלון **Gradle** בצד ימין ← `app ← Tasks ← android ← signingReport` ← לחיצה כפולה ← מעתיקים את ה־SHA1 מהחלון למטה.
16. מורידים את `google-services.json` ושמים אותו בתיקייה `android/app/`.
    ⚠️ אם הוספתם SHA-1 אחרי ההורדה, מורידים את הקובץ שוב.
17. ב־`android/app/src/main/res/values/strings.xml` מחליפים את `web_url` בכתובת האתר (שלב 10) + `/lecturer.html`.
18. Android Studio ← **File ← Open** ← בוחרים את התיקייה `android` ← מחכים ל־Sync.
19. מחברים טלפון (Developer options ← USB debugging) ← ▶ **Run**.

אם יש שגיאת build: צילום מסך של חלון **Build** ושולחים.

## אם משהו לא עובד

| מה רואים | למה | מה עושים |
|---|---|---|
| "מצב הדגמה" באתר | `firebase-config.js` עדיין עם PASTE | שלב 5 |
| "החשבון לא נמצא ברשימה" | הדוא"ל לא ברשימת הכיתה | שלב 12, או להיכנס עם הדוא"ל שבמודל |
| כניסה עם Google נכשלת באתר | הדומיין לא מאושר | שלב 11 |
| כניסה עם Google נכשלת באפליקציה | אין SHA-1 או קובץ json ישן | שלבים 15–16 |
| כפתורי AI אומרים שה-AI לא הוגדר | אין מפתח מובנה | שלב 13 |
| הסריקה לא קוראת | הקוד קטן מדי בתמונה, או מסך כהה | **מסך מלא** אצל המרצה, **+** זום (או צביטה) בטלפון, להחזיק יציב 2 שניות, בהירות מסך מלאה |

</div>
