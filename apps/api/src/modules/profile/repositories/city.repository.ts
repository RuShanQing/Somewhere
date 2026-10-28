import { Injectable } from '@nestjs/common';
import type { City } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class CityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(query: string | null): Promise<City[]> {
    return this.prisma.city.findMany({
      where: query ? { name: { contains: query, mode: 'insensitive' } } : undefined,
      orderBy: [{ countryCode: 'asc' }, { name: 'asc' }],
      take: 50,
    });
  }

  async findById(id: string): Promise<City | null> {
    return this.prisma.city.findUnique({ where: { id } });
  }
}
