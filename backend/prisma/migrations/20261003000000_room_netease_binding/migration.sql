ALTER TABLE "User"
  ADD COLUMN "neteaseCookieEncrypted" TEXT,
  ADD COLUMN "neteaseProfile" JSONB,
  ADD COLUMN "neteaseBoundAt" TIMESTAMP(3),
  ADD COLUMN "neteaseInvalidAt" TIMESTAMP(3);
