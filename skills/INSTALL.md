# Skill Installation Guide: SearXNG Research

This guide explains how to install and configure the `searxng-research` skill across all major AI agent platforms: **Pi Agent / OpenClaw**, **Claude Code**, **Codex**, **Antigravity**, and **Cursor**.

---

## 1. Automated One-Line Install

Run the universal installer script from the root of this repository:

```bash
# Install to all detected agent platforms on this machine
bash skills/install.sh --all
```

To target a specific agent:
```bash
# For Pi Agent / OpenClaw
bash skills/install.sh --openclaw

# For Claude Code
bash skills/install.sh --claude

# For OpenAI Codex / Antigravity
bash skills/install.sh --codex
```

Check detected environments anytime:
```bash
bash skills/install.sh --check
```

---

## 2. Platform-Specific Manual Installation

### A. Pi Agent / OpenClaw
OpenClaw and Pi Agent automatically discover skills placed in `~/.openclaw/skills/` or in the project's `./skills/` directory.

1. **Option 1: Symlink (Recommended)**:
   ```bash
   mkdir -p ~/.openclaw/skills
   ln -s "$(pwd)/skills/searxng-research" ~/.openclaw/skills/searxng-research
   ```
2. **Option 2: Copy**:
   ```bash
   mkdir -p ~/.openclaw/skills
   cp -R "$(pwd)/skills/searxng-research" ~/.openclaw/skills/searxng-research
   ```
3. **Usage in OpenClaw / Pi Agent**:
   In your agent prompt, the skill is automatically active. You can invoke it by asking:
   > *"Use searxng-research to find Nvidia Q3 earnings using the fintech_ir preset"*

---

### B. Claude Code (Anthropic)
Claude Code loads skills from `~/.claude/skills/` (global) or `.claude/skills/` (current project).

1. **Install Globally**:
   ```bash
   mkdir -p ~/.claude/skills
   ln -s "$(pwd)/skills/searxng-research" ~/.claude/skills/searxng-research
   ```
2. **Install to Current Project Only**:
   ```bash
   mkdir -p .claude/skills
   ln -s "$(pwd)/skills/searxng-research" .claude/skills/searxng-research
   ```
3. **Usage in Claude Code**:
   Claude Code reads `SKILL.md` and calls the HTTP API endpoint directly (`http://localhost:5555/api/agent/search`).

---

### C. OpenAI Codex / Python Agents (LangChain, AutoGen, CrewAI)
Agents can call the REST API directly or use standard HTTP requests:
```python
import requests

res = requests.post("http://localhost:5555/api/agent/search", json={
    "search_query": "Coinbase SEC order",
    "preset": "regulatory",
    "limit": 2
})
data = res.json()
for article in data["results"]:
    print(article["title"])
    print(article["markdown"])
```

---

### D. Google Antigravity / Gemini
Antigravity discovers user skills in `~/.gemini/config/skills/`.

1. **Install**:
   ```bash
   mkdir -p ~/.gemini/config/skills
   ln -s "$(pwd)/skills/searxng-research" ~/.gemini/config/skills/searxng-research
   ```
2. **Verify**:
   The skill `searxng-research` will appear in the agent's available skills list.

---

## 3. Skill Files Overview

```text
skills/
├── INSTALL.md                      # This installation guide
├── install.sh                      # Universal multi-platform installer script
└── searxng-research/               # Skill directory
    ├── SKILL.md                    # Core Agent skill definition & instructions
    ├── scripts/
    │   ├── search.sh               # Bash/cURL CLI helper for terminal agents
    │   └── search.py               # Zero-dependency Python 3 helper & library
    └── references/
        └── presets.md              # Research presets breakdown and domain syntax
```

---

## 4. Verifying Installation

Make sure your proxy server is running:
```bash
npm start
```

Run a test query via the installed skill script:
```bash
# Via Bash
bash skills/searxng-research/scripts/search.sh -q "DeepSeek v3 architecture" -p tech_intel -l 2

# Via Python
python3 skills/searxng-research/scripts/search.py "Federal Reserve rate decision" --preset macro --limit 1
```

If the proxy runs on a custom port or remote host, set the environment variable:
```bash
export SEARXNG_PROXY_URL="http://your-server:5555"
```

---

## 5. Troubleshooting

| Symptom | Cause | Solution |
| :--- | :--- | :--- |
| `Connection failed to http://localhost:5555` | SearXNG Proxy server is not running | Run `npm start` in the `searxng_proxy` folder. |
| `Permission denied` on `search.sh` | Missing execution permissions | Run `chmod +x skills/searxng-research/scripts/*.sh skills/searxng-research/scripts/*.py`. |
| `HTTP Error 502: SearXNG request failed` | Upstream SearXNG engine is not reachable | Ensure your SearXNG container is up (`docker-compose up -d`). |
| Custom presets not recognized | Typo in preset name | Check `agent/presets.yml` or run `curl http://localhost:5555/api/agent/presets`. |
