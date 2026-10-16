// Local, offline time zone search: US states, major cities and zone names/abbreviations → IANA zones.
// No external API. Values are always IANA zone ids.

export const ZONE_LABELS: Record<string, string> = {
  "America/New_York": "Eastern (New York)",
  "America/Detroit": "Eastern (Detroit)",
  "America/Indiana/Indianapolis": "Eastern (Indianapolis)",
  "America/Kentucky/Louisville": "Eastern (Louisville)",
  "America/Chicago": "Central (Chicago)",
  "America/Menominee": "Central (Menominee)",
  "America/Denver": "Mountain (Denver)",
  "America/Boise": "Mountain (Boise)",
  "America/Phoenix": "Mountain, no DST (Phoenix)",
  "America/Los_Angeles": "Pacific (Los Angeles)",
  "America/Anchorage": "Alaska (Anchorage)",
  "Pacific/Honolulu": "Hawaii (Honolulu)",
  "America/Puerto_Rico": "Atlantic (Puerto Rico)",
};

export function zoneLabel(zone: string): string {
  return ZONE_LABELS[zone] || zone.replace(/_/g, " ");
}

const E = "America/New_York", C = "America/Chicago", M = "America/Denver", P = "America/Los_Angeles";

// [abbr, name, zones (likely first)]
export const STATES: [string, string, string[]][] = [
  ["AL", "Alabama", [C]], ["AK", "Alaska", ["America/Anchorage"]], ["AZ", "Arizona", ["America/Phoenix"]],
  ["AR", "Arkansas", [C]], ["CA", "California", [P]], ["CO", "Colorado", [M]], ["CT", "Connecticut", [E]],
  ["DE", "Delaware", [E]], ["DC", "District of Columbia", [E]], ["FL", "Florida", [E, C]], ["GA", "Georgia", [E]],
  ["HI", "Hawaii", ["Pacific/Honolulu"]], ["ID", "Idaho", ["America/Boise", P]], ["IL", "Illinois", [C]],
  ["IN", "Indiana", ["America/Indiana/Indianapolis", C]], ["IA", "Iowa", [C]], ["KS", "Kansas", [C, M]],
  ["KY", "Kentucky", ["America/Kentucky/Louisville", C]], ["LA", "Louisiana", [C]], ["ME", "Maine", [E]],
  ["MD", "Maryland", [E]], ["MA", "Massachusetts", [E]], ["MI", "Michigan", ["America/Detroit", "America/Menominee"]],
  ["MN", "Minnesota", [C]], ["MS", "Mississippi", [C]], ["MO", "Missouri", [C]], ["MT", "Montana", [M]],
  ["NE", "Nebraska", [C, M]], ["NV", "Nevada", [P]], ["NH", "New Hampshire", [E]], ["NJ", "New Jersey", [E]],
  ["NM", "New Mexico", [M]], ["NY", "New York", [E]], ["NC", "North Carolina", [E]], ["ND", "North Dakota", [C, M]],
  ["OH", "Ohio", [E]], ["OK", "Oklahoma", [C]], ["OR", "Oregon", [P, "America/Boise"]], ["PA", "Pennsylvania", [E]],
  ["RI", "Rhode Island", [E]], ["SC", "South Carolina", [E]], ["SD", "South Dakota", [C, M]], ["TN", "Tennessee", [C, E]],
  ["TX", "Texas", [C, M]], ["UT", "Utah", [M]], ["VT", "Vermont", [E]], ["VA", "Virginia", [E]], ["WA", "Washington", [P]],
  ["WV", "West Virginia", [E]], ["WI", "Wisconsin", [C]], ["WY", "Wyoming", [M]], ["PR", "Puerto Rico", ["America/Puerto_Rico"]],
];

export const CITIES: [string, string][] = [
  ["New York", E], ["Brooklyn", E], ["Boston", E], ["Philadelphia", E], ["Pittsburgh", E], ["Baltimore", E],
  ["Atlanta", E], ["Miami", E], ["Orlando", E], ["Tampa", E], ["Jacksonville", E], ["Charlotte", E], ["Raleigh", E],
  ["Richmond", E], ["Columbus", E], ["Cleveland", E], ["Cincinnati", E], ["Detroit", "America/Detroit"],
  ["Indianapolis", "America/Indiana/Indianapolis"], ["Louisville", "America/Kentucky/Louisville"], ["Knoxville", E],
  ["Chattanooga", E], ["Buffalo", E], ["Newark", E], ["Charleston", E],
  ["Chicago", C], ["Nashville", C], ["Memphis", C], ["Houston", C], ["Dallas", C], ["Austin", C], ["San Antonio", C],
  ["Fort Worth", C], ["New Orleans", C], ["Minneapolis", C], ["St. Paul", C], ["Milwaukee", C], ["St. Louis", C],
  ["Kansas City", C], ["Oklahoma City", C], ["Tulsa", C], ["Omaha", C], ["Birmingham", C], ["Little Rock", C],
  ["Des Moines", C], ["Jackson", C], ["Pensacola", C], ["Wichita", C],
  ["Denver", M], ["Salt Lake City", M], ["Albuquerque", M], ["El Paso", M], ["Boise", "America/Boise"], ["Billings", M],
  ["Cheyenne", M], ["Phoenix", "America/Phoenix"], ["Tucson", "America/Phoenix"], ["Mesa", "America/Phoenix"],
  ["Los Angeles", P], ["San Diego", P], ["San Francisco", P], ["San Jose", P], ["Sacramento", P], ["Oakland", P],
  ["Seattle", P], ["Portland", P], ["Las Vegas", P], ["Reno", P], ["Spokane", P],
  ["Anchorage", "America/Anchorage"], ["Honolulu", "Pacific/Honolulu"], ["San Juan", "America/Puerto_Rico"],
];

// Zone words and abbreviations.
const ZONE_WORDS: [string[], string[]][] = [
  [["eastern", "est", "edt", "et"], [E, "America/Detroit", "America/Indiana/Indianapolis", "America/Kentucky/Louisville"]],
  [["central", "cst", "cdt", "ct"], [C, "America/Menominee"]],
  [["mountain", "mst", "mdt", "mt"], [M, "America/Boise", "America/Phoenix"]],
  [["pacific", "pst", "pdt", "pt"], [P]],
  [["alaska", "akst", "akdt"], ["America/Anchorage"]],
  [["hawaii", "hst"], ["Pacific/Honolulu"]],
  [["atlantic", "ast"], ["America/Puerto_Rico"]],
];

const norm = (s: string) => s.toLowerCase().replace(/[._]/g, " ").replace(/\s+/g, " ").trim();

function push(out: string[], zones: string[]) {
  for (const z of zones) if (!out.includes(z)) out.push(z);
}

/** Zones matching a query, best first. Empty query → []. `all` is the full IANA list to also search by name. */
export function searchZones(query: string, all: string[]): string[] {
  const q = norm(query);
  if (!q) return [];
  const out: string[] = [];
  const upper = query.trim().toUpperCase();
  // Exact state abbreviation and exact zone abbreviation first.
  for (const [ab, , zones] of STATES) if (upper === ab) push(out, zones);
  for (const [words, zones] of ZONE_WORDS) if (words.includes(q)) push(out, zones);
  // Prefix matches on state names, cities, zone words.
  for (const [, name, zones] of STATES) if (norm(name).startsWith(q)) push(out, zones);
  for (const [name, zone] of CITIES) if (norm(name).startsWith(q)) push(out, [zone]);
  if (q.length >= 3) for (const [words, zones] of ZONE_WORDS) if (words.some((w) => w.startsWith(q))) push(out, zones);
  // Substring matches on friendly labels and IANA ids.
  if (q.length >= 2) {
    for (const [z, label] of Object.entries(ZONE_LABELS)) if (norm(label).includes(q)) push(out, [z]);
    for (const z of all) if (norm(z).includes(q)) push(out, [z]);
  }
  return out;
}

// ZIP3 prefix ranges → state.
const ZIP3: [number, number, string][] = [
  [6, 9, "PR"], [10, 27, "MA"], [28, 29, "RI"], [30, 38, "NH"], [39, 49, "ME"], [50, 59, "VT"], [60, 69, "CT"], [70, 89, "NJ"],
  [100, 149, "NY"], [150, 196, "PA"], [197, 199, "DE"], [200, 205, "DC"], [206, 219, "MD"], [220, 246, "VA"], [247, 268, "WV"],
  [270, 289, "NC"], [290, 299, "SC"], [300, 319, "GA"], [320, 349, "FL"], [350, 369, "AL"], [370, 385, "TN"], [386, 397, "MS"],
  [398, 399, "GA"], [400, 427, "KY"], [430, 459, "OH"], [460, 479, "IN"], [480, 499, "MI"], [500, 528, "IA"], [530, 549, "WI"],
  [550, 567, "MN"], [570, 577, "SD"], [580, 588, "ND"], [590, 599, "MT"], [600, 629, "IL"], [630, 658, "MO"], [660, 679, "KS"],
  [680, 693, "NE"], [700, 714, "LA"], [716, 729, "AR"], [730, 749, "OK"], [750, 799, "TX"], [800, 816, "CO"], [820, 831, "WY"],
  [832, 838, "ID"], [840, 847, "UT"], [850, 865, "AZ"], [870, 884, "NM"], [885, 885, "TX"], [889, 898, "NV"], [900, 961, "CA"],
  [967, 968, "HI"], [970, 979, "OR"], [980, 994, "WA"], [995, 999, "AK"],
];

function zipZone(zip: string): string | null {
  const p = Number(zip.slice(0, 3));
  // Known splits inside two-zone states.
  if (p >= 373 && p <= 379) return E; // East Tennessee
  if (p === 324 || p === 325) return C; // Florida panhandle
  if (p === 798 || p === 799 || p === 885) return M; // El Paso
  const hit = ZIP3.find(([a, b]) => p >= a && p <= b);
  return hit ? STATES.find((s) => s[0] === hit[2])?.[2][0] ?? null : null;
}

/** Suggest an IANA zone from a free-text US address (ZIP, then city, then state). */
export function suggestZoneFromAddress(address: string): string | null {
  if (!address || !address.trim()) return null;
  const zips = address.match(/\b\d{5}(?:-\d{4})?\b/g);
  if (zips) {
    const z = zipZone(zips[zips.length - 1]);
    if (z) return z;
  }
  const a = ` ${norm(address)} `;
  const has = (name: string) => a.includes(` ${norm(name)} `) || a.includes(` ${norm(name)},`);
  // State: abbreviation as its own uppercase token (avoids words like "in"/"me"), else full name.
  const tokens = address.match(/\b[A-Z]{2}\b/g) || [];
  let state = tokens.reverse().map((t) => STATES.find((st) => st[0] === t)).find(Boolean);
  if (!state) state = [...STATES].sort((x, y) => y[1].length - x[1].length).find(([, name]) => has(name));
  const city = CITIES.find(([name]) => has(name));
  if (state) return city && state[2].includes(city[1]) ? city[1] : state[2][0];
  return city ? city[1] : null;
}
