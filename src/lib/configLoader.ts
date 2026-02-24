import 'server-only';
import { Redis } from '@upstash/redis';
import { ZipGroup, DEFAULT_GENERAL_GROUP } from './zipLogic';

const redis = Redis.fromEnv();
const KEY = 'zipConfig';

export async function loadZipGroups(): Promise<ZipGroup[]> {
  const data = await redis.get<ZipGroup[]>(KEY);
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('No zip group config found in Redis. Save the config from /backend first.');
  }
  // Ensure a General group (zips: []) always exists at runtime
  if (!data.find(g => g.zips.length === 0)) {
    data.push(DEFAULT_GENERAL_GROUP);
  }
  return data;
}

export async function saveZipGroups(groups: ZipGroup[]): Promise<void> {
  await redis.set(KEY, groups);
}
