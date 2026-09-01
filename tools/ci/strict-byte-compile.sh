#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
EMACS=${EMACS:-emacs}

cleanup() {
  find "$ROOT" -name '*.elc' -delete
}
trap cleanup EXIT
cleanup

cd "$ROOT"
"$EMACS" --batch -Q \
  -L compiler -L editor -L tools/org -L tools/worker \
  --eval '(setq byte-compile-error-on-warn t)' \
  -f batch-byte-compile \
  compiler/*.el \
  editor/*.el \
  tools/org/*.el \
  tools/worker/*.el \
  tests/eliscript-tests.el \
  tests/eliscript-project-tests.el \
  tests/eliscript-mode-tests.el \
  tests/eliscript-org-tests.el \
  tests/eliscript-worker-tests.el \
  tests/bootstrap-tests.el
