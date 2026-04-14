# Repository Guidelines

## Project Structure & Module Organization
`manifest.json` defines the Chrome extension entry points. `background.js` coordinates extension state and long-running flow control. `sidepanel/` contains the operator UI (`sidepanel.html`, `sidepanel.css`, `sidepanel.js`). `content/` holds automation scripts and shared helpers for signup, OAuth, and mail-provider flows such as `activation-utils.js` and `moemail-utils.js`. `data/` stores static fixtures like names, `icons/` contains packaged assets, and `tests/` contains Node-based regression tests named `*.test.js`.

## Build, Test, and Development Commands
There is no bundling step; development is a direct edit-and-reload workflow.

- `npm test` runs all regression tests with Node's built-in test runner.
- `node --check background.js` validates syntax for a changed script.
- `node --check sidepanel/sidepanel.js` is the quickest guard for sidepanel edits.
- Load the repo with `chrome://extensions` -> `Load unpacked`, then reload the extension after each change.

## Coding Style & Naming Conventions
Use 2-space indentation, semicolons, and the existing plain-JavaScript style. Prefer `camelCase` for variables and functions, `SCREAMING_SNAKE_CASE` for constants, and descriptive file names tied to the target flow, for example `content/qq-mail.js` or `tests/step8-callback-handling.test.js`. Keep reusable normalization/parsing logic in helper modules instead of duplicating it across content scripts or sidepanel code.

## Testing Guidelines
Tests use `node:test` with `node:assert/strict`. Add or update a regression test for every behavior change, especially around Step 8/9 callback handling, auto-run state, and provider-specific mail parsing. Follow the existing naming pattern: one focused file per feature or regression, ending in `.test.js`. There is no formal coverage gate, so contributors should protect any bug fix with a deterministic test.

## Commit & Pull Request Guidelines
Recent history mixes plain imperative subjects, `feat:` prefixes, and Chinese summaries. Prefer a short imperative subject that explains intent, not just files changed. When useful, include a body with Lore-style trailers such as `Constraint:`, `Rejected:`, and `Tested:`. PRs should summarize the affected flow (`CPA`, `SUB2API`, `MoeMail`, or sidepanel UX), list verification commands run, link related issues, and include screenshots or a short recording for visible UI changes.

## Security & Configuration Tips
Do not commit live panel URLs, API keys, mailbox credentials, or exported settings snapshots. Be conservative when changing Step 8/9 logic: only localhost callback URLs matching `/auth/callback` should be accepted.
