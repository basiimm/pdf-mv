# Security policy

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/basiimm/pdf-mv/security/advisories/new). Include affected code or commit, reproduction steps, impact, and a minimal synthetic example. Do not publish exploit details, secrets, or personal documents in an issue.

## Supported versions

PDF MV is in active development and has no stable release or long-term support line. Security fixes currently target `main`. There is no guaranteed response or resolution time.

## Security boundaries

Browser-local processing reduces document transfer but does not eliminate risk from malicious files, dependencies, external assets, or configured certificate/timestamp services. Treat all document contents as untrusted. Never embed secrets in `VITE_*` variables: they are public in the client bundle.

Deployment security depends on the host, worker/WASM configuration, headers, and any external proxy. This project does not claim SOC 2, PCI DSS, or other certification.
