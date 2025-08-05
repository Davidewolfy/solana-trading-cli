# Contributing to Solana Trading CLI

Thank you for your interest in contributing to Solana Trading CLI! This document provides guidelines and information for contributors.

## 🚀 Quick Start

1. **Fork the repository**
2. **Clone your fork**
   ```bash
   git clone https://github.com/your-username/solana-trading-cli.git
   cd solana-trading-cli
   ```
3. **Install dependencies**
   ```bash
   npm install
   cd exec-rs && cargo build
   ```
4. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```
5. **Make your changes**
6. **Test your changes**
   ```bash
   npm test
   cargo test
   ```
7. **Submit a pull request**

## 📋 Development Setup

### Prerequisites
- **Node.js** 18+ with npm
- **Rust** 1.70+ with Cargo
- **Docker** 20.10+ with Docker Compose
- **Git** 2.30+

### Environment Setup
```bash
# Copy environment template
cp .env.example .env

# Edit configuration
nano .env

# Create test wallet
mkdir -p secrets
echo '[174,101,213,156,187,121,234,123,45,67,89,12,34,56,78,90,123,45,67,89,12,34,56,78,90,123,45,67,89,12,34,56,78,90,123,45,67,89,12,34,56,78,90,123,45,67,89,12,34,56,78,90,123,45,67]' > secrets/wallet.json
```

### Development Commands
```bash
# Build TypeScript
npm run build

# Watch mode for development
npm run dev

# Build Rust executor
cd exec-rs && cargo build --release

# Run tests
npm test
cargo test

# Lint code
npm run lint
cd exec-rs && cargo clippy

# Start development environment
make start
```

## 🏗️ Project Structure

```
solana-trading-cli/
├── src/                    # TypeScript source code
│   ├── router/            # Multi-DEX routing
│   ├── strategies/        # Trading strategies
│   ├── ml/               # ML and ASI-Arch
│   ├── grpc/             # gRPC streaming
│   └── config/           # Configuration
├── exec-rs/              # Rust executor
├── kestra/               # Workflow definitions
├── scripts/              # Deployment scripts
├── docs/                 # Documentation
└── .github/              # GitHub workflows
```

## 🎯 Contribution Areas

### 🔄 Router & DEX Integration
- Add new DEX adapters
- Improve routing algorithms
- Optimize quote aggregation
- Enhance failover mechanisms

### 🎯 Trading Strategies
- Implement new strategy types
- Improve signal detection
- Add risk management features
- Optimize execution logic

### 🤖 ML & ASI-Arch
- Add new model architectures
- Improve feature engineering
- Enhance backtesting framework
- Optimize model search

### 📡 Streaming & Data
- Improve gRPC streaming
- Add new data sources
- Enhance data validation
- Optimize data processing

### 📊 Monitoring & Observability
- Add new metrics
- Improve dashboards
- Enhance alerting
- Add performance tracking

## 📝 Coding Standards

### TypeScript
- Use **TypeScript strict mode**
- Follow **ESLint configuration**
- Use **Prettier** for formatting
- Write **JSDoc comments** for public APIs
- Prefer **async/await** over Promises
- Use **proper error handling**

```typescript
/**
 * Example function with proper documentation
 */
export async function exampleFunction(
  param1: string,
  param2: number
): Promise<Result> {
  try {
    // Implementation
    return { success: true, data: result };
  } catch (error) {
    console.error('Function failed:', error);
    throw new Error(`Failed to process: ${error.message}`);
  }
}
```

### Rust
- Follow **Rust 2021 edition** conventions
- Use **Clippy** for linting
- Write **comprehensive tests**
- Use **proper error handling** with `Result<T, E>`
- Document public APIs with `///` comments
- Follow **Rust naming conventions**

```rust
/// Example function with proper documentation
pub async fn example_function(
    param1: &str,
    param2: u64,
) -> Result<String, Box<dyn std::error::Error>> {
    // Implementation
    Ok(result)
}
```

### Git Commit Messages
Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

feat(router): add Meteora DEX adapter
fix(strategies): resolve launch momentum timing issue
docs(readme): update installation instructions
test(ml): add backtesting validation tests
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `test`: Tests
- `refactor`: Code refactoring
- `perf`: Performance improvement
- `chore`: Maintenance

## 🧪 Testing Guidelines

### Test Structure
```
tests/
├── unit/           # Unit tests
├── integration/    # Integration tests
├── e2e/           # End-to-end tests
└── fixtures/      # Test data
```

### Writing Tests
- **Unit tests** for individual functions
- **Integration tests** for component interactions
- **End-to-end tests** for complete workflows
- **Mock external dependencies**
- **Test error conditions**
- **Maintain high coverage**

### Test Commands
```bash
# Run all tests
npm test

# Run specific test file
npm test -- --testPathPattern=router

# Run tests with coverage
npm run test:coverage

# Run Rust tests
cd exec-rs && cargo test

# Run integration tests
npm run test:integration
```

## 📚 Documentation

### Code Documentation
- **JSDoc** for TypeScript functions
- **Rust docs** for Rust functions
- **README** files for modules
- **Inline comments** for complex logic

### User Documentation
- Update **README.md** for user-facing changes
- Update **QUICK-START.md** for setup changes
- Add **examples** for new features
- Update **API documentation**

## 🔒 Security Guidelines

### Security Best Practices
- **Never commit secrets** or private keys
- **Validate all inputs**
- **Use secure dependencies**
- **Follow principle of least privilege**
- **Implement proper error handling**
- **Use environment variables** for configuration

### Security Review
- All PRs undergo **security review**
- **Dependency scanning** in CI/CD
- **Secret scanning** with TruffleHog
- **Vulnerability scanning** with Snyk

## 🚀 Pull Request Process

### Before Submitting
1. **Rebase** on latest main branch
2. **Run all tests** and ensure they pass
3. **Update documentation** if needed
4. **Add changelog entry** if applicable
5. **Follow PR template**

### PR Requirements
- **Clear description** of changes
- **Link to related issues**
- **Test coverage** for new code
- **Documentation updates**
- **No breaking changes** without discussion

### Review Process
1. **Automated checks** must pass
2. **Code review** from maintainers
3. **Security review** if applicable
4. **Performance review** for critical paths
5. **Final approval** and merge

## 🏷️ Issue Guidelines

### Bug Reports
- Use **bug report template**
- Provide **reproduction steps**
- Include **environment details**
- Add **relevant logs**
- Remove **sensitive information**

### Feature Requests
- Use **feature request template**
- Explain **use case** and **value**
- Provide **detailed requirements**
- Consider **implementation complexity**
- Discuss **breaking changes**

## 🤝 Community Guidelines

### Code of Conduct
- Be **respectful** and **inclusive**
- **Help others** learn and grow
- **Provide constructive feedback**
- **Assume good intentions**
- **Follow project guidelines**

### Communication
- **GitHub Issues** for bugs and features
- **GitHub Discussions** for questions
- **Discord** for real-time chat
- **Email** for security issues

## 🎖️ Recognition

### Contributors
- All contributors are **recognized** in releases
- **Significant contributions** highlighted in changelog
- **Maintainer status** for consistent contributors

### Contribution Types
- **Code contributions**
- **Documentation improvements**
- **Bug reports and testing**
- **Community support**
- **Security research**

## 📞 Getting Help

### Resources
- **Documentation**: [docs/](docs/)
- **Examples**: [examples/](examples/)
- **Issues**: [GitHub Issues](https://github.com/outsmartchad/solana-trading-cli/issues)
- **Discussions**: [GitHub Discussions](https://github.com/outsmartchad/solana-trading-cli/discussions)

### Contact
- **General questions**: GitHub Discussions
- **Bug reports**: GitHub Issues
- **Security issues**: security@solana-trading-cli.com
- **Maintainers**: @outsmartchad

---

**Thank you for contributing to Solana Trading CLI!** 🚀

Your contributions help make automated Solana trading more accessible and reliable for everyone.
