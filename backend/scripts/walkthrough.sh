#!/usr/bin/env bash
# ForgeAI backend — end-to-end API walkthrough (dev verification)
set -e
BASE="${BASE:-http://127.0.0.1:9901}"
PY="${PY:-python3}"

echo "== health =="
curl -s "$BASE/health"; echo

echo "== login =="
TOKEN=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"demo@forgeai.dev","password":"forgeai-demo"}' \
  | "$PY" -c "import sys,json; print(json.load(sys.stdin)['data']['access_token'])")
AUTH="Authorization: Bearer $TOKEN"
echo "  token acquired"

echo "== dashboard =="
curl -s "$BASE/api/dashboard" -H "$AUTH" | "$PY" -c "
import sys, json
d = json.load(sys.stdin)['data']
w, n, t = d['weight'], d['nutrition'], d['training']
print(f\"  weight {w['current_kg']} kg ({w['change_30d_kg']:+}/30d, {w['rate_per_week_kg']}/wk) | spark {len(w['spark'])} pts\")
print(f\"  today {n['today']['calories']} kcal / {n['today']['protein']} g protein | avg7d {n['averages_7d']['calories']} kcal\")
print(f\"  training {t['sessions_this_week']}/{t['target_per_week']} | strength {[s['exercise'] for s in t['strength_trends']]}\")
print(f\"  insight[{d['latest_insight']['confidence']}]: {d['latest_insight']['text'][:80]}...\")
print(f\"  trends: {[(m['muscle_group'], m['trend']) for m in d['muscle_trends']]}\")
"

echo "== workouts =="
curl -s "$BASE/api/workouts" -H "$AUTH" | "$PY" -c "
import sys, json
d = json.load(sys.stdin)['data']
print(f\"  sessions {len(d['sessions'])} | PRs {[(p['exercise'], str(p['weight'])+'kg x'+str(p['reps'])) for p in d['prs']]}\")
print(f\"  week trained: {sum(1 for x in d['week'] if x['trained'])}/7\")
"

echo "== nutrition =="
curl -s "$BASE/api/nutrition" -H "$AUTH" | "$PY" -c "
import sys, json
d = json.load(sys.stdin)['data']
print(f\"  today {d['today']['calories']} kcal / {d['today']['protein']} g | meals {len(d['meals'])} | avg7d {d['weekly']['averages']['calories']} kcal\")
"

echo "== progress =="
curl -s "$BASE/api/progress" -H "$AUTH" | "$PY" -c "
import sys, json
d = json.load(sys.stdin)['data']
print(f\"  weight points {len(d['weight_points'])} | measurements {len(d['measurements'])} | photo sessions {len(d['photos']['sessions'])} | observations {len(d['observations'])}\")
"

echo "== log a weight =="
curl -s -X POST "$BASE/api/progress/weight" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"weight": 63.7, "notes": "e2e walkthrough"}' | head -c 160; echo

echo "== log measurements =="
curl -s -X POST "$BASE/api/progress/measurements" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"waist": 72.8, "chest": 98.2}' | head -c 160; echo

echo "== create workout + sets =="
SID=$(curl -s -X POST "$BASE/api/workouts" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"name":"Walkthrough","duration":45,"sets":[{"exercise":"Bench Press","muscle_group":"chest","set_number":1,"weight":26,"reps":8,"rir":2}]}' \
  | "$PY" -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
echo "  session #$SID created"
curl -s -X POST "$BASE/api/workouts/$SID/sets" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"sets":[{"exercise":"Bench Press","set_number":2,"weight":26,"reps":7,"rir":2}]}' \
  | "$PY" -c "import sys,json; d=json.load(sys.stdin)['data']; print(f'  now {len(d[\"sets\"])} sets, volume {d[\"volume_kg\"]} kg')"

echo "== log a meal =="
curl -s -X POST "$BASE/api/nutrition/meals" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"meal_type":"snack","logs":[{"food_item_id":6,"quantity":1}]}' \
  | "$PY" -c "import sys,json; d=json.load(sys.stdin)['data']; print(f\"  logged → daily {d['daily_totals']['calories']} kcal / {d['daily_totals']['protein']} g protein\")"

echo "== photo analysis (multipart) =="
PNG="89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c626001000000ffff03000006000557bfabd40000000049454e44ae426082"
"$PY" -c "import sys; sys.stdout.buffer.write(bytes.fromhex('$PNG'))" > /tmp/walkthrough.png
AID=$(curl -s -X POST "$BASE/api/analysis/photo" -H "$AUTH" \
  -F "file=@/tmp/walkthrough.png;type=image/png" \
  -F "photo_type=front" -F "bodyweight=63.7" -F "notes=walkthrough" \
  | "$PY" -c "import sys,json; d=json.load(sys.stdin)['data']; print(d['analysis_id'])")
echo "  analysis #$AID created"
curl -s "$BASE/api/analysis/$AID" -H "$AUTH" | "$PY" -c "
import sys, json
d = json.load(sys.stdin)['data']
print(f\"  kind={d['kind']} model={d['model_name']} conf={d['confidence']}\")
print(f\"  sections: {sorted(d['analysis'].keys())}\")
"

echo "== video analysis =="
printf '\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom\x00\x00\x00\x00' > /tmp/walkthrough.mp4
head -c 512 /dev/zero >> /tmp/walkthrough.mp4
VID=$(curl -s -X POST "$BASE/api/analysis/video" -H "$AUTH" \
  -F "file=@/tmp/walkthrough.mp4;type=video/mp4" -F "exercise=Squat" -F "duration=45" \
  | "$PY" -c "import sys,json; print(json.load(sys.stdin)['data']['analysis_id'])")
curl -s "$BASE/api/analysis/$VID?kind=video" -H "$AUTH" | "$PY" -c "
import sys, json
d = json.load(sys.stdin)['data']
print(f\"  kind={d['kind']} exercise={d['media']['exercise']} conf={d['confidence']}\")
"

echo "== coach chat =="
CID=$(curl -s -X POST "$BASE/api/coach/chat" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"message":"How is my protein looking this week?"}' \
  | "$PY" -c "import sys,json; d=json.load(sys.stdin)['data']; print(d['conversation_id'])")
curl -s -X POST "$BASE/api/coach/chat" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"message\":\"Should I change anything about my training plan?\",\"conversation_id\":$CID}" \
  | "$PY" -c "
import sys, json
d = json.load(sys.stdin)['data']
print(f\"  reply: {d['reply']['content'][:100]}...\")
print(f\"  confidence {d['confidence']} | evidence {d['evidence'][:2]}\")
"

echo "== evaluation feedback =="
RID=$(curl -s "$BASE/api/dashboard" -H "$AUTH" | "$PY" -c "import sys,json; print(json.load(sys.stdin)['data']['latest_insight']['report_id'])")
curl -s -X POST "$BASE/api/evaluations/$RID/feedback" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"feedback":"partially_correct","comment":"protein part right, training part off"}' \
  | "$PY" -c "import sys,json; d=json.load(sys.stdin)['data']; print(f\"  feedback recorded: report #{d['report_id']} → {d['feedback']}\")"

echo "== evaluations list =="
curl -s "$BASE/api/evaluations" -H "$AUTH" | "$PY" -c "
import sys, json
d = json.load(sys.stdin)['data']
print(f\"  {d['stats']['total']} reports, {d['stats']['evaluated']} evaluated\")
"

echo "== files (serve uploaded photo by key) =="
KEY=$(curl -s "$BASE/api/analysis/$AID" -H "$AUTH" | "$PY" -c "import sys,json; print(json.load(sys.stdin)['data']['media']['file_key'])")
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/files/$KEY" -H "$AUTH")
echo "  GET /api/files/$KEY → $CODE"

echo "== unauthorized check =="
curl -s -o /dev/null -w "  dashboard without token → %{http_code}\n" "$BASE/api/dashboard"

echo "ALL WALKTHROUGH STEPS DONE ✔"
