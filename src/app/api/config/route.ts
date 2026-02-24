import { NextRequest, NextResponse } from 'next/server';
import { loadZipGroups, saveZipGroups } from '@/lib/configLoader';
import { ZipGroup } from '@/lib/zipLogic';

export async function GET() {
  const groups = await loadZipGroups();
  return NextResponse.json(groups);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as ZipGroup[];
    if (!Array.isArray(body) || body.length === 0) {
      return NextResponse.json({ error: 'Invalid config: must be a non-empty array' }, { status: 400 });
    }
    // Basic validation
    for (const g of body) {
      if (typeof g.name !== 'string' || !Array.isArray(g.zips)) {
        return NextResponse.json({ error: `Invalid group structure for: ${g.name ?? '(unnamed)'}` }, { status: 400 });
      }
    }
    await saveZipGroups(body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Config save error:', err);
    return NextResponse.json({ error: 'Failed to save config' }, { status: 500 });
  }
}
