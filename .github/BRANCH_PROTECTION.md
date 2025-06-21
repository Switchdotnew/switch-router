# Branch Protection Configuration

This document provides the recommended branch protection settings for the LLM Router repository.

## Main/Master Branch Protection

Configure the following settings in GitHub repository settings:

### General Settings

- ✅ Restrict pushes that create files larger than 100 MB
- ✅ Require a pull request before merging
- ✅ Require approvals: **1**
- ✅ Dismiss stale PR approvals when new commits are pushed
- ✅ Require review from code owners (if CODEOWNERS file exists)

### Status Checks

- ✅ Require status checks to pass before merging
- ✅ Require branches to be up to date before merging

**Required status checks:**

- `Test Suite (latest, 18)`
- `Test Suite (latest, 20)`
- `Test Suite (latest, 22)`
- `Docker Build Test`
- `Documentation Validation`

### Additional Restrictions

- ✅ Restrict pushes that create files larger than 100 MB
- ✅ Do not allow bypassing the above settings
- ✅ Require linear history (no merge commits)

## Develop Branch Protection (if used)

Similar settings as main branch but with:

- Require approvals: **1**
- Allow force pushes: **No**
- Allow deletions: **No**

## Configuration via GitHub CLI

You can set up branch protection using the GitHub CLI:

```bash
# Install GitHub CLI if not already installed
# https://cli.github.com/

# Set up main branch protection
gh api repos/:owner/:repo/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["Test Suite (latest, 18)","Test Suite (latest, 20)","Test Suite (latest, 22)","Docker Build Test","Documentation Validation"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true}' \
  --field restrictions=null
```

## Repository Settings

### General Repository Settings

- Default branch: `main` (or `master`)
- Template repository: **No**
- Issues: **Enabled**
- Discussions: **Enabled**
- Wiki: **Disabled** (use docs/ folder instead)
- Projects: **Enabled**

### Security Settings

- Dependency graph: **Enabled**
- Dependabot alerts: **Enabled**
- Dependabot security updates: **Enabled**
- Code scanning: **Enabled** (via GitHub Actions)
- Secret scanning: **Enabled**

### Merge Button Settings

- ✅ Allow merge commits
- ✅ Allow squash merging (recommended for clean history)
- ❌ Allow rebase merging
- ✅ Automatically delete head branches

## Verification

After setting up branch protection, verify by:

1. Try pushing directly to main branch (should be blocked)
2. Create a test PR without passing status checks (should be blocked)
3. Create a test PR with failing CI (should be blocked)
4. Create a proper PR with passing CI (should be mergeable)

## Emergency Bypass

In genuine emergencies, repository administrators can:

1. Temporarily disable branch protection
2. Push critical fixes
3. Re-enable branch protection immediately

**Note**: All bypasses should be documented and reviewed in post-incident analysis.

---

These settings ensure code quality while maintaining development velocity and providing necessary safeguards for production deployments.
