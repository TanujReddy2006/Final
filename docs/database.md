# Database

`backend/prisma/schema.prisma` defines users, companies, courses, modules, enrollments, assessments, skills, certification tracks, certificates, verification, revocation, and audit logs. Unique indexes protect emails and certificate IDs. Cascades remove dependent course content and verification records when an owning record is deleted.

To use PostgreSQL persistence, set `DATABASE_URL`, run `npx prisma migrate dev --schema backend/prisma/schema.prisma`, then add a Prisma repository implementation behind the service layer.
