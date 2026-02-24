// ── Types ─────────────────────────────────────────────────────────────────────

export type GeneralOption = {
  probability: number;
  program: string;
  keyMessages: string[];
};

export type WeatherCondType =
  | 'heat_wave'       // temp >= 90°F or temp_max >= 90°F
  | 'cold_snap'       // temp <= 28°F
  | 'severe_weather'  // thunderstorm / tornado
  | 'seasonal_shift'; // March/April or September/October

export type TimeCondType =
  | 'peak_demand_hours'      // 14:00–18:00 any day
  | 'weekday'                // Mon–Fri
  | 'after_school_weekend'   // weekday 15:00–20:00 OR weekend
  | 'weekend'                // Sat–Sun
  | 'early_evening_weekday'  // weekday 17:00–19:00
  | 'pre_winter_window'      // October–November
  | 'move_in_window';        // May–September

export type WeatherCond = { type: WeatherCondType; program: string; keyMessages: string[] };
export type TimeCond    = { type: TimeCondType;    program: string; keyMessages: string[] };

export type ZipGroup = {
  name: string;
  zips: string[];
  tone: string;
  toneStyle: string;
  toneExample: string;
  localKeywords: Record<string, string[]>; // zip → neighborhood names for that specific zip
  generalOptions: GeneralOption[];
  weatherConditions: WeatherCond[];
  timeConditions: TimeCond[];
};

export type SelectedProgram = {
  program: string;
  keyMessages: string[];
  trigger: 'weather' | 'time' | 'general';
  triggerLabel: string;
};

// ── General fallback group (used when zip doesn't match any defined group) ─────
// zips: [] signals this is the catch-all. Editable from /backend.

export const DEFAULT_GENERAL_GROUP: ZipGroup = {
  name: 'General',
  zips: [],
  tone: 'general homeowner or renter, energy utility customer',
  toneStyle: 'clear and friendly — broadly applicable, focuses on simple savings and comfort benefits',
  toneExample: 'Small upgrades can make a big difference in comfort and energy costs year-round.',
  localKeywords: {},
  generalOptions: [
    {
      probability: 0.4,
      program: 'Smart Thermostat',
      keyMessages: ['Up to $100 incentive', 'Improve comfort and reduce everyday energy waste'],
    },
    {
      probability: 0.35,
      program: 'HVAC Tune-Up',
      keyMessages: ['Keep your system running efficiently year-round', 'System testing at no additional cost'],
    },
    {
      probability: 0.25,
      program: 'Home Performance with ENERGY STAR®',
      keyMessages: ['Average of $3,000 in rebates for qualifying home improvements'],
    },
  ],
  weatherConditions: [
    {
      type: 'heat_wave',
      program: 'Smart Thermostat',
      keyMessages: ['Optimize cooling schedules during high-demand periods'],
    },
    {
      type: 'cold_snap',
      program: 'HVAC Tune-Up',
      keyMessages: ['Ensure heating reliability before temperatures drop further'],
    },
  ],
  timeConditions: [
    {
      type: 'peak_demand_hours',
      program: 'Smart Energy Rewards',
      keyMessages: ['Earn rewards by reducing energy use during peak hours'],
    },
  ],
};

// ── Group lookup ───────────────────────────────────────────────────────────────
// Groups with zips:[] are catch-all fallbacks; zip-specific groups take priority.

export function findGroupByZip(zip: string | null, groups: ZipGroup[]): ZipGroup {
  if (zip) {
    const match = groups.find(g => g.zips.length > 0 && g.zips.includes(zip));
    if (match) return match;
  }
  // Fall back to the General group (zips: []), or first group if none defined
  return groups.find(g => g.zips.length === 0) ?? groups[0];
}

// ── Reverse geocode → zip code ────────────────────────────────────────────────

export async function getZipFromLatLng(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=13`,
      { headers: { 'User-Agent': 'smart-billboard/1.0' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const postcode = data.address?.postcode as string | undefined;
    if (!postcode) return null;
    return postcode.replace(/\s/g, '').slice(0, 5);
  } catch {
    return null;
  }
}

// ── Condition checkers ────────────────────────────────────────────────────────

export function matchWeather(
  type: WeatherCondType,
  temp: number,
  tempMax: number,
  weatherMain: string,
  month: number
): boolean {
  switch (type) {
    case 'heat_wave':      return tempMax >= 90 || temp >= 88;
    case 'cold_snap':      return temp <= 28;
    case 'severe_weather': return ['Thunderstorm', 'Tornado'].includes(weatherMain);
    case 'seasonal_shift': return [3, 4, 9, 10].includes(month);
  }
}

export function matchTime(
  type: TimeCondType,
  hour: number,
  dow: number,   // 0 = Sunday … 6 = Saturday
  month: number
): boolean {
  const wd = dow >= 1 && dow <= 5;
  const we = dow === 0 || dow === 6;
  switch (type) {
    case 'peak_demand_hours':     return hour >= 14 && hour < 18;
    case 'weekday':               return wd;
    case 'after_school_weekend':  return (wd && hour >= 15 && hour < 20) || we;
    case 'weekend':               return we;
    case 'early_evening_weekday': return wd && hour >= 17 && hour < 19;
    case 'pre_winter_window':     return month === 10 || month === 11;
    case 'move_in_window':        return month >= 5 && month <= 9;
  }
}

// ── Program selection ─────────────────────────────────────────────────────────
// Priority: weather conditions → time conditions → probability-weighted general

export function selectProgram(
  group: ZipGroup,
  temp: number,
  tempMax: number,
  weatherMain: string,
  hour: number,
  dow: number,
  month: number
): SelectedProgram {
  // 1. Weather conditions (highest priority)
  for (const c of group.weatherConditions) {
    if (matchWeather(c.type, temp, tempMax, weatherMain, month)) {
      return {
        program: c.program,
        keyMessages: c.keyMessages,
        trigger: 'weather',
        triggerLabel: c.type.replace(/_/g, ' '),
      };
    }
  }

  // 2. Time conditions
  for (const c of group.timeConditions) {
    if (matchTime(c.type, hour, dow, month)) {
      return {
        program: c.program,
        keyMessages: c.keyMessages,
        trigger: 'time',
        triggerLabel: c.type.replace(/_/g, ' '),
      };
    }
  }

  // 3. Probability-weighted general fallback
  const rand = Math.random();
  let cum = 0;
  for (const opt of group.generalOptions) {
    cum += opt.probability;
    if (rand <= cum) {
      return {
        program: opt.program,
        keyMessages: opt.keyMessages,
        trigger: 'general',
        triggerLabel: 'general',
      };
    }
  }
  const last = group.generalOptions[group.generalOptions.length - 1];
  return {
    program: last.program,
    keyMessages: last.keyMessages,
    trigger: 'general',
    triggerLabel: 'general',
  };
}

// ── Prompt builder ────────────────────────────────────────────────────────────

export function buildPrompt(
  group: ZipGroup,
  selected: SelectedProgram,
  location: string,
  localTimeString: string,
  temperature: number,
  weatherDescription: string,
  recentMessages: string[] = [],
  zip: string | null = null,
): string {
  const repetitionBlock = recentMessages.length > 0
    ? `REPETITION GUARDRAIL (CRITICAL):
The following messages were recently shown. You MUST NOT repeat, paraphrase, or closely resemble any of them:
${recentMessages.map(m => `- "${m}"`).join('\n')}

`
    : '';

  const conditionContext = selected.trigger !== 'general'
    ? `CONTEXT: This message is being shown because of current ${selected.trigger} conditions (${selected.triggerLabel}).
Use the conditions below to make the message feel timely — but do NOT state temperature or time explicitly.
Current conditions: ${temperature}°F, ${weatherDescription}, local time ${localTimeString}.`
    : `No specific weather or time trigger — keep the message broadly useful and relevant for this area.`;

  const zipKeywords = zip ? (group.localKeywords[zip] ?? []) : [];
  let localBlock: string;
  if (zipKeywords.length > 0) {
    // Zip-specific group: neighborhood keyword is required
    localBlock = `LOCAL AREA REFERENCE (REQUIRED) — you MUST include one of these in the message:
${zipKeywords.join(', ')}
Work it in the way a local would — e.g. "If you're in ${zipKeywords[0]}..." or "${zipKeywords[0]} homeowners..." or "Hey ${zipKeywords[0]}...".

`;
  } else if (location) {
    // General / out-of-range: use the city name from the weather API
    localBlock = `LOCAL AREA REFERENCE (REQUIRED) — you MUST mention this location naturally in the message:
${location}
Work it in like a local reference — e.g. "If you're in ${location}..." or "${location} homeowners..." or "Hey ${location}...".

`;
  } else {
    localBlock = '';
  }

  return `You are a copywriter for an energy utility company serving the Baltimore region.
Write a short, engaging billboard message to promote the "${selected.program}" program.

${repetitionBlock}TARGET AREA: ${location} (${group.name} zone)
AUDIENCE PROFILE: ${group.tone}
Communication style: ${group.toneStyle}
Tone example: "${group.toneExample}"

${localBlock}PROGRAM TO PROMOTE: ${selected.program}
KEY MESSAGES — naturally incorporate 1–2 of these:
${selected.keyMessages.map(m => `- ${m}`).join('\n')}

${conditionContext}

RULES:
- 1–2 sentences total, AT MOST 35 words (hard limit — count carefully)
- Write in a tone that matches the ${group.name} audience: ${group.tone}
- Include the EXACT program name "${selected.program}" in the message
- Reference at least one key message naturally
- Sound human — like a trusted neighbor or local expert, not a corporate ad
- DO NOT use em dashes (—), marketing clichés, or rhymes
- DO NOT explicitly state the temperature or time
- DO NOT mention zip codes or the audience group name
- Output ONLY the message text — no labels, no quotes, nothing else`;
}

// ── Message formatting helpers ────────────────────────────────────────────────

export const countWords = (t: string): number =>
  t.trim().split(/\s+/).filter(w => w.length > 0).length;

export const truncateTo35Words = (t: string): string => {
  const words = t.trim().split(/\s+/).filter(w => w.length > 0);
  return words.length <= 35 ? t : words.slice(0, 35).join(' ') + '...';
};

export const sensitiveWords = [
  'slavery', 'slave', 'civil war', 'massacre', 'segregation', 'protest', 'riot',
  'disaster', 'hurricane', 'killed', 'destroyed', 'burned', 'bomb', 'war',
  'shooting', 'tragedy',
];

export const hasSensitive = (t: string): boolean =>
  sensitiveWords.some(w => t.toLowerCase().includes(w.toLowerCase()));

export const formatMessage = (raw: string): string => {
  let msg = raw;
  const m = raw.match(/Message:\s*([\s\S]+?)$/i);
  if (m) msg = m[1].trim();
  msg = msg.replace(/^Location:\s*[^\n]+\n?/gi, '');
  msg = msg.replace(/\nLocation:\s*[^\n]+/gi, '');
  msg = msg.replace(/^['"]+|['"]+$/g, '');
  msg = msg.replace(/'/g, '\u2019');
  msg = msg.replace(/\s*—\s*/g, ', ');
  if (countWords(msg) > 35) msg = truncateTo35Words(msg);
  return msg;
};
