# Architecture

The frontend is a role-aware React shell over REST APIs. Express routes are kept in `app.js` for the MVP, while business decisions live in `services/` and access control lives in `middleware/`. `data.js` is a replaceable repository seam used for fast local demos; Prisma provides the production PostgreSQL contract.

The certification flow is: enrollment -> module progress -> assessment attempt -> `CertificationEligibilityService` -> certificate issue -> public verification -> revocation. External LMS and ONEST exchange are intentionally absent; ONEST-compatible identifiers can be added to the Prisma models later.
