# DeeTech — SOC Web Review

A lightweight, local-first workspace for documenting authorized website reviews, recording analyst findings, and keeping an authorization register. The app does **not** visit, scan, crawl, or send requests to review targets.

## Run locally

1. Use Python 3.8 or later.
2. From this folder, run `python SOC.py`.
3. Open [http://127.0.0.1:8000](http://127.0.0.1:8000).
4. Stop the server with `Ctrl+C`.

The server binds only to `127.0.0.1`. No third-party packages are required. Workspace records and your light/dark theme preference are stored in your browser's local storage; use **Export workspace** to download a JSON backup.

## Workflow

1. Add an authorization record for a domain after obtaining written approval from its owner.
2. Create a review case associated with a current authorization record.
3. Log findings that have already been verified through an approved process.
4. Track review and finding status, and export a workspace backup when needed.

Authorization records are documentation, not proof of permission. Confirm written approval and its scope, methods, and time window with the asset owner before conducting any testing. This app contains no vulnerability scanner or active testing functionality.