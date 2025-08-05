---
name: Bug report
about: Create a report to help us improve
title: '[BUG] '
labels: 'bug'
assignees: ''

---

## 🐛 Bug Description
A clear and concise description of what the bug is.

## 🔄 Steps to Reproduce
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

## ✅ Expected Behavior
A clear and concise description of what you expected to happen.

## ❌ Actual Behavior
A clear and concise description of what actually happened.

## 📸 Screenshots
If applicable, add screenshots to help explain your problem.

## 🖥️ Environment
**System Information:**
- OS: [e.g. Ubuntu 22.04, macOS 13.0, Windows 11]
- Node.js version: [e.g. 22.2.0]
- Rust version: [e.g. 1.70.0]
- Docker version: [e.g. 24.0.0]
- Browser: [e.g. Chrome 118, Firefox 119] (if applicable)

**Solana Trading CLI:**
- Version: [e.g. v1.0.0]
- Installation method: [e.g. Docker, Binary, Source]
- Configuration: [e.g. Mainnet, Devnet, Testnet]

**Trading Configuration:**
- DEX: [e.g. Jupiter, Raydium, Orca]
- Strategy: [e.g. Launch momentum, Micro-breakout, ML signals]
- Network: [e.g. Mainnet, Devnet]

## 📋 Logs
Please provide relevant logs:

**Application Logs:**
```
Paste application logs here
```

**Docker Logs (if using Docker):**
```bash
docker-compose logs
```

**Kestra Logs (if applicable):**
```
Paste Kestra execution logs here
```

**Browser Console (if web-related):**
```
Paste browser console errors here
```

## 🔧 Configuration
**Environment Variables:**
```bash
# Remove sensitive information like private keys!
RPC_URL=https://api.mainnet-beta.solana.com
YELLOWSTONE_ENDPOINT=grpc.triton.one:443
REQUIRE_DRY_RUN=true
# ... other relevant config
```

**Docker Compose (if applicable):**
```yaml
# Paste relevant docker-compose configuration
```

## 📊 Additional Context
Add any other context about the problem here:

- Is this a regression? (worked in previous version)
- Does this happen consistently or intermittently?
- Any recent changes to your setup?
- Related issues or discussions?

## 🔍 Troubleshooting Attempted
What have you tried to fix this issue?

- [ ] Restarted the application
- [ ] Checked logs for errors
- [ ] Verified configuration
- [ ] Tested with different parameters
- [ ] Searched existing issues
- [ ] Read documentation

## 🚨 Impact
How does this bug affect your usage?

- [ ] Blocks all functionality
- [ ] Blocks specific features
- [ ] Causes data loss
- [ ] Performance degradation
- [ ] Minor inconvenience

## 📝 Possible Solution
If you have ideas on how to fix this, please describe them here.

---

**Note:** Please ensure you've removed any sensitive information like private keys, API keys, or wallet addresses before submitting this issue.
