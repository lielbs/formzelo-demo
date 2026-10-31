/** Illustrative pricing only — there is no billing in the demo. */
export const PLANS = [
  {
    key: 'start',
    name: 'Start',
    price: 99,
    blurb: 'לעסק שמתחיל לעבוד עם תהליכים דיגיטליים.',
    features: ['3 תהליכים פעילים', 'עד 100 בקשות בחודש', 'מיתוג בסיסי', 'תיבת בקשות והיסטוריה'],
  },
  {
    key: 'grow',
    name: 'Grow',
    price: 199,
    highlight: true,
    blurb: 'לעסק שמנהל כמה סוגי לקוחות ושירותים.',
    features: ['15 תהליכים פעילים', 'עד 1,000 בקשות בחודש', 'תיקים אישיים ותנאים', 'גרסאות ואנליטיקה', '3 משתמשי צוות'],
  },
  {
    key: 'scale',
    name: 'Scale',
    price: 399,
    blurb: 'לצוותים עם נפח גבוה וצורך בבקרה.',
    features: ['תהליכים ללא הגבלה', 'עד 5,000 בקשות בחודש', 'מקדמות ותשלומים*', 'יומן ביקורת והרשאות', '10 משתמשי צוות'],
  },
] as const;
