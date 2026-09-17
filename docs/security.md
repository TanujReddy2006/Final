# Security

Passwords are bcrypt hashed. JWTs expire after eight hours. Helmet, CORS, role checks, input presence checks, rate limiting, and centralized error handling are enabled. Verification returns only certificate metadata needed by a recruiter and does not expose email, address, or account details. Store secrets only in environment variables. Replace the demo in-memory store with Prisma before production use and add Redis-backed invalidation for multi-instance deployments.
