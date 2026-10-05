/* ============================ §1 CONFIG ============================ */
const APP_NAME = "TrackA'gain";
const STORAGE_KEY = 'liftlog_data_v2'; // legacy key — renaming would wipe saved workouts
const THEME_KEY = 'trackagain_theme'; // appearance only — not part of workout JSON

/* All training science lives in this object. Nothing else hard-codes these numbers. */
const TRAINING = {
  /* Goal presets. The active goal is DATA.settings.goal; users can override
     repsToEarnIncrease / sessionsRequired in Settings → Training. */
  goals: {
    hypertrophy: {label:'Hypertrophy', repsToEarnIncrease:12, qualifyingSets:3, sessionsRequired:2, repsMin:8,  repsMax:12},
    strength:    {label:'Strength',    repsToEarnIncrease:6,  qualifyingSets:3, sessionsRequired:2, repsMin:4,  repsMax:6},
    endurance:   {label:'Endurance',   repsToEarnIncrease:18, qualifyingSets:3, sessionsRequired:1, repsMin:12, repsMax:20}
  },

  /* Rep-range buckets. `credit` = how much of a full working set this rep count is
     worth toward each goal (used by the effective-sets / fatigue metric). */
  repRanges: [
    {key:'strength',    label:'Strength',    maxReps:6,        credit:{hypertrophy:0.5, strength:1.0, endurance:0.3}},
    {key:'hypertrophy', label:'Hypertrophy', maxReps:14,       credit:{hypertrophy:1.0, strength:0.6, endurance:0.7}},
    {key:'endurance',   label:'Endurance',   maxReps:24,       credit:{hypertrophy:0.8, strength:0.3, endurance:1.0}},
    {key:'veryHigh',    label:'Very high',   maxReps:Infinity, credit:{hypertrophy:0.6, strength:0.2, endurance:0.9}}
  ],
  /* How close to failure the set felt. A set you could have doubled stimulates less. */
  effortFactor: {easy:0.5, med:0.85, hard:1.0},
  timedHoldCredit: 0.8,          // timed holds don't have reps; flat credit
  strengthIntentCredit: 0.5,     // cap for sets the user marked "strength" (hypertrophy goal)
  secondaryMuscleShare: 0.5,     // a secondary muscle banks half an effective set
  weeklyEffectiveSetTarget: 12,  // reference line for the per-muscle bars

  /* Load progression. Increases are a % of current load, rounded to the equipment
     step (or the exercise's own loadStep) and never smaller than that step. */
  load: {
    increasePctUpper: 2.5,
    increasePctLower: 5,
    minIncrementKg: 2.5,
    plateStepKg: 2.5,
    assistanceStepKg: 2.5,
    maxEffortToQualify: 2.4,     // 2 medium + 1 hard (2.33) still qualifies
    newLoadRepGrace: 2,          // right after a weight increase, this many reps under the range is still "stay"
    minIncrementByEquip: {barbell:2.5, dumbbell:2.5, kettlebell:4, cable:2.5, machine:2.5, smith:2.5, band:1, bodyweight:2.5, other:2.5}
  },
  lowRepWarningBelow: 7          // reps < 7 (i.e. the ≤6 strength bucket) trigger the warning
};

const DAY_KEYS = ['sun','mon','tue','wed','thu','fri','sat'];
const DAY_ORDER = ['mon','tue','wed','thu','fri','sat','sun'];
const DAY_LABELS = {sun:'Sunday',mon:'Monday',tue:'Tuesday',wed:'Wednesday',thu:'Thursday',fri:'Friday',sat:'Saturday'};
const EFFORT_LABELS = {easy:'Easy', med:'Medium', hard:'Hard'};
const EFFORT_SCORE = {easy:1, med:2, hard:3};
const METRIC_LABELS = { weight_reps:'Weight & reps', weighted_bw:'Bodyweight + added weight', reps_only:'Bodyweight reps', time:'Timed hold', assisted:'Assisted (lower is better)' };
const HYPE_MESSAGES = ['Nice rep! 💪','Great work!','Getting stronger every session!',"That's the way!",
  'Keep that momentum going!','Solid set!','Locked in 🔒','One step closer to your goal!','That looked strong!','Consistency wins — keep going!'];
const MOTIVATIONAL_QUOTES = [
  "Strong is a skill. You practice it every time you show up.",
  "The rep that feels hardest is the one that counts most.",
  "Small plates today, big totals tomorrow.",
  "Discipline beats motivation on the days it matters.",
  "Progress hides inside the sets you almost skipped.",
  "You don't rise to your goals, you fall to your training.",
  "Every session banked is a session your future self thanks you for.",
  "Nobody regrets a workout once it's done.",
  "Road to heaven feels like hell and road to hell feels like heaven.",
  "Show up tired. Leave honest.",
  "The bar does not care how you feel. Load it anyway.",
  "Missed days do not erase earned ones. Get the next one.",
  "Warm-ups are a promise. Keep it.",
  "One clean session beats three sloppy ones.",
  "Your split only works if you do.",
  "Log it. Memory lies. Numbers don't.",
  "Soreness is a receipt, not a plan.",
  "Rest days grow you. Skipping days stall you.",
  "If it was easy, you would not need a log.",
  "The last set is where the story changes.",
  "Leave a little in the tank and come back tomorrow.",
  "Form first. Ego later. PRs after that.",
  "You cannot rush a tendon. You can train around it.",
  "A boring workout still counts.",
  "Consistency is just repeating the unremarkable.",
  "Chase the next kilo, not the highlight reel.",
  "Your future squat is built on today's unsexy sets.",
  "Hunger for progress, patience for joints.",
  "The gym is a vote. Cast it.",
  "Start ugly. Finish logged.",
  "Bad sleep is not a hall pass. Scale the session, don't cancel it.",
  "Two more reps of honesty beat ten of theatre.",
  "If you can walk in, you can train something.",
  "Deload is training. Treat it like it matters.",
  "You get the body you recover for.",
  "Stop waiting to feel ready. Ready is after set one.",
  "The clock on the wall is not your coach. Your log is.",
  "Same hour, same bag, fewer negotiations.",
  "Progress is quiet until it isn't.",
  "Train the movement, not the mirror.",
  "A PR is a side effect. Showing up is the work.",
  "Do the session you planned, not the one you imagined.",
  "Heavy is relative. Effort is not.",
  "You are not late. You are here.",
  "The set you fear is usually the one you need.",
  "Grip the bar like you mean the next month.",
  "Sweat is optional. Intent is not.",
  "Make the next set cleaner than the last.",
  "Your program is a map. Walking it is the job.",
  "Skip the story. Do the warm-up.",
  "Today's medium effort is tomorrow's easy.",
  "Muscles forget less than you think. Habits forget faster.",
  "Keep the streak of not quitting.",
  "You don't need a perfect week. You need this hour.",
  "Load what you can own. Own what you load.",
  "The plate you added last month used to scare you.",
  "Slow down the eccentric. Speed up the decision to go.",
  "Train like someone who expects to be here next year.",
  "Pain is a signal. Discomfort is the course.",
  "Your best lift is still ahead if you keep receipts.",
  "Empty gym, full focus. Crowded gym, same focus.",
  "Finish the last exercise like it paid rent.",
  "Bonus sets are a gift. Don't spend them sloppy.",
  "If you logged it, it happened. If you didn't, it faded.",
  "Be the person who trains on ordinary Tuesdays.",
  "Strength is patience with a barbell.",
  "You can hate the session and still complete it.",
  "The body adapts to what you repeat, not what you intend.",
  "Leave the phone. Take the work.",
  "A short session done beats a long one postponed.",
  "Protect the joints. Attack the goal.",
  "You are building a habit, not a highlight.",
  "The hardest part was putting shoes on. You're past it.",
  "Count sets, not moods.",
  "Tomorrow's energy is bought with today's sleep and this session.",
  "Stay a beginner at effort. Stay a veteran at showing up.",
  "If the weight moves, you move with it. If it doesn't, you still tried.",
  "Your split is a contract with next week's you.",
  "Miss a lift, keep the session.",
  "There is no wasted warm-up.",
  "Do fewer things well. Then add.",
  "The rack will be there. Will you?",
  "Train with the lights on in your head.",
  "You don't need more hype. You need the first set.",
  "Hold the standard when the room is empty.",
  "Fatigue is information. Use it, don't obey it.",
  "Make today a brick, not a monument.",
  "The work is the same whether anyone watches.",
  "Stay kind to the body you are asking a lot from.",
  "A logged failure is still data.",
  "You get better in the gap between sessions, if you earned the gap.",
  "Stop shopping for a new plan. Finish this one.",
  "The next PR is hiding inside another ordinary week.",
  "Breathe, brace, go. Then write it down.",
  "You already chose the hard thing by arriving.",
  "Let the bar teach you what the mirror can't.",
  "Keep promises that only you can see.",
  "This hour is the whole point.",
  "Come back tomorrow. That is the whole method."
];

