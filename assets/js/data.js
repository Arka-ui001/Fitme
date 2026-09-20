window.FORGE_DATA = {
  user: { name: "", initial: "", height_cm: 0, birth_year: 0, unit: "metric" },
  dashboard: {
    metrics: {
      bodyweight: { value: 0, unit: "kg", decimals: 1, delta: { text: "No data", dir: "flat" }, spark: [] },
      protein: { value: 0, unit: "g", target: 130, targetLabel: "Target: 130 g", progress: 0 },
      calories: { value: 0, unit: "kcal", target: 2500, targetLabel: "Target: 2,500 kcal", progress: 0 },
      training: { value: 0, unit: "/ 5 sessions", targetLabel: "This week", progress: 0 }
    },
    insight: { text: "No data available.", confidence: 0, evidenceCount: 0, updated: "", sources: [] }
  },
  bodyProgress: { views: ["Front", "Side", "Back"], reliability: { label: "No comparison data", level: "low", poseMatch: 0, photoSessions: 0 }, sessions: [] },
  muscles: [],
  training: {
    weeklyVolume: { unit: "t", labels: [], values: [] },
    strength: { labels: [], series: [], note: "Estimated 1RM (kg)" },
    consistency: { weeks: [] },
    muscleVolume: []
  },
  nutrition: {
    today: {
      calories: { value: 0, target: 2500 },
      macros: [
        { key: "protein", label: "Protein", value: 0, target: 130, unit: "g", color: "var(--accent)" },
        { key: "carbs", label: "Carbs", value: 0, target: 340, unit: "g", color: "var(--cyan)" },
        { key: "fat", label: "Fat", value: 0, target: 80, unit: "g", color: "var(--blue)" },
        { key: "fiber", label: "Fiber", value: 0, target: 30, unit: "g", color: "var(--purple)" }
      ],
      proteinRemaining: 130,
      water: { value: 0, target: 3.5, unit: "L" }
    },
    meals: [],
    weekly: { labels: [], values: [], target: 2500 }
  },
  workouts: {
    today: { title: "Rest day", date: "", status: "up_next", exercises: [] },
    week: { plan: [] },
    prs: []
  },
  progress: {
    weight: { points: [] },
    measurements: { current: "", previous: "", rows: [] },
    observations: []
  },
  history: [],
  evaluation: {
    stats: { total: 0, correctPct: 0, incorrectPct: 0, avgConfidence: 0 },
    items: []
  },
  coach: { threads: [], conversations: {} },
  analysis: {
    pipeline: [],
    result: { title: "No analysis available", analysis: "", evidence: [], confidence: 0, limitations: [], recommendations: [] },
    recent: []
  }
};
