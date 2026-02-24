import 'server-only';
import { Redis } from '@upstash/redis';
import { ZipGroup } from './zipLogic';

const redis = Redis.fromEnv();
const KEY = 'zipConfig';

export async function loadZipGroups(): Promise<ZipGroup[]> {
  const data = await redis.get<ZipGroup[]>(KEY);
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('No zip group config found in Redis. Save the config from /backend first.');
  }
  return data;
}

export async function saveZipGroups(groups: ZipGroup[]): Promise<void> {
  await redis.set(KEY, groups);
}
