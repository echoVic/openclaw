#!/usr/bin/env bash

extract_cli_semver() {
  local raw="${1:-}"
  local parsed=""
  parsed="$(
    printf '%s\n' "$raw" \
      | tr -d '\r' \
      | grep -Eo 'v?[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z]+(\.[0-9A-Za-z]+)*)?(\+[0-9A-Za-z.-]+)?' \
      | head -n 1 \
      || true
  )"
  printf '%s' "${parsed#v}"
}

verify_installed_cli() {
  local package_name="$1"
  local expected_version="$2"
  local cli_name="$package_name"
  local cmd_path=""
  local entry_path=""
  local npm_root=""
  local raw_version_output=""
  local installed_version=""

  cmd_path="$(command -v "$cli_name" || true)"
  if [[ -z "$cmd_path" && -x "$HOME/.npm-global/bin/$package_name" ]]; then
    cmd_path="$HOME/.npm-global/bin/$package_name"
  fi

  if [[ -z "$cmd_path" ]]; then
    npm_root="$(npm root -g 2>/dev/null || true)"
    if [[ -n "$npm_root" && -f "$npm_root/$package_name/dist/entry.js" ]]; then
      entry_path="$npm_root/$package_name/dist/entry.js"
    fi
  fi

  if [[ -z "$cmd_path" && -z "$entry_path" ]]; then
    echo "ERROR: $package_name is not on PATH" >&2
    return 1
  fi

  if [[ -n "$cmd_path" ]]; then
    raw_version_output="$("$cmd_path" --version 2>/dev/null | head -n 1 | tr -d '\r')"
  else
    raw_version_output="$(node "$entry_path" --version 2>/dev/null | head -n 1 | tr -d '\r')"
  fi

  installed_version="$(extract_cli_semver "$raw_version_output")"
  if [[ -z "$installed_version" ]]; then
    installed_version="$raw_version_output"
  fi

  echo "cli=$cli_name installed=$installed_version expected=$expected_version raw=$raw_version_output"
  if [[ "$installed_version" != "$expected_version" ]]; then
    echo "ERROR: expected ${cli_name}@${expected_version}, got ${cli_name}@${installed_version} (raw: ${raw_version_output})" >&2
    return 1
  fi

  echo "==> Sanity: CLI runs"
  if [[ -n "$cmd_path" ]]; then
    "$cmd_path" --help >/dev/null
  else
    node "$entry_path" --help >/dev/null
  fi
}
