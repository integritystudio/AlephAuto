#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-src}"
OUT_FILE="${2:-/tmp/const_export_rows.tsv}"
LIMIT_LINES="${3:-220}"

CONST_FILES="$(rg --files "$ROOT_DIR" | rg 'constants.*\.ts$|test-constants\.ts$' || true)"
if [[ -z "${CONST_FILES}" ]]; then
  echo "No constants files found under ${ROOT_DIR}" >&2
  exit 1
fi

printf '%s\n' "${CONST_FILES}" \
  | xargs rg -n --no-heading "^export const [A-Z0-9_]+\\s*=" \
  | perl -ne 'if(/^([^:]+):(\d+):export const ([A-Z0-9_]+)\s*=\s*(.*)$/){($file,$line,$name,$rhs)=($1,$2,$3,$4); $rhs =~ s/[\s;]+$//; print "$rhs\t$name\t$file:$line\n"}' \
  > "${OUT_FILE}"

awk -F '\t' '
function keep(rhs){
  return (rhs ~ /^-?[0-9][0-9_]*(\.[0-9]+)?$/ || rhs ~ /^[A-Z0-9_]+$/ || rhs ~ /^[A-Z0-9_]+\s*[\*\/+\-]\s*[A-Z0-9_]+$/ || rhs ~ /^[A-Z0-9_]+\s*[\*\/+\-]\s*[0-9_]+$/ || rhs ~ /^[0-9_]+\s*[\*\/+\-]\s*[A-Z0-9_]+$/)
}
{
  if (keep($1)) {
    count[$1]++
    rows[$1] = rows[$1] "\n  - " $2 " (" $3 ")"
  }
}
END {
  for (k in count) {
    if (count[k] > 1) print count[k] "\t" k rows[k] "\n"
  }
}
' "${OUT_FILE}" | sort -nr | sed -n "1,${LIMIT_LINES}p"
