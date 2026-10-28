import type { ReceptionMode } from '@prisma/client';

export interface CitySummary {
  id: string;
  name: string;
  countryCode: string;
}

export interface ProfileView {
  userId: string;
  nickname: string;
  city: CitySummary | null;
  receptionMode: ReceptionMode;
}
