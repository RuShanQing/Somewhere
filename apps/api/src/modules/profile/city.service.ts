import { Injectable } from '@nestjs/common';
import type { City } from '@prisma/client';
import { normalizeCityQuery } from './domain/city';
import type { CitySummary } from './profile.types';
import { CityRepository } from './repositories/city.repository';

@Injectable()
export class CityService {
  constructor(private readonly cities: CityRepository) {}

  async list(rawQuery: string | undefined): Promise<CitySummary[]> {
    const query = normalizeCityQuery(rawQuery);
    const cities = await this.cities.findMany(query);
    return cities.map((city) => this.toSummary(city));
  }

  async findById(id: string): Promise<City | null> {
    return this.cities.findById(id);
  }

  async findManyByIds(ids: string[]): Promise<City[]> {
    return this.cities.findManyByIds(ids);
  }

  toSummary(city: City): CitySummary {
    return { id: city.id, name: city.name, countryCode: city.countryCode };
  }
}
