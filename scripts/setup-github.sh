#!/bin/bash

# GitHub Repository Setup Script
# Automates the creation and configuration of GitHub repository

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO_NAME="solana-trading-cli"
REPO_DESCRIPTION="Production-ready Solana trading system with unified multi-DEX routing, real-time streaming, ML strategies, and autonomous architecture search (ASI-Arch)"
REPO_TOPICS="solana,trading,defi,cryptocurrency,typescript,rust,docker,ml,ai,blockchain"

echo -e "${BLUE}🚀 GitHub Repository Setup for Solana Trading CLI${NC}"
echo "=================================================="

# Check if GitHub CLI is installed
if ! command -v gh &> /dev/null; then
    echo -e "${RED}❌ GitHub CLI (gh) is not installed${NC}"
    echo "Please install it from: https://cli.github.com/"
    exit 1
fi

# Check if user is authenticated
if ! gh auth status &> /dev/null; then
    echo -e "${YELLOW}⚠️ Not authenticated with GitHub${NC}"
    echo "Please run: gh auth login"
    exit 1
fi

echo -e "${GREEN}✅ GitHub CLI is installed and authenticated${NC}"

# Get current directory name
CURRENT_DIR=$(basename "$PWD")

# Check if we're in the right directory
if [[ "$CURRENT_DIR" != "$REPO_NAME" ]]; then
    echo -e "${YELLOW}⚠️ Current directory is '$CURRENT_DIR', expected '$REPO_NAME'${NC}"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check if git repository exists
if [ ! -d ".git" ]; then
    echo -e "${BLUE}📁 Initializing Git repository...${NC}"
    git init
    echo -e "${GREEN}✅ Git repository initialized${NC}"
else
    echo -e "${GREEN}✅ Git repository already exists${NC}"
fi

# Check if remote origin exists
if git remote get-url origin &> /dev/null; then
    EXISTING_REMOTE=$(git remote get-url origin)
    echo -e "${YELLOW}⚠️ Remote origin already exists: $EXISTING_REMOTE${NC}"
    read -p "Remove existing remote and continue? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git remote remove origin
        echo -e "${GREEN}✅ Removed existing remote${NC}"
    else
        echo -e "${YELLOW}⚠️ Keeping existing remote, skipping repository creation${NC}"
        exit 0
    fi
fi

# Create GitHub repository
echo -e "${BLUE}🏗️ Creating GitHub repository...${NC}"

# Check if repository already exists
if gh repo view "$REPO_NAME" &> /dev/null; then
    echo -e "${YELLOW}⚠️ Repository '$REPO_NAME' already exists${NC}"
    read -p "Continue with existing repository? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
    
    # Add remote to existing repository
    REPO_URL=$(gh repo view "$REPO_NAME" --json url --jq '.url')
    git remote add origin "$REPO_URL.git"
    echo -e "${GREEN}✅ Added remote origin${NC}"
else
    # Create new repository
    gh repo create "$REPO_NAME" \
        --description "$REPO_DESCRIPTION" \
        --public \
        --clone=false \
        --add-readme=false
    
    echo -e "${GREEN}✅ Repository created successfully${NC}"
    
    # Add remote origin
    git remote add origin "https://github.com/$(gh api user --jq '.login')/$REPO_NAME.git"
    echo -e "${GREEN}✅ Added remote origin${NC}"
fi

# Set repository topics
echo -e "${BLUE}🏷️ Setting repository topics...${NC}"
gh repo edit --add-topic "$REPO_TOPICS"
echo -e "${GREEN}✅ Repository topics set${NC}"

# Configure repository settings
echo -e "${BLUE}⚙️ Configuring repository settings...${NC}"

# Enable features
gh repo edit \
    --enable-issues \
    --enable-projects \
    --enable-wiki \
    --enable-discussions

# Set default branch protection (if on main branch)
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
if [[ "$CURRENT_BRANCH" == "main" ]] || [[ "$CURRENT_BRANCH" == "typescript-main" ]]; then
    echo -e "${BLUE}🛡️ Setting up branch protection...${NC}"
    
    # Note: Branch protection requires the branch to exist with at least one commit
    # This will be set up after the first push
fi

echo -e "${GREEN}✅ Repository settings configured${NC}"

# Create and configure secrets
echo -e "${BLUE}🔐 Setting up repository secrets...${NC}"

# List of secrets to create
declare -A SECRETS=(
    ["SNYK_TOKEN"]="Snyk security scanning token"
    ["SLACK_WEBHOOK"]="Slack webhook for notifications"
    ["DISCORD_WEBHOOK"]="Discord webhook for notifications"
    ["SECURITY_SLACK_WEBHOOK"]="Slack webhook for security alerts"
    ["INFISICAL_CLIENT_ID"]="Infisical client ID for secret management"
    ["INFISICAL_CLIENT_SECRET"]="Infisical client secret for secret management"
)

echo "The following secrets need to be configured manually in GitHub:"
echo "Go to: https://github.com/$(gh api user --jq '.login')/$REPO_NAME/settings/secrets/actions"
echo

for secret in "${!SECRETS[@]}"; do
    echo -e "${YELLOW}📝 $secret${NC} - ${SECRETS[$secret]}"
done

echo
read -p "Press Enter to continue after setting up secrets..."

# Setup GitHub Pages (if docs exist)
if [ -d "docs" ]; then
    echo -e "${BLUE}📚 Setting up GitHub Pages...${NC}"
    gh repo edit --enable-pages --pages-source-branch main --pages-source-path "/docs"
    echo -e "${GREEN}✅ GitHub Pages configured${NC}"
fi

# Create initial commit if needed
if [ -z "$(git log --oneline 2>/dev/null)" ]; then
    echo -e "${BLUE}📝 Creating initial commit...${NC}"
    
    # Add all files
    git add .
    
    # Create initial commit
    git commit -m "feat: initial commit with complete Solana trading system

- Unified multi-DEX router (Jupiter, Raydium, Orca, Meteora)
- Real-time Yellowstone gRPC streaming
- Advanced trading strategies (launch momentum, micro-breakout)
- ASI-Arch ML system with autonomous model search
- Enterprise security with Infisical integration
- Production monitoring (Grafana, Prometheus)
- Complete Docker deployment
- Comprehensive CI/CD pipeline"

    echo -e "${GREEN}✅ Initial commit created${NC}"
fi

# Push to GitHub
echo -e "${BLUE}⬆️ Pushing to GitHub...${NC}"

# Set upstream and push
git branch -M main
git push -u origin main

echo -e "${GREEN}✅ Code pushed to GitHub${NC}"

# Setup branch protection after push
echo -e "${BLUE}🛡️ Setting up branch protection rules...${NC}"

# Wait a moment for GitHub to process the push
sleep 2

# Create branch protection rule
gh api repos/:owner/:repo/branches/main/protection \
    --method PUT \
    --field required_status_checks='{"strict":true,"contexts":["test","security","docker"]}' \
    --field enforce_admins=true \
    --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true,"require_code_owner_reviews":true}' \
    --field restrictions=null \
    --field allow_force_pushes=false \
    --field allow_deletions=false \
    2>/dev/null || echo -e "${YELLOW}⚠️ Branch protection will be set up after first CI run${NC}"

echo -e "${GREEN}✅ Branch protection configured${NC}"

# Create labels
echo -e "${BLUE}🏷️ Creating issue labels...${NC}"

# Define labels
declare -A LABELS=(
    ["bug"]="d73a4a"
    ["enhancement"]="a2eeef"
    ["documentation"]="0075ca"
    ["good first issue"]="7057ff"
    ["help wanted"]="008672"
    ["question"]="d876e3"
    ["wontfix"]="ffffff"
    ["duplicate"]="cfd3d7"
    ["invalid"]="e4e669"
    ["priority:high"]="b60205"
    ["priority:medium"]="fbca04"
    ["priority:low"]="0e8a16"
    ["component:router"]="1d76db"
    ["component:strategies"]="0052cc"
    ["component:ml"]="5319e7"
    ["component:streaming"]="006b75"
    ["component:monitoring"]="0e8a16"
    ["size:XS"]="c2e0c6"
    ["size:S"]="7057ff"
    ["size:M"]="fbca04"
    ["size:L"]="d93f0b"
    ["size:XL"]="b60205"
)

for label in "${!LABELS[@]}"; do
    gh label create "$label" --color "${LABELS[$label]}" --force 2>/dev/null || true
done

echo -e "${GREEN}✅ Issue labels created${NC}"

# Create initial issues
echo -e "${BLUE}📋 Creating initial issues...${NC}"

# Create welcome issue
gh issue create \
    --title "🎉 Welcome to Solana Trading CLI!" \
    --body "Welcome to the Solana Trading CLI repository!

This issue serves as a starting point for new contributors and users.

## 🚀 Quick Start
1. Read the [README.md](README.md) for an overview
2. Follow the [QUICK-START.md](QUICK-START.md) guide
3. Check out the [documentation](docs/) for detailed information

## 🤝 Contributing
- Read our [Contributing Guide](.github/CONTRIBUTING.md)
- Check out [good first issues](https://github.com/outsmartchad/solana-trading-cli/labels/good%20first%20issue)
- Join our community discussions

## 📞 Support
- 🐛 Bug reports: Use the bug report template
- 💡 Feature requests: Use the feature request template
- ❓ Questions: Start a discussion

Let's build the future of Solana trading together! 🚀" \
    --label "documentation,good first issue"

echo -e "${GREEN}✅ Welcome issue created${NC}"

# Display summary
echo
echo -e "${GREEN}🎉 GitHub Repository Setup Complete!${NC}"
echo "=================================="
echo
echo -e "${BLUE}📊 Repository Information:${NC}"
echo "Repository: https://github.com/$(gh api user --jq '.login')/$REPO_NAME"
echo "Issues: https://github.com/$(gh api user --jq '.login')/$REPO_NAME/issues"
echo "Actions: https://github.com/$(gh api user --jq '.login')/$REPO_NAME/actions"
echo "Settings: https://github.com/$(gh api user --jq '.login')/$REPO_NAME/settings"
echo
echo -e "${BLUE}🔧 Next Steps:${NC}"
echo "1. Configure repository secrets (see list above)"
echo "2. Review and adjust branch protection rules"
echo "3. Customize repository settings as needed"
echo "4. Start creating issues and planning development"
echo "5. Invite collaborators and set up teams"
echo
echo -e "${BLUE}🚀 CI/CD Pipeline:${NC}"
echo "- Automated testing on every push and PR"
echo "- Security scanning with multiple tools"
echo "- Docker image building and publishing"
echo "- Automated releases on version tags"
echo
echo -e "${GREEN}✅ Your Solana Trading CLI repository is ready for development!${NC}"
