# Pull Request

## 📝 Description

### Summary
Brief description of what this PR does.

### Related Issues
Fixes #(issue_number)
Closes #(issue_number)
Related to #(issue_number)

## 🔄 Type of Change

- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking change which adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 📚 Documentation update
- [ ] 🔧 Refactoring (no functional changes)
- [ ] ⚡ Performance improvement
- [ ] 🧪 Test improvements
- [ ] 🔒 Security fix
- [ ] 🎨 UI/UX improvements

## 🧪 Testing

### Test Coverage
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] End-to-end tests added/updated
- [ ] Manual testing completed

### Test Results
```bash
# Paste test results here
npm test
cargo test
```

### Testing Checklist
- [ ] All existing tests pass
- [ ] New tests cover the changes
- [ ] Edge cases are tested
- [ ] Error handling is tested
- [ ] Performance impact is acceptable

## 📋 Checklist

### Code Quality
- [ ] Code follows the project's style guidelines
- [ ] Self-review of code completed
- [ ] Code is properly commented
- [ ] No debugging code left in
- [ ] No console.log statements in production code
- [ ] Error handling is appropriate

### Security
- [ ] No sensitive information exposed
- [ ] Input validation implemented where needed
- [ ] Authentication/authorization considered
- [ ] Dependencies are secure and up-to-date
- [ ] No hardcoded secrets or credentials

### Documentation
- [ ] README updated (if needed)
- [ ] API documentation updated (if needed)
- [ ] Inline code comments added
- [ ] Configuration documentation updated
- [ ] Migration guide provided (for breaking changes)

### Deployment
- [ ] Environment variables documented
- [ ] Database migrations included (if needed)
- [ ] Docker configuration updated (if needed)
- [ ] Deployment scripts updated (if needed)
- [ ] Rollback plan considered

## 🔧 Configuration Changes

### Environment Variables
List any new or changed environment variables:

```bash
# New variables
NEW_VARIABLE=default_value

# Changed variables
EXISTING_VARIABLE=new_default_value
```

### Dependencies
List any new dependencies added:

**Node.js:**
- package-name@version - reason for adding

**Rust:**
- crate-name = "version" - reason for adding

## 📊 Performance Impact

### Benchmarks
If applicable, include performance benchmarks:

```
Before: X ms/op
After:  Y ms/op
Improvement: Z%
```

### Resource Usage
- Memory impact: [increase/decrease/no change]
- CPU impact: [increase/decrease/no change]
- Network impact: [increase/decrease/no change]
- Storage impact: [increase/decrease/no change]

## 🔄 Breaking Changes

### API Changes
List any breaking changes to APIs:

```typescript
// Before
oldFunction(param1, param2)

// After
newFunction({ param1, param2, newParam })
```

### Migration Guide
Provide steps for users to migrate:

1. Update configuration
2. Run migration script
3. Update client code

## 📸 Screenshots

### Before
[Screenshot of before state]

### After
[Screenshot of after state]

## 🔍 Code Review Notes

### Areas of Focus
Please pay special attention to:

- [ ] Algorithm correctness in [specific file]
- [ ] Error handling in [specific function]
- [ ] Performance of [specific operation]
- [ ] Security implications of [specific change]

### Questions for Reviewers
- Question 1?
- Question 2?

## 🚀 Deployment Notes

### Pre-deployment Steps
1. Step 1
2. Step 2

### Post-deployment Verification
1. Check health endpoints
2. Verify metrics
3. Test critical paths

### Rollback Plan
If issues arise:
1. Revert to previous version
2. Check for data consistency
3. Notify stakeholders

## 📚 Additional Context

### Design Decisions
Explain any significant design decisions made:

### Trade-offs
Discuss any trade-offs made:

### Future Improvements
List potential future improvements:

---

## 🏷️ Labels

Please add appropriate labels:
- Component: `router`, `strategies`, `ml`, `streaming`, `monitoring`
- Priority: `low`, `medium`, `high`, `critical`
- Size: `XS`, `S`, `M`, `L`, `XL`

## 📞 Reviewer Assignment

### Suggested Reviewers
- @username1 (for component expertise)
- @username2 (for security review)
- @username3 (for performance review)

### Review Requirements
- [ ] Code review from component owner
- [ ] Security review (if applicable)
- [ ] Performance review (if applicable)
- [ ] Documentation review (if applicable)

---

**Note:** Please ensure all CI checks pass before requesting review. If any checks fail, please fix them or explain why they can be ignored.
