# API

Responses use `{ success, message, data }`. Send JWTs as `Authorization: Bearer <token>`.

Public: `GET /api/v1/health`, `GET /api/v1/courses`, `GET /api/v1/courses/:id`, `GET /api/v1/verify/:certificateId`.
Authenticated learner: enrollment, progress, assessment submission, eligibility, certificate issue, and certificate listing endpoints.
Company/admin: course creation, publication, revocation, and admin overview endpoints. Verification is rate limited to 1,000 requests per hour per process and writes an audit event.
