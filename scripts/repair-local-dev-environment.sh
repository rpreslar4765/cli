#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node_version="$(tr -d '[:space:]' < "${repo_root}/.nvmrc")"

if [[ -z "${node_version}" ]]; then
  echo "Failed to read the required Node.js version from ${repo_root}/.nvmrc" >&2
  exit 1
fi

case "$(uname -s)" in
  Linux)
    platform="linux"
    archive_extension="tar.xz"
    ;;
  Darwin)
    platform="darwin"
    archive_extension="tar.gz"
    ;;
  *)
    echo "Unsupported operating system: $(uname -s)" >&2
    exit 1
    ;;
esac

case "$(uname -m)" in
  x86_64)
    architecture="x64"
    ;;
  arm64 | aarch64)
    architecture="arm64"
    ;;
  *)
    echo "Unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

tools_dir="${XDG_CACHE_HOME:-${HOME}/.cache}/snyk-cli-dev"
node_dir="${tools_dir}/node-v${node_version}-${platform}-${architecture}"
node_bin_dir="${node_dir}/bin"
node_archive_name="node-v${node_version}-${platform}-${architecture}.${archive_extension}"
node_archive_path="${tools_dir}/${node_archive_name}"
node_download_url="https://nodejs.org/dist/v${node_version}/${node_archive_name}"
npm_auth_token="${NODE_AUTH_TOKEN:-${NPM_TOKEN:-}}"

mkdir -p "${tools_dir}"

download_file() {
  local url="$1"
  local output="$2"

  if command -v curl >/dev/null 2>&1; then
    curl --fail --location --silent --show-error --output "${output}" "${url}"
    return
  fi

  if command -v wget >/dev/null 2>&1; then
    wget --quiet --output-document="${output}" "${url}"
    return
  fi

  echo "Either curl or wget is required to download Node.js." >&2
  exit 1
}

if [[ ! -x "${node_bin_dir}/node" ]]; then
  rm -rf "${node_dir}"
  rm -f "${node_archive_path}"

  echo "Downloading Node.js v${node_version} from ${node_download_url}"
  download_file "${node_download_url}" "${node_archive_path}"

  temp_extract_dir="$(mktemp -d "${tools_dir}/extract.XXXXXX")"
  trap 'rm -rf "${temp_extract_dir}"' EXIT

  tar -xf "${node_archive_path}" -C "${temp_extract_dir}"
  mv "${temp_extract_dir}/node-v${node_version}-${platform}-${architecture}" "${node_dir}"
  rm -f "${node_archive_path}"

  trap - EXIT
  rm -rf "${temp_extract_dir}"
fi

export PATH="${node_bin_dir}:${PATH}"

active_node_version="$(node --version)"
if [[ "${active_node_version}" != "v${node_version}" ]]; then
  echo "Expected Node.js v${node_version}, but resolved ${active_node_version}" >&2
  exit 1
fi

echo "Using Node.js ${active_node_version} from ${node_bin_dir}"

cd "${repo_root}"

if [[ $# -eq 0 ]]; then
  set -- npm ci --no-audit --no-progress --prefer-offline
fi

if [[ "$1" == "npm" ]] && [[ "${2:-}" =~ ^(ci|install)$ ]]; then
  if [[ -z "${npm_auth_token}" ]]; then
    echo "This repository installs private npm packages. Export NODE_AUTH_TOKEN (or NPM_TOKEN) and re-run the repair script." >&2
    exit 1
  fi

  npm_userconfig="$(mktemp "${tools_dir}/npmrc.XXXXXX")"
  trap 'rm -f "${npm_userconfig}"' EXIT
  printf '//registry.npmjs.org/:_authToken=%s\n' "${npm_auth_token}" > "${npm_userconfig}"
  export NPM_CONFIG_USERCONFIG="${npm_userconfig}"
fi

echo "Running: $*"
"$@"
