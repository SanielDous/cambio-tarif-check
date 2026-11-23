import type { LocalMinute, PriceClass, TariffId } from "@/domain/pricing/types";

export interface Trip {
  id: string; // stable hash of start, end, vehicleClass, km, billedTime, billedKm
  city: string;
  vehicleClass: string;
  priceClass: PriceClass;
  start: LocalMinute;
  end: LocalMinute;
  km: number;
  billedTime: number;
  billedKm: number; // integer cents
  tariff: TariffId;
  driver?: string;
  status?: string;
}
