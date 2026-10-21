import { z } from "zod";

export const locationSchema = z
  .object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  })
  .strict();

export const MAX_DISTANCE_KM = 20016;
