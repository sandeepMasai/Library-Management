const PlanConfig = require("../../models/PlanConfig");

const DEFAULT_PLANS = {
  monthly: { title: "Pro Monthly", price: 999, durationDays: 30 },
  "6month": { title: "Pro 6 Month", price: 4999, durationDays: 180 },
  yearly: { title: "Pro Yearly", price: 9999, durationDays: 365 },
};

async function ensurePlanConfigSeeded() {
  const keys = Object.keys(DEFAULT_PLANS);
  const existing = await PlanConfig.find({ key: { $in: keys } }).select("key").lean();
  const have = new Set((existing || []).map((x) => x.key));

  const toInsert = [];
  for (const key of keys) {
    if (have.has(key)) continue;
    toInsert.push({ key, ...DEFAULT_PLANS[key] });
  }

  if (toInsert.length) {
    try {
      await PlanConfig.insertMany(toInsert, { ordered: false });
    } catch (_e) {
      // ignore duplicate insert races
    }
  }
}

async function listPlanDefs() {
  await ensurePlanConfigSeeded();
  const rows = await PlanConfig.find({ active: true }).select("key title price durationDays").lean();
  const byKey = new Map((rows || []).map((r) => [String(r.key), r]));
  return ["monthly", "6month", "yearly"].map((key) => {
    const row = byKey.get(key) || { key, ...DEFAULT_PLANS[key] };
    return {
      key,
      title: row.title || DEFAULT_PLANS[key].title,
      price: Number(row.price ?? DEFAULT_PLANS[key].price),
      durationDays: Number(row.durationDays ?? DEFAULT_PLANS[key].durationDays),
    };
  });
}

async function getPlanDef(plan) {
  const key = String(plan || "").trim().toLowerCase();
  if (!DEFAULT_PLANS[key]) return null;
  await ensurePlanConfigSeeded();
  const row = await PlanConfig.findOne({ key, active: true }).select("key title price durationDays").lean();
  const def = DEFAULT_PLANS[key];
  return {
    key,
    title: row?.title || def.title,
    price: Number(row?.price ?? def.price),
    durationDays: Number(row?.durationDays ?? def.durationDays),
  };
}

module.exports = {
  DEFAULT_PLANS,
  ensurePlanConfigSeeded,
  listPlanDefs,
  getPlanDef,
};

