/* ========================= §2 DOMAIN DATA ========================= */
/* Muscles: [name, region]. Adding one here makes it appear in the picker,
   the library, the Records tab and the alternatives engine automatically. */
const MUSCLE_DEFS = [
  ['Chest','Push'],['Shoulders','Push'],['Triceps','Push'],
  ['Lats','Pull'],['Upper Back','Pull'],['Rear Delts','Pull'],['Biceps','Pull'],['Forearms','Pull'],
  ['Quads','Legs'],['Hamstrings','Legs'],['Glutes','Legs'],['Calves','Legs'],
  ['Abs','Core'],['Lower Back','Core'],['Other','Other']
];
const MUSCLES = MUSCLE_DEFS.map(m=>m[0]);
const MUSCLE_REGION = Object.fromEntries(MUSCLE_DEFS);
const REGION_ORDER = ['Push','Pull','Legs','Core','Other'];
const MUSCLE_HINT = {
  'Chest':'Presses & flyes','Shoulders':'Front / side delts','Triceps':'Back of the arm',
  'Lats':'Pull-ups & pulldowns','Upper Back':'Rows, mid-back & traps','Rear Delts':'Face pulls & rear flyes',
  'Biceps':'Curls','Forearms':'Grip & wrists','Quads':'Squats, presses, extensions',
  'Hamstrings':'Hinges & leg curls','Glutes':'Thrusts & bridges','Calves':'Calf raises',
  'Abs':'Core work','Lower Back':'Extensions','Other':'Anything else'
};
const LEGACY_MUSCLE_MAP = {Chest:'Chest',Back:'Upper Back',Shoulders:'Shoulders',Triceps:'Triceps',
  Biceps:'Biceps',Legs:'Quads',Core:'Abs',Other:'Other'};
const LOWER_BODY_MUSCLES = new Set(['Quads','Hamstrings','Glutes','Calves','Lower Back']);

const PATTERN_LABELS = {
  horizontal_push:'horizontal press', vertical_push:'vertical press', chest_fly:'chest fly',
  horizontal_pull:'row', vertical_pull:'vertical pull', pullover:'straight-arm pullover',
  shrug:'shrug', rear_delt:'rear delt raise', lateral_raise:'lateral raise', front_raise:'front raise',
  elbow_extension:'triceps extension', elbow_flexion:'curl', wrist:'wrist flexion',
  squat:'squat', lunge:'lunge / split squat', hinge:'hip hinge', hip_thrust:'hip extension',
  knee_extension:'knee extension', knee_flexion:'knee flexion', calf_raise:'calf raise',
  crunch:'trunk flexion', anti_extension:'anti-extension hold', rotation:'rotation',
  extension:'back extension', carry:'loaded carry', other:'general'
};
/* Patterns in the same family are "close enough" to substitute for each other. */
const PATTERN_FAMILY = {
  horizontal_push:'press', vertical_push:'press',   chest_fly:'fly',
  rear_delt:'raise', lateral_raise:'raise', front_raise:'raise',
  horizontal_pull:'row', shrug:'row', vertical_pull:'pulldown', pullover:'pulldown',
  elbow_flexion:'curl', wrist:'curl', elbow_extension:'extend',
  squat:'squat', lunge:'squat', knee_extension:'squat',
  hinge:'hinge', hip_thrust:'hinge', knee_flexion:'hinge', extension:'hinge',
  calf_raise:'calf', crunch:'core', anti_extension:'core', rotation:'core', carry:'core', other:'other'
};
const EQUIPMENT_LABELS = {barbell:'Barbell',dumbbell:'Dumbbell',cable:'Cable',machine:'Machine',
  smith:'Smith machine',bodyweight:'Bodyweight',band:'Band',kettlebell:'Kettlebell',other:'Other'};

/* Canonical catalog.
   [name, primaryMuscle, secondaryMuscles, movementPattern, equipment, tier, metric, popularity] */
const CATALOG_RAW = [
  /* Chest */
  ['Bench Press','Chest',['Triceps','Shoulders'],'horizontal_push','barbell','compound','weight_reps',99],
  ['Incline Barbell Press','Chest',['Shoulders','Triceps'],'horizontal_push','barbell','compound','weight_reps',88],
  ['Dumbbell Press','Chest',['Triceps','Shoulders'],'horizontal_push','dumbbell','compound','weight_reps',92],
  ['Incline Dumbbell Press','Chest',['Shoulders','Triceps'],'horizontal_push','dumbbell','compound','weight_reps',90],
  ['Decline Press','Chest',['Triceps'],'horizontal_push','barbell','compound','weight_reps',62],
  ['Machine Chest Press','Chest',['Triceps','Shoulders'],'horizontal_push','machine','compound','weight_reps',70],
  ['Smith Machine Bench Press','Chest',['Triceps','Shoulders'],'horizontal_push','smith','compound','weight_reps',54],
  ['Chest Dip','Chest',['Triceps','Shoulders'],'vertical_push','bodyweight','compound','reps_only',66],
  ['Push-up','Chest',['Triceps','Shoulders','Abs'],'horizontal_push','bodyweight','compound','reps_only',86],
  ['Chest Fly','Chest',['Shoulders'],'chest_fly','dumbbell','isolation','weight_reps',74],
  ['Cable Crossover','Chest',['Shoulders'],'chest_fly','cable','isolation','weight_reps',72],
  ['Pec Deck','Chest',['Shoulders'],'chest_fly','machine','isolation','weight_reps',64],
  /* Shoulders */
  ['Overhead Press','Shoulders',['Triceps','Abs'],'vertical_push','barbell','compound','weight_reps',94],
  ['Dumbbell Shoulder Press','Shoulders',['Triceps'],'vertical_push','dumbbell','compound','weight_reps',88],
  ['Arnold Press','Shoulders',['Triceps'],'vertical_push','dumbbell','compound','weight_reps',66],
  ['Machine Shoulder Press','Shoulders',['Triceps'],'vertical_push','machine','compound','weight_reps',60],
  ['Landmine Press','Shoulders',['Chest','Triceps'],'vertical_push','barbell','compound','weight_reps',40],
  ['Lateral Raise','Shoulders',[],'lateral_raise','dumbbell','isolation','weight_reps',90],
  ['Cable Lateral Raise','Shoulders',[],'lateral_raise','cable','isolation','weight_reps',68],
  ['Machine Lateral Raise','Shoulders',[],'lateral_raise','machine','isolation','weight_reps',52],
  ['Front Raise','Shoulders',['Chest'],'front_raise','dumbbell','isolation','weight_reps',58],
  ['Upright Row','Shoulders',['Upper Back','Biceps'],'lateral_raise','barbell','compound','weight_reps',48],
  /* Triceps */
  ['Close-Grip Bench Press','Triceps',['Chest','Shoulders'],'horizontal_push','barbell','compound','weight_reps',74],
  ['Dips','Triceps',['Chest','Shoulders'],'vertical_push','bodyweight','compound','reps_only',80],
  ['Triceps Pushdown','Triceps',[],'elbow_extension','cable','isolation','weight_reps',92],
  ['Rope Pushdown','Triceps',[],'elbow_extension','cable','isolation','weight_reps',80],
  ['Overhead Triceps Extension','Triceps',[],'elbow_extension','cable','isolation','weight_reps',78],
  ['Skull Crusher','Triceps',[],'elbow_extension','barbell','isolation','weight_reps',76],
  ['Dumbbell Overhead Extension','Triceps',[],'elbow_extension','dumbbell','isolation','weight_reps',66],
  ['Triceps Kickback','Triceps',[],'elbow_extension','dumbbell','isolation','weight_reps',46],
  ['Bench Dip','Triceps',['Chest'],'vertical_push','bodyweight','isolation','reps_only',44],
  /* Lats */
  ['Pull-up','Lats',['Biceps','Upper Back'],'vertical_pull','bodyweight','compound','reps_only',95],
  ['Chin-up','Lats',['Biceps'],'vertical_pull','bodyweight','compound','reps_only',82],
  ['Assisted Pull-up','Lats',['Biceps','Upper Back'],'vertical_pull','machine','compound','assisted',70],
  ['Lat Pulldown','Lats',['Biceps','Upper Back'],'vertical_pull','cable','compound','weight_reps',93],
  ['Close-Grip Lat Pulldown','Lats',['Biceps'],'vertical_pull','cable','compound','weight_reps',72],
  ['Dumbbell Row','Lats',['Upper Back','Biceps'],'horizontal_pull','dumbbell','compound','weight_reps',86],
  ['Straight-Arm Pulldown','Lats',['Upper Back'],'pullover','cable','isolation','weight_reps',60],
  ['Dumbbell Pullover','Lats',['Chest'],'pullover','dumbbell','isolation','weight_reps',50],
  /* Upper Back */
  ['Barbell Row','Upper Back',['Lats','Biceps','Rear Delts'],'horizontal_pull','barbell','compound','weight_reps',90],
  ['Seated Cable Row','Upper Back',['Lats','Biceps','Rear Delts'],'horizontal_pull','cable','compound','weight_reps',88],
  ['T-Bar Row','Upper Back',['Lats','Biceps'],'horizontal_pull','machine','compound','weight_reps',70],
  ['Chest-Supported Row','Upper Back',['Lats','Rear Delts'],'horizontal_pull','machine','compound','weight_reps',68],
  ['Pendlay Row','Upper Back',['Lats','Biceps'],'horizontal_pull','barbell','compound','weight_reps',58],
  ['Inverted Row','Upper Back',['Lats','Biceps'],'horizontal_pull','bodyweight','compound','reps_only',48],
  ['Shrug','Upper Back',['Forearms'],'shrug','dumbbell','isolation','weight_reps',66],
  ['Barbell Shrug','Upper Back',['Forearms'],'shrug','barbell','isolation','weight_reps',60],
  /* Rear Delts */
  ['Face Pull','Rear Delts',['Upper Back'],'rear_delt','cable','isolation','weight_reps',84],
  ['Rear Delt Fly','Rear Delts',['Upper Back'],'rear_delt','dumbbell','isolation','weight_reps',78],
  ['Reverse Pec Deck','Rear Delts',['Upper Back'],'rear_delt','machine','isolation','weight_reps',64],
  ['Cable Rear Delt Fly','Rear Delts',['Upper Back'],'rear_delt','cable','isolation','weight_reps',56],
  ['Band Pull-Apart','Rear Delts',['Upper Back'],'rear_delt','band','isolation','reps_only',42],
  /* Biceps */
  ['Barbell Curl','Biceps',['Forearms'],'elbow_flexion','barbell','isolation','weight_reps',92],
  ['Dumbbell Curl','Biceps',['Forearms'],'elbow_flexion','dumbbell','isolation','weight_reps',90],
  ['Hammer Curl','Biceps',['Forearms'],'elbow_flexion','dumbbell','isolation','weight_reps',86],
  ['Cable Curl','Biceps',['Forearms'],'elbow_flexion','cable','isolation','weight_reps',72],
  ['Preacher Curl','Biceps',[],'elbow_flexion','barbell','isolation','weight_reps',70],
  ['EZ-Bar Curl','Biceps',['Forearms'],'elbow_flexion','barbell','isolation','weight_reps',68],
  ['Incline Dumbbell Curl','Biceps',[],'elbow_flexion','dumbbell','isolation','weight_reps',60],
  ['Concentration Curl','Biceps',[],'elbow_flexion','dumbbell','isolation','weight_reps',58],
  /* Forearms */
  ["Farmer's Carry",'Forearms',['Upper Back','Abs'],'carry','dumbbell','compound','time',40],
  ['Reverse Curl','Forearms',['Biceps'],'elbow_flexion','barbell','isolation','weight_reps',44],
  ['Wrist Curl','Forearms',[],'wrist','dumbbell','isolation','weight_reps',38],
  /* Quads */
  ['Squat','Quads',['Glutes','Hamstrings','Abs'],'squat','barbell','compound','weight_reps',99],
  ['Leg Press','Quads',['Glutes','Hamstrings'],'squat','machine','compound','weight_reps',92],
  ['Lunges','Quads',['Glutes','Hamstrings'],'lunge','dumbbell','compound','weight_reps',80],
  ['Bulgarian Split Squat','Quads',['Glutes'],'lunge','dumbbell','compound','weight_reps',74],
  ['Hack Squat','Quads',['Glutes'],'squat','machine','compound','weight_reps',70],
  ['Front Squat','Quads',['Glutes','Abs'],'squat','barbell','compound','weight_reps',68],
  ['Walking Lunge','Quads',['Glutes'],'lunge','dumbbell','compound','weight_reps',64],
  ['Goblet Squat','Quads',['Glutes'],'squat','dumbbell','compound','weight_reps',60],
  ['Smith Machine Squat','Quads',['Glutes'],'squat','smith','compound','weight_reps',52],
  ['Step-Up','Quads',['Glutes'],'lunge','dumbbell','compound','weight_reps',50],
  ['Leg Extension','Quads',[],'knee_extension','machine','isolation','weight_reps',86],
  /* Hamstrings */
  ['Deadlift','Hamstrings',['Glutes','Lower Back','Upper Back','Lats'],'hinge','barbell','compound','weight_reps',97],
  ['Romanian Deadlift','Hamstrings',['Glutes','Lower Back'],'hinge','barbell','compound','weight_reps',90],
  ['Stiff-Leg Deadlift','Hamstrings',['Glutes','Lower Back'],'hinge','barbell','compound','weight_reps',66],
  ['Dumbbell Romanian Deadlift','Hamstrings',['Glutes'],'hinge','dumbbell','compound','weight_reps',62],
  ['Good Morning','Hamstrings',['Glutes','Lower Back'],'hinge','barbell','compound','weight_reps',48],
  ['Leg Curl','Hamstrings',['Calves'],'knee_flexion','machine','isolation','weight_reps',88],
  ['Seated Leg Curl','Hamstrings',[],'knee_flexion','machine','isolation','weight_reps',72],
  ['Nordic Curl','Hamstrings',['Glutes'],'knee_flexion','bodyweight','isolation','reps_only',40],
  /* Glutes */
  ['Hip Thrust','Glutes',['Hamstrings'],'hip_thrust','barbell','compound','weight_reps',82],
  ['Sumo Deadlift','Glutes',['Hamstrings','Quads','Lower Back'],'hinge','barbell','compound','weight_reps',64],
  ['Glute Bridge','Glutes',['Hamstrings'],'hip_thrust','bodyweight','compound','reps_only',52],
  ['Hip Abduction','Glutes',[],'hip_thrust','machine','isolation','weight_reps',50],
  ['Cable Kickback','Glutes',['Hamstrings'],'hip_thrust','cable','isolation','weight_reps',44],
  /* Calves */
  ['Calf Raise','Calves',[],'calf_raise','machine','isolation','weight_reps',84],
  ['Standing Calf Raise','Calves',[],'calf_raise','machine','isolation','weight_reps',78],
  ['Seated Calf Raise','Calves',[],'calf_raise','machine','isolation','weight_reps',70],
  ['Calf Press','Calves',[],'calf_raise','machine','isolation','weight_reps',56],
  /* Abs */
  ['Plank','Abs',[],'anti_extension','bodyweight','isolation','time',88],
  ['Hanging Leg Raise','Abs',['Quads'],'crunch','bodyweight','isolation','reps_only',74],
  ['Crunch','Abs',[],'crunch','bodyweight','isolation','reps_only',72],
  ['Cable Crunch','Abs',[],'crunch','cable','isolation','weight_reps',70],
  ['Hanging Knee Raise','Abs',[],'crunch','bodyweight','isolation','reps_only',62],
  ['Ab Wheel Rollout','Abs',['Lats'],'anti_extension','other','isolation','reps_only',60],
  ['Russian Twist','Abs',[],'rotation','bodyweight','isolation','reps_only',58],
  ['Side Plank','Abs',[],'anti_extension','bodyweight','isolation','time',56],
  ['Cable Woodchop','Abs',[],'rotation','cable','isolation','weight_reps',44],
  ['Mountain Climber','Abs',['Quads'],'crunch','bodyweight','isolation','reps_only',40],
  ['Incline Treadmill Walk','Other',['Quads','Calves'],'other','machine','isolation','time',55],
  /* Lower Back */
  ['Back Extension','Lower Back',['Glutes','Hamstrings'],'extension','bodyweight','isolation','reps_only',56],
  ['Hyperextension','Lower Back',['Glutes','Hamstrings'],'extension','machine','isolation','weight_reps',44]
];
const CATALOG = CATALOG_RAW.map(r=>({name:r[0],primary:r[1],secondary:r[2],pattern:r[3],equipment:r[4],tier:r[5],metric:r[6],popularity:r[7]}));
const CATALOG_BY_NAME = {}; CATALOG.forEach(c=>{ CATALOG_BY_NAME[c.name.toLowerCase()] = c; });

