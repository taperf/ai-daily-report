#!/bin/bash
# AI Daily Pulse — Sync script
# Copies latest digest files, regenerates index.json, and pushes to GitHub.
# Called after each daily digest generation.

set -e

SITE_DIR="/root/.openclaw/workspace/ai-dashboard-site"
INDUSTRY_SRC="/root/.openclaw/workspace/ai-daily-digest/output"
BUILDERS_SRC="/root/.openclaw/workspace/ai-builders-digest/output"
DATA_DIR="$SITE_DIR/data"

cd "$SITE_DIR"

# Copy latest files
cp "$INDUSTRY_SRC"/digest_*.md "$DATA_DIR/" 2>/dev/null || true
cp "$INDUSTRY_SRC"/spread_digest_*.md "$DATA_DIR/" 2>/dev/null || true
cp "$BUILDERS_SRC"/builders_*.md "$DATA_DIR/" 2>/dev/null || true

# Regenerate index.json
python3 -c "
import json, glob, re
from datetime import datetime
import os

os.chdir('$DATA_DIR')

industry = sorted([re.search(r'digest_(\d{8})', f).group(1) for f in glob.glob('digest_*.md') if re.search(r'digest_(\d{8})', f)], reverse=True)
spread = sorted([re.search(r'spread_digest_(\d{8})', f).group(1) for f in glob.glob('spread_digest_*.md') if re.search(r'spread_digest_(\d{8})', f)], reverse=True)
builders = sorted([re.search(r'builders_(\d{8})', f).group(1) for f in glob.glob('builders_*.md') if re.search(r'builders_(\d{8})', f)], reverse=True)

index = {
    'lastUpdated': datetime.now().strftime('%Y-%m-%d %H:%M'),
    'industry': industry,
    'spread': spread,
    'builders': builders
}

with open('index.json', 'w') as f:
    json.dump(index, f, indent=2)
"

# Git push
git add -A
if git diff --cached --quiet; then
    echo "No changes to push."
    exit 0
fi

git commit -m "📡 update $(date +%Y-%m-%d)"
git push origin main 2>&1

echo "✅ Synced to GitHub Pages"
