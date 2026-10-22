/* ============================ §1 CONFIG ============================ */
const APP_NAME = "TrackA'gain";
/* Stamped by the release script (trackagain-capacitor-project/trackagain/release.ps1); don't edit by hand. */
const APP_VERSION = '1.6.0';
const APP_BUILD = 7;
const SITE_URL = 'https://nirray2392.github.io/TrackAgain/';
const UPDATE_URL = SITE_URL + 'version.json';
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
    minIncrementByEquip: {barbell:2.5, dumbbell:2.5, kettlebell:4, cable:5, machine:5, smith:2.5, band:1, bodyweight:2.5, other:2.5}
  },
  lowRepWarningBelow: 7          // reps < 7 (i.e. the ≤6 strength bucket) trigger the warning
};

const DAY_KEYS = ['sun','mon','tue','wed','thu','fri','sat'];
const DAY_ORDER = ['mon','tue','wed','thu','fri','sat','sun'];
const DAY_LABELS = {sun:'Sunday',mon:'Monday',tue:'Tuesday',wed:'Wednesday',thu:'Thursday',fri:'Friday',sat:'Saturday'};
const EFFORT_LABELS = {easy:'Easy', med:'Medium', hard:'Hard'};
const EFFORT_SCORE = {easy:1, med:2, hard:3};

/* Everyday bodyweight basics (~9 min) — same list for every training day. No bands/tools. */
const WARMUP_BASICS = [
  { title:'Easy march or arm circles', detail:'Raise your pulse', minutes:3, primary:'Other',
    howTo:'March in place or swing your arms in big easy circles. Breathe steadily and stay relaxed — just raise your heart rate a little, not a sprint.' },
  { title:'Cat-cow', detail:'6–8 slow', minutes:2, primary:'Abs',
    howTo:'On hands and knees, round your back toward the ceiling (cat), then tip your pelvis and lift your chest (cow). Move slowly with your breath. Soft elbows, no forcing the stretch.' },
  { title:'Bodyweight squat + leg swings', detail:'10 each', minutes:2, primary:'Quads',
    howTo:'Do ~10 easy bodyweight squats — sit back, heels down, knees tracking over toes. Then hold a wall or stand tall and swing one leg forward/back ~10 times each side. Keep it loose and controlled.' },
  { title:'Scap push-ups or wall slides', detail:'2×8–10', minutes:2, primary:'Shoulders',
    howTo:'Scap push-ups: in a plank or knee plank, lock your elbows and only move the shoulder blades — sink them together, then push the floor away. Or face a wall, arms in a goal-post shape, and slide them up and down while keeping contact with the wall.' }
];
/* Full bodyweight warm-up catalog for the Warm-up library (no bands/tools). */
const WARMUP_LIBRARY_SEED = [
  { title:'Easy march or arm circles', detail:'Raise your pulse', minutes:3, primary:'Other',
    howTo:'March in place or swing your arms in big easy circles. Breathe steadily and stay relaxed — just raise your heart rate a little, not a sprint.' },
  { title:'Light walk in place', detail:'2 min', minutes:2, primary:'Other',
    howTo:'Walk in place at an easy pace. Swing your arms naturally. You should be able to talk — this is only to wake the body up.' },
  { title:'Jumping jacks', detail:'30–45s easy', minutes:2, primary:'Other',
    howTo:'Jump feet out while raising arms overhead, then back in. Keep landings soft. Go easy for 30–45 seconds; stop if it feels like a workout.' },
  { title:'Scap push-ups', detail:'2×10 easy', minutes:2, primary:'Chest',
    howTo:'Hold a plank or knee plank with straight elbows. Only move the shoulder blades: squeeze them together, then push the floor away to round the upper back. Arms stay locked.' },
  { title:'Easy push-ups', detail:'2×8–12', minutes:2, primary:'Chest',
    howTo:'Hands under shoulders, body in a straight line (knees down is fine). Lower with control and press up without rushing. Stop well before failure — this is a warm-up.' },
  { title:'Arm circles', detail:'10–15 each way', minutes:2, primary:'Shoulders',
    howTo:'Stand tall, arms out to the sides. Draw small then larger circles forward, then reverse. Keep shoulders down away from your ears.' },
  { title:'Wall slides', detail:'2×10', minutes:2, primary:'Shoulders',
    howTo:'Back and arms against a wall, elbows bent like a goal post. Slide arms up as far as you can without ribs flaring or losing wall contact, then slide back down.' },
  { title:'Cuff circles', detail:'10 each way', minutes:1, primary:'Shoulders',
    howTo:'Elbows bent ~90° at your sides. Rotate the forearms in small circles as if drawing with your fists. Slow and smooth — warm the shoulder joint, don’t swing hard.' },
  { title:'Diamond push-up holds', detail:'2×20–30s easy', minutes:2, primary:'Triceps',
    howTo:'Hands close so thumbs and index fingers form a diamond under your chest. Lower a little or stay in a high plank and hold. Breathe; exit before it shakes hard.' },
  { title:'Close-grip push-ups', detail:'2×6–10 easy', minutes:2, primary:'Triceps',
    howTo:'Hands narrower than shoulders, elbows tracking close to your ribs. Lower and press with control. Knees down is fine — keep reps easy.' },
  { title:'Dead hang', detail:'2×20–30s', minutes:2, primary:'Lats',
    howTo:'Hang from a bar with a comfortable grip, arms straight, shoulders gently active (not fully shrugged into your ears). Breathe and relax the legs. Drop early if grip fails.' },
  { title:'Scap pull-ups', detail:'2×8–10', minutes:2, primary:'Lats',
    howTo:'Hang from a bar with straight elbows. Only move the shoulder blades: pull them down and back to lift the body a little, then return to a dead hang. Arms stay straight the whole time.' },
  { title:'Prone Y-raises', detail:'2×12', minutes:2, primary:'Upper Back',
    howTo:'Lie face down, arms in a Y overhead, thumbs up. Lift arms a few inches off the floor by squeezing the upper back, then lower slowly. Chin tucked, glutes lightly on.' },
  { title:'Prone T-Y-W', detail:'6–8 each', minutes:2, primary:'Upper Back',
    howTo:'Face down. Lift into a T (arms out), then Y (arms up), then W (elbows bent by your sides). Small lifts, squeeze the mid-back, and keep the neck long.' },
  { title:'Reverse snow angels', detail:'2×10 slow', minutes:2, primary:'Upper Back',
    howTo:'Lie face down, arms by your sides. Sweep them out and up overhead along the floor (or hovering), then back down — like a snow angel in reverse. Move slowly and keep contact light.' },
  { title:'Prone rear-delt raises', detail:'2×12', minutes:2, primary:'Rear Delts',
    howTo:'Face down, arms out in a T, thumbs up or palms down. Lift the arms by squeezing the rear shoulders, then lower. Tiny range is fine — feel the back of the shoulders work.' },
  { title:'Face-down W holds', detail:'2×20s', minutes:2, primary:'Rear Delts',
    howTo:'Lie face down, elbows bent into a W, thumbs pointing up. Lift elbows and hands slightly and hold. Squeeze the rear delts and mid-back; keep the forehead lightly on the floor or a towel.' },
  { title:'Empty-hand curl pumps', detail:'2×15 easy', minutes:2, primary:'Biceps',
    howTo:'Stand tall with empty hands. Curl your fists up toward your shoulders, then lower them. Squeeze gently at the top and keep your elbows by your sides. No equipment.' },
  { title:'Wrist circles + grip squeezes', detail:'60s', minutes:1, primary:'Forearms',
    howTo:'Circle both wrists slowly each way, then make fists and squeeze hard for a second and release. Keep shoulders relaxed. About a minute total is enough.' },
  { title:'Bodyweight squats', detail:'2×10 easy', minutes:2, primary:'Quads',
    howTo:'Feet about shoulder-width. Sit the hips back and down, chest up, then stand. Heels stay down. Move smoothly — these are warm-up reps, not a max set.' },
  { title:'Bodyweight squat + leg swings', detail:'10 each', minutes:2, primary:'Quads',
    howTo:'Do ~10 easy bodyweight squats — sit back, heels down, knees tracking over toes. Then hold a wall or stand tall and swing one leg forward/back ~10 times each side. Keep it loose and controlled.' },
  { title:'Walking lunges (bodyweight)', detail:'10 each leg', minutes:2, primary:'Quads',
    howTo:'Step forward into a lunge, both knees ~90°, then push to the next step. Torso upright, front knee over mid-foot. Short steps are fine; stay easy.' },
  { title:'Leg swings', detail:'10 each way', minutes:2, primary:'Hamstrings',
    howTo:'Hold a wall for balance. Swing one leg forward and back like a pendulum, then side to side if space allows. Loose hips, no forcing the end range.' },
  { title:'Bodyweight good mornings', detail:'2×10 slow', minutes:2, primary:'Hamstrings',
    howTo:'Soft knees, hands on hips or behind your head. Hinge at the hips, push them back, keep a flat back, then stand tall by squeezing the glutes. Move slowly.' },
  { title:'Hip hinge drills', detail:'8–10', minutes:2, primary:'Hamstrings',
    howTo:'Practice pushing the hips back with a flat back and soft knees — as if closing a car door with your hips. Feel a stretch in the hamstrings, then return to standing. No weight needed.' },
  { title:'Glute bridges', detail:'2×12', minutes:2, primary:'Glutes',
    howTo:'Lie on your back, knees bent, feet flat. Drive through the heels to lift the hips, squeeze the glutes at the top, then lower with control. Don’t over-arch the low back.' },
  { title:'Single-leg glute bridge', detail:'8 each side', minutes:2, primary:'Glutes',
    howTo:'Same as a glute bridge, but one foot stays planted and the other leg is bent or extended. Push through the working heel, keep hips level, and switch sides.' },
  { title:'Ankle circles + calf raises', detail:'2×15', minutes:2, primary:'Calves',
    howTo:'Circle each ankle slowly both ways, then rise onto the balls of your feet and lower. Hold a wall if needed. Easy range — warm the ankles and calves.' },
  { title:'Cat-cow', detail:'6–8 slow', minutes:2, primary:'Abs',
    howTo:'On hands and knees, round your back toward the ceiling (cat), then tip your pelvis and lift your chest (cow). Move slowly with your breath. Soft elbows, no forcing the stretch.' },
  { title:'Cat-cow + dead bug', detail:'6–8 each', minutes:2, primary:'Abs',
    howTo:'Do a few slow cat-cows, then lie on your back. Arms up, knees bent over hips. Lower opposite arm and leg toward the floor without the low back arching, then switch.' },
  { title:'Dead bug', detail:'6–8 each side', minutes:2, primary:'Abs',
    howTo:'On your back, arms toward the ceiling, knees bent over hips. Press the low back gently into the floor. Extend opposite arm and leg slowly, return, then switch. Breathe out as you extend.' },
  { title:'Bird dog', detail:'6 each side', minutes:2, primary:'Abs',
    howTo:'On hands and knees, reach one arm forward and the opposite leg back. Keep hips square and spine long. Pause briefly, return, then switch. Move slow — no wobbling for speed.' },
  { title:'Cat-cow + bird dog', detail:'6 each side', minutes:2, primary:'Lower Back',
    howTo:'A few slow cat-cows to loosen the spine, then bird dogs: opposite arm and leg reach long while hips stay level. Soft and controlled.' },
  { title:'Cat-cow + hip hinge drills', detail:'8–10', minutes:2, primary:'Lower Back',
    howTo:'Start with slow cat-cows on all fours. Stand and practice easy hip hinges — hips back, flat back, soft knees — then stand tall. Wake the hinge pattern before loading.' }
];
const METRIC_LABELS = { weight_reps:'Weight & reps', weighted_bw:'Bodyweight + added weight', reps_only:'Bodyweight reps', time:'Timed hold', assisted:'Assisted (lower is better)' };
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

