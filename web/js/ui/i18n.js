// =====================================================================
//  i18n.js - Hebrew first, English on request (decision Q9)
// =====================================================================
// Elements with data-i18n="key" get their text from here; the choice is
// remembered on this device. Hebrew pages are right-to-left, English
// pages left-to-right.

const STRINGS = {
    he: {
        appName: 'SmartClass',
        langSwitch: 'English',
        signOut: 'יציאה',
        loginTitle: 'כניסה לשיעור',
        loginStudent: 'סטודנטים: כניסה עם חשבון Google של הרשימה',
        loginGoogle: 'כניסה עם Google',
        loginLecturer: 'כניסת מרצה',
        email: 'דוא"ל',
        password: 'סיסמה',
        enter: 'כניסה',
        notOnList: 'החשבון הזה לא נמצא ברשימת הכיתה. היכנסו עם הדוא"ל שרשום במודל.',
        demoBanner: 'מצב הדגמה: הנתונים נשמרים רק בדפדפן הזה. פתחו לשונית נוספת כדי לשחק את התפקיד השני.',
        demoAsLecturer: 'היכנס כמרצה (הדגמה)',
        demoAsStudent: 'היכנס כסטודנט (הדגמה)',
        demoLoadClass: 'טען כיתה לדוגמה',
        demoReset: 'אפס הדגמה',
        scannerSees: 'מה הסורק רואה',
        cancel: 'ביטול',
        newPoll: 'סקר חדש בשיעור',
        newGrade: 'התקבל ציון',
        whyClass: 'סרקת את הקוד החי במסך הכיתה',
        scanReadDemo: 'הקוד נקרא בהצלחה ✓ (הדגמה: לא נשמר, כי השיעור פתוח במכשיר אחר)',
        whereClass: '🏫 נוכחות פיזית בכיתה',
        demoNoPhone: 'מצב הדגמה רץ רק במחשב הזה, ולכן טלפון לא יכול להתחבר אליו. כדי לפתוח בטלפון: סגרו את החלון של Start Demo והפעילו את Start LAN Server.bat (צריך Python מה-Microsoft Store). אז יופיע כאן קוד QR לטלפון.',
        lanBanner: 'שרת מקומי: הנתונים נשמרים במחשב של המרצה. טלפונים באותה רשת Wi-Fi נכנסים מהקוד שעל מסך המרצה.',
        lanStudentEmail: 'סטודנט: המייל שלך מרשימת הכיתה',
        lanPassword: 'הסיסמה שמופיעה בחלון השרת',
        lanWrongPassword: 'סיסמה שגויה (היא מופיעה בחלון השרת השחור)',
        lanLoadSample: 'כניסה + טעינת כיתה לדוגמה',
        lanJoinTitle: 'הצטרפות מהטלפון',
        lanJoinHint: 'סרקו במצלמה הרגילה (קוד רגיל, רק לכתובת האתר). בפעם הראשונה: "מתקדם" ← "המשך".',
        tabLive: 'שיעור חי',
        tabSheet: 'גיליון נוכחות',
        tabRoster: 'רשימת כיתה',
        tabAssignments: 'עבודות',
        tabScan: 'סריקה',
        tabLecture: 'שיעור',
        sessionTitle: 'שם השיעור',
        startSession: 'התחל שיעור',
        endSession: 'סיים שיעור',
        fullscreen: 'מסך מלא',
        inClass: 'בכיתה',
        onZoom: 'בזום',
        manual: 'ידני',
        absent: 'לא נכח',
        total: 'סה"כ',
        markByHand: 'סימון ידני',
        searchStudent: 'חיפוש סטודנט…',
        remove: 'הסר',
        comments: 'הערות',
        writeComment: 'כתבו הערה…',
        send: 'שלח',
        public: 'ציבורית',
        private: 'פרטית (רק למרצה)',
        anonymous: 'אנונימי',
        anonymousName: 'אנונימי',
        lecturerName: 'המרצה',
        polls: 'סקרים',
        pollQuestion: 'שאלה',
        pollOptions: 'תשובות (שורה לכל תשובה)',
        createPoll: 'פתח סקר',
        closePoll: 'סגור',
        reopenPoll: 'פתח שוב',
        votes: 'קולות',
        voted: 'הצבעת ✓',
        pollClosed: 'הסקר נסגר',
        transcript: 'תמלול וסיכום',
        recordStart: 'התחל הקלטה',
        recordStop: 'עצור הקלטה',
        uploadRecording: 'העלה הקלטה',
        makeSummary: 'צור סיכום',
        summary: 'סיכום',
        noSummary: 'עוד אין סיכום לשיעור הזה.',
        classPhoto: 'תמונת כיתה',
        photoHint: 'מצלמים תמונה אחת של הכיתה. אחרי הסריקה כל סטודנט לוחץ על הפנים שלו ומאשר.',
        takePhoto: '📷 צילום הכיתה',
        retakePhoto: 'צילום מחדש',
        findingFaces: 'מחפש פנים…',
        facesFound: 'פנים',
        editHint: 'נגיעה בריבוע = מחיקה · נגיעה בפנים בלי ריבוע = הוספה. הגדלה: + או שתי אצבעות.',
        undo: 'ביטול פעולה',
        savePhoto: 'שמירה והצגה לסטודנטים',
        editBoxes: 'עריכת הריבועים',
        confirmedFaces: 'אישרו',
        waitingFaces: 'סרקו, עוד לא סימנו',
        notInPhoto: 'לא מצאו את עצמם',
        foundWith: 'נמצא בעזרת',
        autoFailed: 'החיפוש האוטומטי לא עבד. אפשר לסמן ביד: נגיעה בכל פנים מוסיפה ריבוע.',
        freeBox: 'שחרור הריבוע',
        photoSaved: 'התמונה נשמרה. הסטודנטים יכולים לסמן את עצמם.',
        pickTitle: 'שלב אחרון: מי את/ה בתמונה?',
        pickHint: 'מגדילים עם + או בשתי אצבעות, ולוחצים על הפנים שלך.',
        isThisYou: 'זה את/ה?',
        yesMe: '✓ כן, זה אני',
        notMe: 'לא, לבחור שוב',
        cantFind: 'לא מוצא/ת את עצמי',
        pickDone: '✓ הנוכחות אושרה',
        toldLecturer: 'המרצה קיבל/ה הודעה שלא מצאת את עצמך. אפשר גם לגשת אליו/ה.',
        waitPhoto: 'המרצה עוד לא צילם/ה את הכיתה. כשהתמונה תעלה, תתבקש/י ללחוץ על הפנים שלך.',
        boxTaken: 'מישהו כבר בחר בפנים האלה. אם זה את/ה, ספר/י למרצה.',
        newPhoto: 'תמונת הכיתה עלתה: לחצו על הפנים שלכם',
        headcount: 'ספירת ראשים מתמונה',
        uploadPhoto: 'העלה תמונה של הכיתה',
        peopleInPhoto: 'אנשים בתמונה',
        scannedInClass: 'סרקו בכיתה',
        moreScansThanPeople: 'יש יותר סריקות מאנשים בתמונה. ייתכן שמישהו סרק מבחוץ.',
        correctCount: 'תיקון ידני',
        save: 'שמור',
        importRoster: 'ייבוא רשימת כיתה (CSV או XLSX מהמודל)',
        rosterCount: 'סטודנטים ברשימה',
        staff: 'סגל',
        downloadXlsx: 'הורד XLSX',
        refresh: 'רענן',
        newAssignment: 'עבודה חדשה',
        assignmentTitle: 'שם העבודה',
        requirements: 'דרישות',
        due: 'תאריך הגשה',
        create: 'צור',
        submissions: 'הגשות',
        repoUrl: 'קישור ל-GitHub',
        files: 'קבצים (טקסט/קוד, עד 500KB)',
        submit: 'הגש',
        submitted: 'הוגש',
        aiReview: 'ביקורת AI',
        reviewAll: 'ביקורת AI לכל ההגשות',
        grade: 'ציון',
        feedback: 'משוב',
        aiMissing: 'ה-AI עוד לא הוגדר לקורס (המפתח המובנה חסר). פנו למנהל המערכת.',
        scanTitle: 'סריקת נוכחות',
        scanHint: 'כוונו את המצלמה לקוד שעל המסך והחזיקו יציב כשנייה.',
        startCamera: 'הפעל מצלמה',
        scanning: 'סורק…',
        scanOk: 'נרשמת!',
        scanPending: 'נשמר במכשיר. יישלח כשיחזור האינטרנט.',
        scanAlready: 'כבר נרשמת לשיעור הזה.',
        scanBad: 'הקוד לא תקין או שהשיעור לא נמצא.',
        noOpenSession: 'אין שיעור פתוח כרגע.',
        chooseSession: 'בחרו שיעור',
        offline: 'אין חיבור לאינטרנט. מה שתעשו יישמר ויישלח אחר כך.',
        online: 'מחובר',
        language: 'שפה',
        cameraDenied: 'אין גישה למצלמה. אשרו גישה בהגדרות הדפדפן.',
        working: 'עובד…',
        error: 'שגיאה'
    },
    en: {
        appName: 'SmartClass',
        langSwitch: 'עברית',
        signOut: 'Sign out',
        loginTitle: 'Join the lecture',
        loginStudent: 'Students: sign in with the Google account on the class list',
        loginGoogle: 'Sign in with Google',
        loginLecturer: 'Lecturer sign-in',
        email: 'Email',
        password: 'Password',
        enter: 'Sign in',
        notOnList: 'This account is not on the class list. Sign in with the email registered in Moodle.',
        demoBanner: 'Demo mode: data stays in this browser only. Open a second tab to play the other role.',
        demoAsLecturer: 'Enter as lecturer (demo)',
        demoAsStudent: 'Enter as student (demo)',
        demoLoadClass: 'Load a sample class',
        demoReset: 'Reset demo',
        scannerSees: 'What the scanner sees',
        cancel: 'Cancel',
        newPoll: 'A new poll in the lecture',
        newGrade: 'New grade',
        whyClass: 'You scanned the live code on the classroom screen',
        scanReadDemo: 'Code read ✓ (demo: attendance is not saved, because the lecture is open on another device)',
        whereClass: '🏫 Physical attendance, in class',
        demoNoPhone: 'Demo mode runs on this PC only, so a phone cannot connect to it. To open it on a phone: close the Start Demo window and run Start LAN Server.bat (needs Python from the Microsoft Store). Then a QR for the phone appears here.',
        lanBanner: 'Local server: data is kept on the lecturer\'s PC. Phones on the same Wi-Fi join from the code on the lecturer\'s screen.',
        lanStudentEmail: 'Student: your email from the class list',
        lanPassword: 'The password shown in the server window',
        lanWrongPassword: 'Wrong password (it is shown in the black server window)',
        lanLoadSample: 'Enter + load a sample class',
        lanJoinTitle: 'Join from a phone',
        lanJoinHint: 'Scan with the normal camera (a plain code, only the site address). First time: "Advanced" → "Proceed".',
        tabLive: 'Live lecture',
        tabSheet: 'Attendance sheet',
        tabRoster: 'Class list',
        tabAssignments: 'Assignments',
        tabScan: 'Scan',
        tabLecture: 'Lecture',
        sessionTitle: 'Lecture name',
        startSession: 'Start lecture',
        endSession: 'End lecture',
        fullscreen: 'Full screen',
        inClass: 'In class',
        onZoom: 'On Zoom',
        manual: 'Manual',
        absent: 'Absent',
        total: 'Total',
        markByHand: 'Mark by hand',
        searchStudent: 'Search a student…',
        remove: 'Remove',
        comments: 'Comments',
        writeComment: 'Write a comment…',
        send: 'Send',
        public: 'Public',
        private: 'Private (lecturer only)',
        anonymous: 'Anonymous',
        anonymousName: 'Anonymous',
        lecturerName: 'Lecturer',
        polls: 'Polls',
        pollQuestion: 'Question',
        pollOptions: 'Answers (one per line)',
        createPoll: 'Open poll',
        closePoll: 'Close',
        reopenPoll: 'Reopen',
        votes: 'votes',
        voted: 'Voted ✓',
        pollClosed: 'Poll closed',
        transcript: 'Transcript and summary',
        recordStart: 'Start recording',
        recordStop: 'Stop recording',
        uploadRecording: 'Upload a recording',
        makeSummary: 'Make summary',
        summary: 'Summary',
        noSummary: 'No summary for this lecture yet.',
        classPhoto: 'Class photo',
        photoHint: 'Take one photo of the class. After scanning, each student taps their own face and confirms.',
        takePhoto: '📷 Take a class photo',
        retakePhoto: 'Retake',
        findingFaces: 'Finding faces…',
        facesFound: 'faces',
        editHint: 'Tap a box to remove it · tap a face with no box to add one. Zoom: + or two fingers.',
        undo: 'Undo',
        savePhoto: 'Save and show to students',
        editBoxes: 'Edit the boxes',
        confirmedFaces: 'Confirmed',
        waitingFaces: 'Scanned, not chosen yet',
        notInPhoto: 'Not in the photo',
        foundWith: 'Found with',
        autoFailed: 'Automatic finding did not work. Mark by hand: tap each face to add a box.',
        freeBox: 'Free this box',
        photoSaved: 'Photo saved. Students can now tap their faces.',
        pickTitle: 'Last step: which one is you?',
        pickHint: 'Zoom with + or two fingers, then tap your face.',
        isThisYou: 'Is this you?',
        yesMe: "✓ Yes, that's me",
        notMe: 'No, choose again',
        cantFind: "I can't find myself",
        pickDone: '✓ Attendance confirmed',
        toldLecturer: 'The lecturer was told you are not in the photo. You can also go and say so.',
        waitPhoto: 'The lecturer has not taken the class photo yet. When it is up, you will be asked to tap your face.',
        boxTaken: 'Someone already chose this face. If it is you, tell the lecturer.',
        newPhoto: 'The class photo is up: tap your face',
        headcount: 'Head count from a photo',
        uploadPhoto: 'Upload a class photo',
        peopleInPhoto: 'People in the photo',
        scannedInClass: 'Scanned in class',
        moreScansThanPeople: 'More scans than people in the photo. Someone may have scanned from outside.',
        correctCount: 'Correct by hand',
        save: 'Save',
        importRoster: 'Import class list (CSV or XLSX from Moodle)',
        rosterCount: 'students on the list',
        staff: 'staff',
        downloadXlsx: 'Download XLSX',
        refresh: 'Refresh',
        newAssignment: 'New assignment',
        assignmentTitle: 'Title',
        requirements: 'Requirements',
        due: 'Due date',
        create: 'Create',
        submissions: 'Submissions',
        repoUrl: 'GitHub link',
        files: 'Files (text/code, up to 500KB)',
        submit: 'Submit',
        submitted: 'Submitted',
        aiReview: 'AI review',
        reviewAll: 'AI review for all',
        grade: 'Grade',
        feedback: 'Feedback',
        aiMissing: 'AI is not set up for this course yet (the built-in key is missing). Ask the admin.',
        scanTitle: 'Attendance scan',
        scanHint: 'Point the camera at the code on the screen and hold still for a second.',
        startCamera: 'Start camera',
        scanning: 'Scanning…',
        scanOk: "You're in!",
        scanPending: 'Saved on the device. It will be sent when the internet is back.',
        scanAlready: 'You are already marked for this lecture.',
        scanBad: 'Invalid code or lecture not found.',
        noOpenSession: 'No open lecture right now.',
        chooseSession: 'Choose a lecture',
        offline: 'Offline. What you do is saved and sent later.',
        online: 'Online',
        language: 'Language',
        cameraDenied: 'No camera access. Allow it in the browser settings.',
        working: 'Working…',
        error: 'Error'
    }
};

const LANG_KEY = 'smartclass-lang';

/**
 * Returns the chosen language.
 * @returns {string} 'he' or 'en'
 */
export function lang()
{
    try
    {
        const saved = localStorage.getItem(LANG_KEY);
        if (saved === 'en' || saved === 'he')
        {
            return saved;
        }
    }
    catch (e)
    {
        // storage blocked: fall back to Hebrew
    }
    return 'he';
}

/**
 * Translates a key.
 * @param {string} key - string id
 * @returns {string} text in the chosen language (the key itself if missing)
 */
export function t(key)
{
    const table = STRINGS[lang()];
    return table[key] !== undefined ? table[key] : key;
}

/**
 * Applies the language to the page: direction, lang attribute and every data-i18n element.
 * @param {ParentNode} root - where to look (default: the document)
 */
export function applyLanguage(root)
{
    const r = root || document;
    document.documentElement.lang = lang();
    document.documentElement.dir = lang() === 'he' ? 'rtl' : 'ltr';
    for (const node of r.querySelectorAll('[data-i18n]'))
    {
        node.textContent = t(node.dataset.i18n);
    }
    for (const node of r.querySelectorAll('[data-i18n-placeholder]'))
    {
        node.placeholder = t(node.dataset.i18nPlaceholder);
    }
}

/** Switches Hebrew <-> English and reloads the page. */
export function toggleLanguage()
{
    try
    {
        localStorage.setItem(LANG_KEY, lang() === 'he' ? 'en' : 'he');
    }
    catch (e)
    {
        // storage blocked: nothing to remember
    }
    location.reload();
}

/**
 * Lists the keys of a language (used by a test: both languages have the same keys).
 * @param {string} code - 'he' or 'en'
 * @returns {string[]} keys
 */
export function keysOf(code)
{
    return Object.keys(STRINGS[code]);
}
