# Testing

Run `npm test --prefix backend` for the health/login/catalog smoke tests. The test seam is Supertest-compatible and can be expanded with the requested integration flow: register, enroll, progress every module, submit a passing attempt, issue, verify, revoke, and verify again.

Run `npm run build --prefix frontend` for a production bundle check. Browser verification should cover the responsive learner, HR, company, and admin shells.
