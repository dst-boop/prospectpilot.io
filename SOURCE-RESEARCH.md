# Research sources — ProspectPilot

This feature applies across industries. Open Research sources from Find leads or Build sourced profile from a lead's details.

## Implemented source workflows
All twelve categories support source lookup links, public HTML preview, short reviewed excerpts, CSV row matching, and saved profile evidence:
1. Company websites and staff biographies
2. Business registrations
3. Professional licensing records
4. Public professional profiles
5. Company announcements
6. Local news and interviews
7. Chambers and trade associations
8. Business listings and maps
9. SEC filings
10. Conferences, articles and patents
11. WARN notices
12. MWBE directories

These are research workflows, not twelve unrestricted automatic search APIs. Search links open an external search engine. Website access rules, login-only pages, PDF files, and interactive dashboards may require a short excerpt or downloaded CSV instead of fetching the page. The app does not circumvent access controls.

## WARN
Use the current New York dashboard at https://dol.ny.gov/warn-dashboard or the relevant state's official notices. The former NY notices page is a legacy archive. Download a CSV from the dashboard, select the matching lead, choose WARN, and preview the export. Choose the matching company row, supply its original source URL and notice date, review, and save. Other jurisdictions' exports use the same workflow. This is not a nationwide WARN database connector.

WARN evidence is employer-level context. It does not establish that a specific person was laid off and does not automatically change a person's score or call eligibility.

## MWBE
The live search uses NYC's public certified business dataset ci93-uc8s, limited to 30 results per query. Search by business/service and review a result as company evidence. The NY State MWBE hub is also linked. Other jurisdictions use public pages or CSV exports. The connector requests business/contact/certification fields and excludes ethnicity. Certification is not used to infer personal race or gender or to calculate priority.

## Matching and provenance
Company records must name the lead's company. Person-level excerpts must contain the person's full name plus their company or location. This is an identity check for review, not independent verification. Every saved record has a URL, source category, scope, excerpt, optional publication date (required for WARN), checked date and reviewer. Records are separate from qualification scores and wealth estimates. Existing lead data is not overwritten. Duplicate records are ignored; concurrent updates are rejected for reload.

CSV exports may use their original headers. Include company/name and context; up to 1 MB and 1,000 rows. Only matching rows are offered. Confirm the original source URL and date before saving. Do not paste an entire article; use a short relevant excerpt.

## Validation
39 automated tests passed. Browser checks covered all twelve categories, WARN save/reload, MWBE CSV matching, mobile layout and existing app workflows. Live NYC MWBE lookup returned 30 results for consulting. Other sources were tested through shared preview/import code and fixtures, not twelve live account integrations.

## Deployment
The update-source-research.sh file is a self-contained copy of the existing deployment helper with the new files included. Upload the latest helper to Cloud Shell, then run:

    bash ~/update-source-research.sh

Use the actual upload path if different. It updates the existing service through the established release workflow. The source archive also contains the build inputs. This feature has not been deployed from this local session. No signup/access policies were changed; the app's existing owner-only login policy remains.
