# DeeTech — SOC Web Review

A lightweight, local-first workspace for documenting authorized website reviews, recording analyst findings, and keeping an authorization register. The app does **not** visit, scan, crawl, or send requests to review targets.

## Run locally

1. Use Python 3.8 or later.
2. From this folder, run `python SOC.py`.
3. Open [http://127.0.0.1:8000](http://127.0.0.1:8000).
4. Stop the server with `Ctrl+C`.

The server binds only to `127.0.0.1`. No third-party packages are required. Workspace records and your light/dark theme preference are stored in your browser's local storage; use **Export workspace** to download a JSON backup.

## Workflow

1. Add an authorization record for a domain, IPv4 address, or IPv4 CIDR range after obtaining written approval from its owner.
2. Create a review case associated with a current authorization record. IP targets must be inside the authorized IPv4 address or CIDR range; CIDR entries are normalized to their network address.
   Edit a case later to update its name, status, review lead, or notes; the target and authorization link stay fixed.
3. Log findings that have already been verified through an approved process.
4. Use **Hosts & API** to record IPv4 host observations and API test results collected separately under current authorization. Host entries must fit their authorized IPv4/CIDR range, and API endpoint hosts must fit their selected scope.
5. Use **Cloud review** as a manual checklist for common identity, data protection, network, resilience, and detection controls. Record the provider, a non-secret account/project label, control result, and notes only after reviewing settings in the provider console.
6. Track review and finding status, and export a workspace backup when needed.

Host observations, API test results, and cloud checks are manual records only. DeeTech does not discover hosts, send API requests, connect to cloud accounts, or execute tests. Do not store credentials, tokens, or sensitive configuration data in the workspace.

## Finding risk scores

Analysts assign each finding an integer score from 0 to 100. DeeTech classifies the score automatically using these inclusive ranges:

| Risk level | Score |
| --- | ---: |
| Critical | 90–100 |
| High | 70–89 |
| Medium | 40–69 |
| Low | 0–39 |

Findings are ordered by score, and the dashboard's critical/high count includes open or in-progress findings with scores of 70 or higher. Risk scores support analyst triage and are not an automated vulnerability assessment.

Authorization records are documentation, not proof of permission. Confirm written approval and its scope, methods, and time window with the asset owner before conducting any testing. Cloud checklist guidance is not a complete audit or compliance assessment, and does not establish that an environment is secure. This app contains no vulnerability scanner or active network, API, or cloud testing functionality.