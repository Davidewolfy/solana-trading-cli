# 🐙 GitHub Repository Setup Guide

Complete guide for setting up the Solana Trading CLI GitHub repository with CI/CD pipeline.

## 🚀 Quick Setup

### Automated Setup (Recommended)
```bash
# Run the automated setup script
make setup-github
```

This script will:
- Create GitHub repository
- Configure repository settings
- Set up branch protection
- Create issue labels
- Configure CI/CD pipeline
- Set up initial issues

### Manual Setup
If you prefer manual setup or need to customize the process:

## 📋 Prerequisites

### Required Tools
- **GitHub CLI** (`gh`) - [Install here](https://cli.github.com/)
- **Git** 2.30+
- **Node.js** 18+
- **Docker** 20.10+

### Authentication
```bash
# Login to GitHub CLI
gh auth login

# Verify authentication
gh auth status
```

## 🏗️ Repository Creation

### 1. Create Repository
```bash
# Create public repository
gh repo create solana-trading-cli \
  --description "Production-ready Solana trading system with unified multi-DEX routing" \
  --public \
  --clone=false

# Add remote origin
git remote add origin https://github.com/YOUR_USERNAME/solana-trading-cli.git
```

### 2. Configure Repository Settings
```bash
# Enable features
gh repo edit \
  --enable-issues \
  --enable-projects \
  --enable-wiki \
  --enable-discussions

# Set topics
gh repo edit --add-topic "solana,trading,defi,cryptocurrency,typescript,rust,docker,ml,ai,blockchain"
```

### 3. Initial Push
```bash
# Create initial commit
git add .
git commit -m "feat: initial commit with complete Solana trading system"

# Push to GitHub
git branch -M main
git push -u origin main
```

## 🔐 Secrets Configuration

### Required Secrets
Navigate to: `https://github.com/YOUR_USERNAME/solana-trading-cli/settings/secrets/actions`

| Secret Name | Description | Required |
|-------------|-------------|----------|
| `SNYK_TOKEN` | Snyk security scanning token | Yes |
| `SLACK_WEBHOOK` | Slack webhook for notifications | Optional |
| `DISCORD_WEBHOOK` | Discord webhook for notifications | Optional |
| `SECURITY_SLACK_WEBHOOK` | Slack webhook for security alerts | Optional |
| `INFISICAL_CLIENT_ID` | Infisical client ID | Optional |
| `INFISICAL_CLIENT_SECRET` | Infisical client secret | Optional |

### Setting Up Secrets

#### 1. Snyk Token (Security Scanning)
```bash
# Sign up at https://snyk.io/
# Get your token from https://app.snyk.io/account
# Add as SNYK_TOKEN secret
```

#### 2. Slack Webhooks (Notifications)
```bash
# Create Slack app at https://api.slack.com/apps
# Enable incoming webhooks
# Copy webhook URL and add as SLACK_WEBHOOK secret
```

#### 3. Discord Webhooks (Notifications)
```bash
# Go to Discord server settings
# Create webhook in desired channel
# Copy webhook URL and add as DISCORD_WEBHOOK secret
```

#### 4. Infisical Secrets (Optional)
```bash
# Sign up at https://infisical.com/
# Create project and get client credentials
# Add INFISICAL_CLIENT_ID and INFISICAL_CLIENT_SECRET
```

## 🛡️ Branch Protection

### Automated Setup
Branch protection is automatically configured by the setup script after the first push.

### Manual Setup
```bash
# Set up branch protection for main branch
gh api repos/:owner/:repo/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["test","security","docker"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true}' \
  --field restrictions=null
```

### Protection Rules
- ✅ **Require status checks** - CI must pass
- ✅ **Require pull request reviews** - 1 approving review
- ✅ **Dismiss stale reviews** - Re-review after changes
- ✅ **Restrict pushes** - No direct pushes to main
- ✅ **Enforce for admins** - Rules apply to everyone

## 🏷️ Issue Labels

### Automated Creation
Labels are automatically created by the setup script.

### Manual Creation
```bash
# Create priority labels
gh label create "priority:high" --color "b60205"
gh label create "priority:medium" --color "fbca04"
gh label create "priority:low" --color "0e8a16"

# Create component labels
gh label create "component:router" --color "1d76db"
gh label create "component:strategies" --color "0052cc"
gh label create "component:ml" --color "5319e7"
gh label create "component:streaming" --color "006b75"
gh label create "component:monitoring" --color "0e8a16"

# Create size labels
gh label create "size:XS" --color "c2e0c6"
gh label create "size:S" --color "7057ff"
gh label create "size:M" --color "fbca04"
gh label create "size:L" --color "d93f0b"
gh label create "size:XL" --color "b60205"
```

## 🔄 CI/CD Pipeline

### Workflows Overview
The repository includes several GitHub Actions workflows:

#### 1. **CI/CD Pipeline** (`.github/workflows/ci-cd.yml`)
- **Triggers**: Push to main/develop, Pull requests
- **Jobs**: Test, Security scan, Docker build, Integration tests, Deploy
- **Features**: Multi-platform builds, artifact caching, automated deployment

#### 2. **Security Scanning** (`.github/workflows/security.yml`)
- **Triggers**: Push, PR, Weekly schedule
- **Jobs**: Dependency scan, Code scan, Secret scan, Docker scan
- **Tools**: npm audit, cargo audit, CodeQL, TruffleHog, Trivy

#### 3. **Release Management** (`.github/workflows/release.yml`)
- **Triggers**: Version tags, Manual dispatch
- **Jobs**: Build artifacts, Create releases, Update documentation
- **Features**: Multi-platform binaries, Docker images, Automated changelog

#### 4. **Dependency Updates** (`.github/workflows/dependency-update.yml`)
- **Triggers**: Weekly schedule, Manual dispatch
- **Jobs**: Update Node.js deps, Update Rust deps, Security audit
- **Features**: Automated PRs, Vulnerability detection, Cleanup

### Workflow Configuration

#### Environment Variables
```yaml
env:
  NODE_VERSION: '22.2.0'
  RUST_VERSION: '1.70'
  REGISTRY: ghcr.io
```

#### Caching Strategy
- **Node.js**: npm cache with package-lock.json hash
- **Rust**: Cargo cache with Cargo.lock hash
- **Docker**: GitHub Actions cache for layers

## 📊 Monitoring & Observability

### GitHub Actions Monitoring
- **Workflow runs**: Monitor in Actions tab
- **Failed builds**: Automatic Slack notifications
- **Security alerts**: Dedicated security channel
- **Performance**: Build time and artifact size tracking

### Metrics Collection
- **Build times**: Tracked per workflow
- **Test coverage**: Uploaded to codecov (optional)
- **Security scans**: Results stored as artifacts
- **Dependency updates**: Automated tracking

## 🚀 Release Process

### Automated Releases
```bash
# Create and push version tag
make create-release VERSION=v1.0.0

# This triggers:
# 1. Build multi-platform binaries
# 2. Create Docker images
# 3. Generate changelog
# 4. Create GitHub release
# 5. Send notifications
```

### Manual Release Steps
1. **Update version** in package.json and Cargo.toml
2. **Create tag**: `git tag -a v1.0.0 -m "Release v1.0.0"`
3. **Push tag**: `git push origin v1.0.0`
4. **Monitor workflow** in Actions tab
5. **Verify release** artifacts and Docker images

### Release Artifacts
- **Binaries**: Linux, macOS, Windows
- **Docker images**: Multi-architecture (amd64, arm64)
- **Documentation**: Updated README and docs
- **Changelog**: Auto-generated from commits

## 🤝 Collaboration Setup

### Team Management
```bash
# Add collaborators
gh repo add-collaborator USERNAME --permission=push

# Create teams (for organizations)
gh api orgs/ORG/teams -f name="solana-trading-core" -f privacy="closed"
```

### Issue Templates
Pre-configured templates are available:
- **Bug Report**: `.github/ISSUE_TEMPLATE/bug_report.md`
- **Feature Request**: `.github/ISSUE_TEMPLATE/feature_request.md`
- **Pull Request**: `.github/pull_request_template.md`

### Contributing Guidelines
- **Code of Conduct**: Respectful and inclusive community
- **Contribution Guide**: `.github/CONTRIBUTING.md`
- **Development Setup**: Local development instructions
- **Testing Requirements**: Comprehensive test coverage

## 🔧 Troubleshooting

### Common Issues

#### 1. **CI/CD Failures**
```bash
# Check workflow logs
gh run list --limit 10
gh run view RUN_ID --log

# Re-run failed jobs
gh run rerun RUN_ID
```

#### 2. **Secret Configuration**
```bash
# List configured secrets
gh secret list

# Update secret
gh secret set SECRET_NAME
```

#### 3. **Branch Protection Issues**
```bash
# Check protection status
gh api repos/:owner/:repo/branches/main/protection

# Update protection rules
gh api repos/:owner/:repo/branches/main/protection --method PUT --input protection.json
```

#### 4. **Docker Build Failures**
```bash
# Test Docker build locally
docker build -t solana-trading-cli:test .

# Check multi-platform build
docker buildx build --platform linux/amd64,linux/arm64 .
```

### Getting Help
- **GitHub Issues**: Report bugs and request features
- **GitHub Discussions**: Ask questions and share ideas
- **Discord**: Real-time community support
- **Documentation**: Comprehensive guides and examples

## 📚 Additional Resources

### GitHub Features
- **Projects**: Kanban boards for project management
- **Wiki**: Additional documentation
- **Discussions**: Community Q&A
- **Security**: Vulnerability alerts and dependency scanning

### Best Practices
- **Commit Messages**: Follow Conventional Commits
- **Branch Naming**: Use descriptive prefixes (feat/, fix/, docs/)
- **PR Reviews**: Require code review before merging
- **Testing**: Maintain high test coverage
- **Documentation**: Keep docs up-to-date

### Integration Tools
- **Codecov**: Test coverage reporting
- **Dependabot**: Automated dependency updates
- **Renovate**: Advanced dependency management
- **Semantic Release**: Automated versioning

---

## ✅ Setup Checklist

- [ ] Repository created and configured
- [ ] Secrets configured (at minimum SNYK_TOKEN)
- [ ] Branch protection enabled
- [ ] Issue labels created
- [ ] CI/CD pipeline tested
- [ ] First release created
- [ ] Team members added
- [ ] Documentation reviewed
- [ ] Community guidelines established
- [ ] Monitoring configured

**🎉 Your Solana Trading CLI repository is ready for development!**
