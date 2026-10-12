#!/usr/bin/env bash
#
# Install the built plugin into an Obsidian vault.
#
# Pure Bash: no node, no jq, no external libraries. It only copies three files
# and flips the plugin on, so it runs anywhere (including a phone via Termux or
# a plain shell). Node is needed ONLY to build main.js, never to install.
#
# Usage:
#   scripts/install.sh [VAULT_PATH]
#
# VAULT_PATH may also be provided via the VAULT environment variable. If it is
# omitted, the script walks up from its own location looking for a `.obsidian`
# folder (which is the case when this repo lives inside the vault's plugins dir).

set -euo pipefail

PLUGIN_ID="block-review-flashcards"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

die() {
    echo "error: $*" >&2
    exit 1
}

find_vault() {
    if [ "$#" -ge 1 ] && [ -n "${1:-}" ]; then
        printf '%s\n' "$1"
        return 0
    fi
    if [ -n "${VAULT:-}" ]; then
        printf '%s\n' "$VAULT"
        return 0
    fi
    local dir="$SCRIPT_DIR"
    while [ "$dir" != "/" ]; do
        if [ -d "$dir/.obsidian" ]; then
            printf '%s\n' "$dir"
            return 0
        fi
        dir="$(dirname "$dir")"
    done
    return 1
}

VAULT_DIR="$(find_vault "${1:-}")" || die "could not find a vault; pass the path: scripts/install.sh /path/to/vault"

[ -d "$VAULT_DIR/.obsidian" ] || die "no .obsidian folder in: $VAULT_DIR"

for file in manifest.json main.js styles.css; do
    [ -f "$REPO_DIR/$file" ] || die "missing build output: $REPO_DIR/$file (run: pnpm build)"
done

PLUGIN_DIR="$VAULT_DIR/.obsidian/plugins/$PLUGIN_ID"
mkdir -p "$PLUGIN_DIR"

if [ "$(cd "$PLUGIN_DIR" && pwd)" = "$REPO_DIR" ]; then
    echo "repo already lives at $PLUGIN_DIR (nothing to copy)"
else
    cp "$REPO_DIR/manifest.json" "$PLUGIN_DIR/manifest.json"
    cp "$REPO_DIR/main.js" "$PLUGIN_DIR/main.js"
    cp "$REPO_DIR/styles.css" "$PLUGIN_DIR/styles.css"
    echo "installed -> $PLUGIN_DIR"
fi

# Enable the plugin by adding its id to community-plugins.json (best effort,
# the file is a flat JSON array of enabled plugin ids).
ENABLED_FILE="$VAULT_DIR/.obsidian/community-plugins.json"
tmp="$(mktemp)"

if [ ! -f "$ENABLED_FILE" ]; then
    printf '[\n  "%s"\n]\n' "$PLUGIN_ID" > "$ENABLED_FILE"
    echo "enabled -> $ENABLED_FILE (created)"
elif grep -q "\"$PLUGIN_ID\"" "$ENABLED_FILE"; then
    echo "already enabled in $ENABLED_FILE"
else
    # Insert the id just before the closing bracket, handling both the empty
    # array ([]) and a populated array (["a", ...]) cases.
    sed -E "s/\[[[:space:]]*\]/[\"$PLUGIN_ID\"]/; t; s/\]/,\n  \"$PLUGIN_ID\"\n]/" "$ENABLED_FILE" > "$tmp"
    mv "$tmp" "$ENABLED_FILE"
    echo "enabled -> $ENABLED_FILE"
fi

echo "done. Reload Obsidian (or toggle the plugin) to load it."
