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
): Promise<{ message: string; group: string; program: string; trigger: string }> {
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
  const tzOffset  = weatherData.timezone || 0; // seconds from UTC
  const localTime = new Date(Date.now() + tzOffset * 1000);
  const localTimeStr = localTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const hour  = localTime.getUTCHours();
  const dow   = localTime.getUTCDay();   // 0 = Sunday
  const month = localTime.getUTCMonth() + 1; // 1–12

  // Determine zip code group
  let zip = zipOverride;
  if (!zip) zip = await getZipFromLatLng(latitude, longitude);
  const groups = await loadZipGroups();
  const group = findGroupByZip(zip, groups);

  // Select program based on current conditions
  const selected = selectProgram(group, temp, tempMax, weatherMain, hour, dow, month);

  const prompt = buildPrompt(group, selected, location, localTimeStr, temp, weatherDesc, [], zip);

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
        `IMPORTANT: Previous response contained sensitive content. Attempt ${attempts}/${maxAttempts}. Generate a fresh message avoiding all sensitive topics, AT MOST 35 WORDS, promoting "${selected.program}". Output ONLY the message text.`
      );
      continue;
    }
    if (countWords(message) > 35) {
      attempts++;
      message = await callAI(
        0.7 + attempts * 0.1,
        `IMPORTANT: Previous response exceeded 35 words. Attempt ${attempts}/${maxAttempts}. Shorten it to AT MOST 35 WORDS while promoting "${selected.program}". Output ONLY the message text.`
      );
      continue;
    }
    break;
  }

  return { message, group: group.name, program: selected.program, trigger: selected.trigger };
}

// ── GET handler ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
      (req.headers.get('host') ? `https://${req.headers.get('host')}` : 'http://localhost:3000');

    const url  = new URL(req.url);
    const lat  = url.searchParams.get('lat');
    const lng  = url.searchParams.get('lng');
    const zip  = url.searchParams.get('zip') || null;
    const locationName = url.searchParams.get('location') || undefined;

    const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

    if (!lat || !lng) {
      const errorRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Smart Billboard Messages</title>
    <description>Location-based energy efficiency messages from the Smart Billboard system.</description>
    <link>${baseUrl}</link>
    <item>
      <title>Location Required</title>
      <description><![CDATA[Please provide latitude and longitude parameters. Example: /feed?lat=39.2904&lng=-76.6122]]></description>
      <link>${baseUrl}</link>
      <guid isPermaLink="true">${baseUrl}/feed?error=location-required</guid>
      <pubDate>${new Date().toUTCString()}</pubDate>
    </item>
  </channel>
</rss>`;
      return new NextResponse(errorRss, {
        status: 200,
        headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders },
      });
    }

    const latitude  = parseFloat(lat);
    const longitude = parseFloat(lng);
    const { message, group, program, trigger } = await generateMessage(latitude, longitude, zip, locationName);

    const pubDate = new Date().toUTCString();
    const displayLocation = locationName || `Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;

    const rssContent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Smart Billboard Message - ${displayLocation}</title>
    <description>Energy message for ${displayLocation} | Zone: ${group} | Program: ${program} | Trigger: ${trigger}</description>
    <link>${baseUrl}</link>
    <item>
      <title>Smart Billboard Message - ${displayLocation}</title>
      <description><![CDATA[${message}]]></description>
      <link>${baseUrl}?lat=${lat}&amp;lng=${lng}</link>
      <guid isPermaLink="true">${baseUrl}/feed?lat=${lat}&amp;lng=${lng}&amp;t=${Date.now()}</guid>
      <pubDate>${pubDate}</pubDate>
    </item>
  </channel>
</rss>`;

    return new NextResponse(rssContent, {
      status: 200,
      headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders },
    });
  } catch (error) {
    console.error('Error generating RSS feed:', error);
    return new NextResponse('Error generating RSS feed', { status: 500 });
  }
}
