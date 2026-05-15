# Security Specification - RESCOING ERP

## 1. Data Invariants
- A user can only access and modify their own profile and settings.
- All documents (contacts, projects, etc.) must have an `ownerId` matching the authenticated user's `uid`.
- Sensitive data like `companyRut` must be protected.
- Users cannot modify `uid` or `email` in their own Profile once set.

## 2. The "Dirty Dozen" Payloads (Denial Tests)

1. **Attempt to read another user's profile:** `GET /users/victim_uid` by `attacker_uid`.
2. **Attempt to update ownerId of a contact:** `PATCH /contacts/cid { ownerId: 'other_uid' }`.
3. **Attempt to create a contact for another user:** `POST /contacts { ownerId: 'other_uid', name: '...' }`.
4. **Attempt to update profile with extremely long companyName:** `PATCH /users/uid { companyName: 'A'.repeat(2000) }`.
5. **Attempt to inject fields into UserProfile:** `PATCH /users/uid { isAdmin: true }`.
6. **Attempt to delete a project owned by someone else:** `DELETE /projects/other_pid`.
7. **Attempt to list all contacts without filtering by owner:** `LIST /contacts`.
8. **Attempt to set future createdAt:** `POST /contacts { createdAt: '2030-01-01...' }`.
9. **Attempt to bypass email verification:** Login with unverified email if verification is enforced (TBD).
10. **Attempt to create document with invalid ID:** `POST /contacts/invalid!!ID`.
11. **Update immutable field in UserProfile:** `PATCH /users/uid { email: 'new@email.com' }`.
12. **Attempt to update project progress with invalid type:** `PATCH /projects/pid { progress: 'not-a-number' }`.

## 3. Test Runner (Conceptual)
All the above payloads MUST return `PERMISSION_DENIED`.
