export const MPLH_TARGETS = {
  secondary: { label: "Secondary", min: 18, max: 20 },
  elementary_prep: { label: "Elementary Prep", min: 20, max: 22 },
  elementary_nnc: { label: "Elementary NNC", min: 24, max: 25 },
  special: { label: "Special Education", min: 24, max: 25 },
  special_ed: { label: "Special Education", min: 24, max: 25 },
};

const SCHOOL_TARGET_EXCEPTIONS = {
  "3452": MPLH_TARGETS.elementary_prep,
  "1957": MPLH_TARGETS.elementary_prep,
};

export function getMplhTarget(school) {
  const locationCode = String(school?.location_code || "").trim();
  const exception = SCHOOL_TARGET_EXCEPTIONS[locationCode];
  if (exception) return exception;

  if (
    String(school?.source_site_id || "").trim() === "1195701" ||
    /willenberg/i.test(String(school?.school_name || ""))
  ) {
    return MPLH_TARGETS.elementary_prep;
  }

  return MPLH_TARGETS[school?.labor_type] || {
    label: "Not Classified",
    min: null,
    max: null,
  };
}

