# Statement of Work — Phase 1
**Project:** Home Studio List — Custom Filter & Listing System
**Effective Date:** February 24, 2026

---

## Parties

**Service Provider:**
Cull Ventures LLC (Delaware LLC, operating in California)
EIN: 33-4437079
6891 Exeter Drive
Oakland, CA 94611
Represented by: Marc Cull, Chief Executive Officer

**Client:**
Hannah Pobar Woodward
Home Studio List
hello@hannahpobar.com

---

## Engagement Context

This Statement of Work describes Phase 1 of what the parties anticipate may be a multi-phase engagement. Additional phases, if any, will be defined and agreed upon under separate Statements of Work referencing this document. No future work is implied or obligated by this agreement.

---

## Project Overview

Cull Ventures LLC will design, develop, and deploy a custom filtering and listing system for homestudiolist.com, replacing the existing third-party Universal Filter script. The new system will use Airtable as the data source, a Vercel serverless function as the API layer, and a lightweight client-side JavaScript module injected into Squarespace.

---

## Scope of Work

### Deliverable 1 — Vercel API Function (`/api/listings`)
- Serverless function that fetches all listing records from Airtable
- Returns a normalized JSON payload optimized for client-side filtering
- Server-side response caching (15-minute TTL) to eliminate repeated Airtable API calls
- Deployed to Vercel with documented environment variable configuration

### Deliverable 2 — Client-Side Filter Module
- Vanilla JavaScript module injected into Squarespace via Code Injection
- Fetches listing data from `/api/listings` on page load (single HTTP request)
- Dynamically builds filter UI from available field values in the dataset — no hardcoded filter options
- Instant in-memory filtering on user interaction (no additional network requests after initial load)
- URL-based filter state (filter selections reflected in and restorable from the page URL)
- Renders listing cards into a designated Squarespace container element

### Deliverable 3 — Squarespace Integration
- Code injection configuration (header/footer or page-level injection)
- CSS styling for filter UI and listing cards, consistent with existing site design
- Documentation of injection points for future site maintainers

### Deliverable 4 — Handoff Documentation
- README covering: Airtable schema requirements, environment variables, deployment steps
- Instructions for adding or removing filter fields without code changes

---

## Out of Scope

- Changes to the Airtable base schema (Client to provide access to existing base as-is)
- Full-text search (Algolia or Elasticsearch integration)
- Squarespace template or theme modifications beyond Code Injection
- Ongoing maintenance or support beyond 30 days post-delivery
- Migration or cleanup of existing listing data in Airtable

---

## Timeline

Estimated active build time: 5–6 hours across one to two focused work sessions, contingent on timely Airtable access and Vercel project setup by Client.

| Milestone | Description |
|-----------|-------------|
| Kickoff | Airtable access confirmed, Vercel project initialized, data schema reviewed |
| API complete | `/api/listings` endpoint live and returning correct data |
| Filter complete | Filter module rendering and filtering correctly in staging |
| Integration | Live on homestudiolist.com, QA complete |
| Handoff | Documentation delivered, agreement closed |

---

## Compensation

**Rate:** $300.00 USD per hour
**Not to Exceed:** $1,800.00 USD (6 hours) without written approval from Client
**Billing:** Hourly, based on actual time logged; invoiced upon project completion
**Payment Terms:** Net 15 days from invoice date

Scope changes or additions requested by Client after work has begun may require a revised not-to-exceed amount, agreed upon in writing before additional work proceeds.

---

## Acceptance

The project is considered complete and the final invoice will be issued when:
- Filter results load in under 3 seconds on a standard connection
- All existing filter categories represented in the current implementation are available in the new UI
- Filter selections are reflected in the page URL
- Client confirms satisfactory functional parity in writing (email is sufficient)

---

## Intellectual Property

All custom code produced under this agreement is owned by Hannah Pobar Woodward / Home Studio List upon receipt of full payment. Prior to full payment, all work product remains the property of Cull Ventures LLC. Cull Ventures LLC retains the right to reference this project in its portfolio and case studies.

---

## General Terms

**Confidentiality:** Each party agrees to keep confidential any non-public information shared in the course of this engagement.

**Independent Contractor:** Cull Ventures LLC is an independent contractor. Nothing in this agreement creates an employment, partnership, or joint venture relationship.

**Governing Law:** This agreement shall be governed by the laws of the State of California.

**Entire Agreement:** This SOW constitutes the entire agreement between the parties for the described scope. Modifications require written consent from both parties.

---

## Signatures

**Cull Ventures LLC**
Signature: _________________________
Name: Marc Cull
Title: Chief Executive Officer
Date: _______________

**Home Studio List**
Signature: _________________________
Name: Hannah Pobar Woodward
Title: Chief Executive Officer
Date: _______________
