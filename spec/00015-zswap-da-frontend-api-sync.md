# Feature Specification: 00015-zswap-da frontend API sync

**Feature Branch**: `00015-zswap-da`

**Created**: 2026-08-20

**Status**: Draft

**Input**: User request to verify/update `templates/zswap-da/*` against the updated
`zswap-offerfiles-kernel` backend API contract.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Duplicate intent submission behavior (Priority: P1)

As a swap maker, when I re-submit an equivalent intent with a different offer blob,
the frontend should not fail or mislead me when the backend now returns
`409 DUPLICATE_MARKERS`; instead it should route me to the already-active offer
just like existing duplicate behavior.

**Why this priority**: Prevents duplicate intent confusion and accidental
submission retries after the backend contract changed.

**Independent Test**: Submit an offer, then submit a re-proved equivalent offer
and verify the app records the existing offer id and does not show it as a hard error.

**Acceptance Scenarios**:

1. **Given** the backend returns `DUPLICATE_MARKERS` for a submit call, **When**
the user clicks submit, **Then** the app uses `activeOfferId` as the resulting
`offerId`.
2. **Given** duplicate status is present for the same payload (`DUPLICATE_OFFER`),
**When** submit succeeds by duplicate path, **Then** status and UX remain unchanged.

### User Story 2 - API contract visibility (Priority: P2)

As a maintainer, I need the frontend interface docs/comments to mention the new
duplicate marker contract so future changes do not regress compatibility.

**Why this priority**: Keeps code-level contract assumptions explicit and discoverable.

**Independent Test**: Confirm API submit docs in the frontend project describe
both duplicate modes and their response payloads.

**Acceptance Scenarios**:

1. **Given** backend docs mark `DUPLICATE_MARKERS` as non-transactional duplicate,
**When** frontend team reviews comments/notes, **Then** they match current API behavior.

### Edge Cases

- What if `DUPLICATE_MARKERS` arrives without a usable `activeOfferId`?  
- What if the app receives only `offerId` and `status` from the backend for marker
duplicate (future schema drift)?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The frontend submit flow must treat `DUPLICATE_MARKERS` similarly
to `DUPLICATE_OFFER` from the user perspective.
- **FR-002**: On duplicate marker handling, `addTrade` and local status flow must
reference `activeOfferId` for the existing live offer.
- **FR-003**: Frontend API comments/types should document `DUPLICATE_MARKERS`
response shape (`offerId`, `activeOfferId`) so the contract is explicit.
- **FR-004**: The project must include required organizer records (`spec/`,
`plans/`, `counter.md`, `project-summary.md`) for `00015-zswap-da`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A scripted submit scenario that triggers `DUPLICATE_MARKERS`
ends as duplicate handling without throwing or retrying.
- **SC-002**: The local trade record points to the active offer id (not the
submitted blob id) for marker duplicates.
- **SC-003**: `templates/zswap-da` includes explicit notes for both duplicate
submit codes.

## Assumptions

- Backend contract used is post-2026-08-18 `zswap-offerfiles-kernel`, where
`DUPLICATE_MARKERS` is active at `POST /v1/offers`.
- Existing template code paths for `DUPLICATE_OFFER` are stable and should remain unchanged
except for parity with marker duplicates.
