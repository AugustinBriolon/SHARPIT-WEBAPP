-- Language the app shows ('fr' | 'en', ADR-096). Null = follow the request's Accept-Language, else French.
ALTER TABLE "AthleteProfile" ADD COLUMN IF NOT EXISTS "locale" TEXT;
