#!/usr/bin/env bash
# Pre-commit secret scan. Uses gitleaks when installed; otherwise a
# conservative grep over the staged diff. Exits non-zero on any hit.
set -euo pipefail

if command -v gitleaks >/dev/null 2>&1; then
  exec gitleaks protect --staged --redact --verbose
fi

echo "secret-scan: gitleaks not installed, using grep fallback" >&2
diff="$(git diff --cached -U0 --no-color -- . ':(exclude)pnpm-lock.yaml' | grep '^+' | grep -v '^+++' || true)"
staged_files="$(git diff --cached --name-only --diff-filter=ACM)"
fail=0

# Forbidden filenames
if echo "$staged_files" | grep -E '(^|/)\.env($|\.)' | grep -vE '(^|/)\.env\.example$' ; then
  echo "secret-scan: .env file staged" >&2; fail=1
fi
if echo "$staged_files" | grep -E '\.(pem|key|p12|pfx|keystore|jks)$'; then
  echo "secret-scan: key/cert file staged" >&2; fail=1
fi

check() { # name, regex
  local hits
  hits="$(echo "$diff" | grep -nE -e "$2" || true)"
  if [ -n "$hits" ]; then
    echo "secret-scan: possible $1:" >&2
    # Print only line numbers + first 12 chars, never the full match.
    echo "$hits" | cut -c1-24 | sed 's/$/…/' >&2
    fail=1
  fi
}
check "private key (64 hex)" '(^|[^0-9a-fA-Fx])(0x)?[0-9a-fA-F]{64}([^0-9a-fA-F]|$)'
check "PEM block" '-----BEGIN [A-Z ]*PRIVATE KEY-----'
check "API key/token assignment" '(api[_-]?key|secret|token|password|access[_-]?key|private[_-]?key)["'"'"' ]*[:=] *["'"'"'][^"'"'"' ]{16,}'
check "AWS key" 'AKIA[0-9A-Z]{16}'
check "GitHub token" 'gh[pousr]_[A-Za-z0-9]{30,}'
check "mnemonic-like phrase" '"([a-z]{3,8} ){11,23}[a-z]{3,8}"'
check "home path" '/Users/[a-z]|/home/[a-z]|C:\\\\Users'
check "private IP" '(^|[^0-9])(192\.168\.|10\.[0-9]+\.[0-9]+\.|172\.(1[6-9]|2[0-9]|3[01])\.)[0-9]+'

if [ "$fail" -ne 0 ]; then
  echo "secret-scan: FAILED. Review the hits above." >&2
  exit 1
fi
echo "secret-scan: clean"
