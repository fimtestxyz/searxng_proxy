#!/usr/bin/env bash
# ==============================================================================
# Universal Skill Installer for AI Agents
# Supports: Antigravity, Pi Agent, Hermes, OpenClaw, Claude Code, and Codex
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_SRC="${SCRIPT_DIR}/searxng-research"
USE_SYMLINK=true

# Ensure scripts are executable
chmod +x "${SKILL_SRC}/scripts/search.sh" 2>/dev/null || true
chmod +x "${SKILL_SRC}/scripts/search.py" 2>/dev/null || true

# Target directories
ANTIGRAVITY_GEMINI_DIR="${HOME}/.gemini/config/skills"
ANTIGRAVITY_DIR="${HOME}/.antigravity/skills"
PI_DIR="${HOME}/.pi/agent/skills"
HERMES_DIR="${HOME}/.hermes/skills"
OPENCLAW_DIR="${HOME}/.openclaw/skills"
CLAUDE_GLOBAL_DIR="${HOME}/.claude/skills"
CLAUDE_PROJECT_DIR="$(pwd)/.claude/skills"
CODEX_DIR="${HOME}/.codex/skills"

show_help() {
  echo "SearXNG Research Skill — Universal Agent Installer"
  echo "Usage: $0 [OPTIONS]"
  echo ""
  echo "Target Options:"
  echo "  --all            Install for all detected agent platforms"
  echo "  --antigravity    Install into Antigravity (~/.gemini/config/skills)"
  echo "  --pi             Install into Pi Agent (~/.pi/skills and ~/.openclaw/skills)"
  echo "  --hermes         Install into Hermes (~/.hermes/skills)"
  echo "  --openclaw       Install into OpenClaw (~/.openclaw/skills)"
  echo "  --claude         Install into Claude Code (~/.claude/skills and local .claude/skills)"
  echo "  --codex          Install into Codex (~/.codex/skills)"
  echo "  --dest <dir>     Install into a custom target directory"
  echo ""
  echo "General Options:"
  echo "  --copy           Copy files instead of creating symbolic links"
  echo "  --check          Check which agent environments exist on this machine"
  echo "  -h, --help       Show this help message"
}

install_to() {
  local target_base="$1"
  local name="$2"
  local target_dest="${target_base}/searxng-research"

  mkdir -p "${target_base}"
  
  if [[ -e "${target_dest}" || -L "${target_dest}" ]]; then
    rm -rf "${target_dest}"
  fi

  if [[ "$USE_SYMLINK" == "true" ]]; then
    ln -s "${SKILL_SRC}" "${target_dest}"
    echo "  [OK] Linked to ${name}: ${target_dest}"
  else
    cp -R "${SKILL_SRC}" "${target_dest}"
    echo "  [OK] Copied to ${name}: ${target_dest}"
  fi
}

check_environments() {
  echo "=== Checking Available Agent Platforms ==="
  echo -n "  Antigravity (~/.gemini or ~/.antigravity): "
  ([[ -d "${HOME}/.gemini" ]] || [[ -d "${HOME}/.antigravity" ]]) && echo "Detected" || echo "Not found"

  echo -n "  Pi Agent (~/.pi):                          "
  [[ -d "${HOME}/.pi" ]] && echo "Detected" || echo "Not found"

  echo -n "  Hermes (~/.hermes):                        "
  [[ -d "${HOME}/.hermes" ]] && echo "Detected" || echo "Not found"

  echo -n "  OpenClaw (~/.openclaw):                    "
  [[ -d "${HOME}/.openclaw" ]] && echo "Detected" || echo "Not found"

  echo -n "  Claude Code (~/.claude):                   "
  [[ -d "${HOME}/.claude" ]] && echo "Detected" || echo "Not found"

  echo -n "  Codex (~/.codex):                          "
  [[ -d "${HOME}/.codex" ]] && echo "Detected" || echo "Not found"
  echo ""
}

# Flags
INSTALL_ALL=false
INSTALL_ANTIGRAVITY=false
INSTALL_PI=false
INSTALL_HERMES=false
INSTALL_OPENCLAW=false
INSTALL_CLAUDE=false
INSTALL_CODEX=false
CUSTOM_DEST=""

if [[ $# -eq 0 ]]; then
  INSTALL_ALL=true
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)
      INSTALL_ALL=true
      shift
      ;;
    --antigravity)
      INSTALL_ANTIGRAVITY=true
      shift
      ;;
    --pi)
      INSTALL_PI=true
      shift
      ;;
    --hermes)
      INSTALL_HERMES=true
      shift
      ;;
    --openclaw)
      INSTALL_OPENCLAW=true
      shift
      ;;
    --claude)
      INSTALL_CLAUDE=true
      shift
      ;;
    --codex)
      INSTALL_CODEX=true
      shift
      ;;
    --copy)
      USE_SYMLINK=false
      shift
      ;;
    --dest)
      CUSTOM_DEST="$2"
      shift 2
      ;;
    --check)
      check_environments
      exit 0
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      show_help
      exit 1
      ;;
  esac
done

echo "Installing searxng-research skill..."
count=0

# Custom directory
if [[ -n "$CUSTOM_DEST" ]]; then
  install_to "$CUSTOM_DEST" "Custom Directory"
  count=$((count + 1))
fi

# Antigravity
if [[ "$INSTALL_ALL" == "true" || "$INSTALL_ANTIGRAVITY" == "true" ]]; then
  if [[ -d "${HOME}/.gemini" || "$INSTALL_ANTIGRAVITY" == "true" ]]; then
    install_to "$ANTIGRAVITY_GEMINI_DIR" "Antigravity"
    count=$((count + 1))
  fi
  if [[ -d "${HOME}/.antigravity" ]]; then
    install_to "$ANTIGRAVITY_DIR" "Antigravity"
    count=$((count + 1))
  fi
fi

# Pi Agent
if [[ "$INSTALL_ALL" == "true" || "$INSTALL_PI" == "true" ]]; then
  if [[ -d "${HOME}/.pi" || "$INSTALL_PI" == "true" ]]; then
    install_to "$PI_DIR" "Pi Agent"
    count=$((count + 1))
  fi
  if [[ -d "${HOME}/.openclaw" || "$INSTALL_PI" == "true" ]]; then
    install_to "$OPENCLAW_DIR" "OpenClaw / Pi Agent"
    count=$((count + 1))
  fi
fi

# Hermes
if [[ "$INSTALL_ALL" == "true" || "$INSTALL_HERMES" == "true" ]]; then
  if [[ -d "${HOME}/.hermes" || "$INSTALL_HERMES" == "true" ]]; then
    install_to "$HERMES_DIR" "Hermes"
    count=$((count + 1))
  fi
fi

# OpenClaw (standalone flag if not already installed via --pi)
if [[ "$INSTALL_OPENCLAW" == "true" && "$INSTALL_PI" == "false" && "$INSTALL_ALL" == "false" ]]; then
  install_to "$OPENCLAW_DIR" "OpenClaw"
  count=$((count + 1))
fi

# Claude Code
if [[ "$INSTALL_ALL" == "true" || "$INSTALL_CLAUDE" == "true" ]]; then
  if [[ -d "${HOME}/.claude" || "$INSTALL_CLAUDE" == "true" ]]; then
    install_to "$CLAUDE_GLOBAL_DIR" "Claude Code (Global)"
    count=$((count + 1))
  fi
  if [[ -d "$(pwd)/.claude" ]]; then
    install_to "$CLAUDE_PROJECT_DIR" "Claude Code (Project)"
    count=$((count + 1))
  fi
fi

# Codex
if [[ "$INSTALL_ALL" == "true" || "$INSTALL_CODEX" == "true" ]]; then
  if [[ -d "${HOME}/.codex" || "$INSTALL_CODEX" == "true" ]]; then
    install_to "$CODEX_DIR" "Codex"
    count=$((count + 1))
  fi
fi

echo ""
echo "Installation complete! Skill installed in ${count} destination(s)."
echo "Verify anytime using: bash ${SKILL_SRC}/scripts/search.sh -q \"test\""
