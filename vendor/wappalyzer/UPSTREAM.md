# Upstream snapshot

- Repository: https://github.com/HTTPArchive/wappalyzer
- Commit: `35b0847c01c118055c42596d5c6d01f60f15d706`
- Retrieved: 2026-11-19
- Included: `src/technologies/*.json`, `src/categories.json`
- Excluded: application code, browser extension, icons, tests, and build files
- License: GPL-3.0

The files are retained in their original JSON format. Project-specific custom
rules live separately in `src/rules.ts`.

The current adapter evaluates URL, script source, header, cookie-name, and meta
patterns. Generic upstream HTML and inline-script regular expressions are not
executed because JavaScript RegExp has no timeout and selected upstream patterns
show catastrophic backtracking on large real pages. Custom audited HTML rules
remain enabled.
