import { NextRequest, NextResponse } from 'next/server';
import {
  findGroupByZip,
  getZipFromLatLng,
  selectProgram,
  buildPrompt,
  formatMessage,
  countWords,
  hasSensitive,
} from '@/lib/zipLogic';
import { loadZipGroups } from '@/lib/configLoader';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const WEATHER_API_KEY = process.env.WEATHER_API_KEY;

// Predefined location coordinates (kept for URL ?location= param support)
const predefinedLocations: Record<string, { latitude: number; longitude: number }> = {
  'nyc':       { latitude: 40.7128,  longitude: -74.0060 },
  'sf':        { latitude: 37.7749,  longitude: -122.4194 },
  'baltimore': { latitude: 39.2904,  longitude: -76.6122 },
};

// ── Moderation check ──────────────────────────────────────────────────────────

const checkModeration = async (text: string): Promise<{ flagged: boolean; reason?: string }> => {
  try {
    const res = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({ input: text }),
    });
    if (!res.ok) return { flagged: false };
    const data = await res.json();
    const result = data.results?.[0];
    if (result?.flagged) {
      const cats = Object.entries(result.categories || {})
        .filter(([, v]) => v).map(([k]) => k);
      return { flagged: true, reason: `flagged by moderation API (categories: ${cats.join(', ')})` };
    }
    return { flagged: false };
  } catch {
    return { flagged: false };
  }
};

// ── Core message generator ────────────────────────────────────────────────────

async function generateMessage(
  latitude: number,
  longitude: number,
  zipOverride: string | null,
  locationName?: string,
  recentMessages: string[] = [],
): Promise<string> {
  // Fetch weather data
  const weatherRes = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${WEATHER_API_KEY}&units=imperial`
  );
  if (!weatherRes.ok) throw new Error('Failed to fetch weather');

  const weatherData = await weatherRes.json();
  const location     = locationName || weatherData.name;
  const temp         = Math.round(weatherData.main.temp);
  const tempMax      = Math.round(weatherData.main.temp_max);
  const weatherMain: string = weatherData.weather[0].main;
  const weatherDesc: string = weatherData.weather[0].description;

  // Local time from weather API timezone offset
  const tzOffset  = weatherData.timezone || 0;
  const localTime = new Date(Date.now() + tzOffset * 1000);
  const localTimeStr = localTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const hour  = localTime.getUTCHours();
  const dow   = localTime.getUTCDay();
  const month = localTime.getUTCMonth() + 1;

  // Determine zip code group
  let zip = zipOverride;
  if (!zip) zip = await getZipFromLatLng(latitude, longitude);
  const groups = await loadZipGroups();
  const group = findGroupByZip(zip, groups);

  // Select program based on current conditions
  const selected = selectProgram(group, temp, tempMax, weatherMain, hour, dow, month);

  const prompt = buildPrompt(group, selected, location, localTimeStr, temp, weatherDesc, recentMessages, zip);

  // Call OpenAI with retry logic
  const callAI = async (aiTemp: number, extra?: string): Promise<string> => {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: extra ? `${prompt}\n\n${extra}` : prompt }],
        max_tokens: 80,
        temperature: aiTemp,
      }),
    });
    if (!res.ok) throw new Error('OpenAI request failed');
    const data = await res.json();
    return formatMessage(data.choices?.[0]?.message?.content?.trim() || 'Have a wonderful day!');
  };

  let message = await callAI(0.8);
  let attempts = 1;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    const modCheck = await checkModeration(message);
    if (modCheck.flagged) {
      attempts++;
      message = await callAI(
        0.7 + attempts * 0.1,
        `IMPORTANT: Previous response was ${modCheck.reason}. Attempt ${attempts}/${maxAttempts}. Generate a completely different message that passes moderation, AT MOST 35 WORDS, promoting "${selected.program}". Output ONLY the message text.`
      );
      continue;
    }
    if (hasSensitive(message)) {
      attempts++;
      message = await callAI(
        0.7 + attempts * 0.1,
        `IMPORTANT: Previous response contained sensitive content. Attempt ${attempts}/${maxAttempts}. Generate a fresh message, AT MOST 35 WORDS, promoting "${selected.program}". Output ONLY the message text.`
      );
      continue;
    }
    if (countWords(message) > 35) {
      attempts++;
      message = await callAI(
        0.7 + attempts * 0.1,
        `IMPORTANT: Previous response exceeded 35 words. Attempt ${attempts}/${maxAttempts}. Shorten to AT MOST 35 WORDS while promoting "${selected.program}". Output ONLY the message text.`
      );
      continue;
    }
    break;
  }

  return message;
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const recentMessages: string[] = Array.isArray(body.recentMessages)
      ? (body.recentMessages as string[]).filter((m): m is string => typeof m === 'string').slice(0, 5)
      : [];

    const url = new URL(req.url);
    const locationParam = url.searchParams.get('location');

    let latitude: number;
    let longitude: number;
    let locationName: string | undefined;
    let zipOverride: string | null = (body.zip as string) || null;

    if (locationParam && predefinedLocations[locationParam.toLowerCase()]) {
      const coords = predefinedLocations[locationParam.toLowerCase()];
      latitude  = coords.latitude;
      longitude = coords.longitude;
    } else {
      latitude     = body.latitude as number;
      longitude    = body.longitude as number;
      locationName = body.locationName as string | undefined;

      if (!latitude || !longitude) {
        return NextResponse.json({ error: 'Missing latitude or longitude' }, { status: 400 });
      }
    }

    const message = await generateMessage(latitude, longitude, zipOverride, locationName, recentMessages);
    return NextResponse.json({ message });
  } catch (error) {
    console.error('Error in generate-message:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
