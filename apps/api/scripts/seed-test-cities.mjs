import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';

const citiesUrl = new URL('../prisma/data/cities.json', import.meta.url);
const cities = JSON.parse(readFileSync(citiesUrl, 'utf8'));

if (!Array.isArray(cities) || cities.length < 30 || cities.length > 50) {
  throw new Error('城市种子必须在 30–50 条之间');
}

for (const city of cities) {
  if (
    typeof city.name !== 'string' ||
    city.name.trim().length === 0 ||
    typeof city.countryCode !== 'string' ||
    !/^[A-Z]{2}$/.test(city.countryCode) ||
    typeof city.lat !== 'number' ||
    typeof city.lon !== 'number' ||
    city.lat < -90 ||
    city.lat > 90 ||
    city.lon < -180 ||
    city.lon > 180
  ) {
    throw new Error(`非法城市种子：${JSON.stringify(city)}`);
  }
}

const prisma = new PrismaClient();

try {
  for (const city of cities) {
    await prisma.city.upsert({
      where: { name_countryCode: { name: city.name, countryCode: city.countryCode } },
      update: { centroidLat: city.lat, centroidLon: city.lon },
      create: {
        name: city.name,
        countryCode: city.countryCode,
        centroidLat: city.lat,
        centroidLon: city.lon,
      },
    });
  }
  process.stdout.write(`[test-db] 城市种子已就绪（${cities.length} 条）\n`);
} finally {
  await prisma.$disconnect();
}
