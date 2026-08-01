# MicoPay Git Workflow Guide

A comprehensive guide for developers on how to branch, develop, and push code to GitHub without conflicts.

---

## Overview

This project follows a **fork + feature branch + PR model** with CI/CD gates that prevent conflicts and broken code from reaching `main`. The workflow is designed for collaborative development with minimal merge conflicts.

**Key Principles:**
- Work in isolation on feature branches
- Keep commits focused and logical
- Test locally before pushing
- Let CI validate before merge
- One issue per developer (no duplicated effort)

---

## Prerequisites

Before starting any work:

1. **Fork the repository** (one-time setup)
   ```bash
   # Visit https://github.com/ericmt-98/micopay-protocol
   # Click "Fork" in the top right
   # Clone your fork locally
   git clone https://github.com/YOUR-USERNAME/micopay-protocol.git
   cd micopay-protocol
   ```

2. **Add upstream remote** (track the main repo)
   ```bash
   git remote add upstream https://github.com/ericmt-98/micopay-protocol.git
   ```

3. **Install dependencies** (from repo root)
   ```bash
   npm install
   ```

---

## Step-by-Step Workflow

### Step 1: Sync Your Fork with Upstream

Before starting work, ensure your local `main` is up-to-date:

```bash
# Switch to main branch
git checkout main

# Fetch latest changes from upstream
git fetch upstream

# Rebase your main on top of upstream/main
git rebase upstream/main

# Push to your fork
git push origin main
```

**Why this matters:** Prevents conflicts when opening your PR later.

---

### Step 2: Create a Feature Branch

Create a branch for your work using a clear naming convention:

```bash
# Naming conventions:
# - fix/issue-description (for bug fixes)
# - feat/feature-name (for new features)
# - docs/what-changed (for documentation)
# - refactor/component-name (for refactors)

# Examples:
git checkout -b fix/empty-state-on-history
git checkout -b feat/merchant-onboarding
git checkout -b docs/local-setup-guide
```

**Rule:** Branch name should reference the issue number or clearly describe the work.

---

### Step 3: Make Focused Commits

As you develop, commit frequently with clear, logical commit messages:

```bash
# Stage only the files you changed for this logical unit
git add src/components/Button.tsx src/styles/button.css

# Commit with a clear message (imperative mood)
git commit -m "fix: remove unused padding on button component"

# Good commit messages:
# - fix: solve the bug
# - feat: add new feature
# - refactor: restructure without changing behavior
# - docs: update documentation
# - test: add or update tests

# Avoid:
# - "Fixed stuff" (not imperative)
# - "WIP" (work in progress on main branch)
# - Combining 5+ unrelated changes in one commit
```

**Rule:** One logical change per commit. This makes reviews easier and rebasing cleaner.

---

### Step 4: Test Locally Before Pushing

The CI pipeline will block your merge if the build fails. **Test locally first to save time:**

#### For Backend (Fastify, Node)

```bash
cd micopay/backend

# Install dependencies (if you added any)
npm install

# Run the build (TypeScript compilation)
npm run build

# Run locally to verify
npm run dev  # Runs on http://localhost:3002
```

For admin-facing reporting work, validate the new analytics endpoint with:

```bash
node --import tsx src/tests/admin-analytics.test.ts
```

This covers the backend overview response for trade volume, merchant activity, completion rate, and average time-to-completion.

#### For Frontend (React + Vite)

```bash
cd micopay/frontend

# Install dependencies (if you added any)
npm install

# Run the build
npm run build

# Run tests (currently informative, not blocking)
npm run test

# Run locally to verify
npm run dev  # Runs on http://localhost:5181
```

#### Testing Checklist

Before pushing, verify:

- [ ] TypeScript compiles without errors: `npm run build`
- [ ] No console errors when running locally
- [ ] Feature works as described in the issue
- [ ] No console warnings (if possible)
- [ ] Existing functionality still works
- [ ] Tests pass (backend tests are required; frontend tests are informative for now)

**Rule:** If the build fails locally, it will fail in CI. Fix it before pushing.

---

### Step 5: Push to Your Feature Branch

Once tests pass, push your commits:

```bash
# Push to your fork (use -u flag on first push to set upstream tracking)
git push -u origin fix/empty-state-on-history

# Subsequent pushes on the same branch:
git push

# To force push (only after local commits, never on shared branches):
# Use with caution — only if you're rewriting unpushed commits
git push --force-with-lease origin fix/empty-state-on-history
```

**Rule:** Always push to your feature branch, never directly to `main`.

---

### Step 6: Open a Pull Request

On GitHub, create a PR with:

1. **Title (short, imperative mood):**
   ```
   fix: empty state on history tab
   feat: add merchant profile screen
   docs: add local setup guide
   ```

2. **Description (answer these questions):**
   ```markdown
   ## What changed?
   - Implemented empty state component for history tab when no trades exist
   - Added empty state illustration and copy

   ## Why?
   Closes #123
   (Reference the issue number — this auto-closes it when merged)

   ## How to test?
   1. Run `cd micopay/frontend && npm run dev`
   2. Navigate to the History tab
   3. Verify the empty state appears when there are no trades
   4. Verify it disappears when trades are loaded

   ## Notes
   - No breaking changes
   - Follows UX guidelines from docs/UX_MANIFESTO.md
   - Only touches micopay/frontend/ (in-scope)
   ```

3. **Link the issue:**
   - Add "Closes #123" to automatically close the issue when merged

**Rule:** Clear PR descriptions speed up review and prevent misunderstandings.

---

### Step 7: Wait for CI to Pass

GitHub Actions will automatically:

- Build the backend (TypeScript compilation)
- Build the frontend (TypeScript compilation + Vite build)
- Run frontend tests (informative only for now)
- Report results on your PR

**If CI fails:**
1. Click "Details" to see the error
2. Fix the issue locally on your feature branch
3. Commit and push again
4. CI runs automatically

**Rule:** Don't merge until CI passes.

---

### Step 8: Address Review Comments

If reviewers request changes:

```bash
# Make changes locally
vim src/components/MyComponent.tsx

# Commit with clear message referencing the feedback
git commit -m "refactor: simplify component logic per review feedback"

# Push the new commits
git push origin fix/empty-state-on-history
```

**Rule:** Don't squash commits during review — add new commits so reviewers can see what changed.

---

### Step 9: Merge Your PR

Once approved and CI passes:

1. You or a maintainer clicks "Squash and merge" or "Merge" on GitHub
2. Your feature branch is merged to `main`
3. Your feature branch can be deleted
4. The linked issue is automatically closed

**Local cleanup after merge:**

```bash
# Switch back to main
git checkout main

# Delete your local feature branch
git branch -d fix/empty-state-on-history

# Delete the remote branch
git push origin --delete fix/empty-state-on-history

# Fetch the latest main from upstream
git fetch upstream
git rebase upstream/main
git push origin main
```

---

## Conflict Prevention Strategies

### 1. **Stay In-Scope**

Only touch files relevant to your issue:

**In-scope for Wave work:**
- `micopay/frontend/` — retail mobile app
- `micopay/backend/` — retail backend
- `docs/` — shared guides

**Out-of-scope:**
- `apps/api/`
- `apps/web/`
- `contracts/`
- Old prototypes

**Rule:** If your PR touches out-of-scope paths, it will be asked to split or rescope.

### 2. **Communicate Before Starting**

Comment on the issue before starting work:

```
@maintainer I'd like to work on this. Assigning myself.
```

Wait for confirmation. This prevents:
- Two people working on the same issue
- Duplicated effort
- Merge conflicts from similar changes

**Rule:** One contributor per issue during the Wave.

### 3. **Keep Commits Focused**

Instead of:
```
git commit -m "update components, fix styling, add tests, refactor utils"
```

Do:
```
git commit -m "fix: remove unused padding in button component"
git commit -m "test: add button component tests"
git commit -m "refactor: extract button logic to hook"
```

**Why:** Focused commits are easier to review, rebase, and bisect if issues arise.

### 4. **Sync Frequently**

If your PR is open for a while, keep it updated:

```bash
# Fetch upstream changes
git fetch upstream

# Rebase your feature branch on latest main
git rebase upstream/main

# Force push to your feature branch
git push --force-with-lease origin fix/empty-state-on-history
```

**Rule:** Rebase (don't merge) to keep history linear.

### 5. **Test Before Pushing**

The CI gate catches broken builds, but testing locally is faster:

```bash
cd micopay/backend && npm run build && npm run dev &
cd micopay/frontend && npm run build && npm run test && npm run dev &
```

**Rule:** If it works locally, it will pass CI (usually).

---

## CI/CD Gates

Your code must pass these checks before merging:

### Backend Gate

- **TypeScript compilation:** `npm run build`
- Must complete without errors
- Blocks merge if it fails

### Frontend Gate

- **TypeScript compilation:** `npm run build`
- **Vite build:** Bundling and code splitting
- **Tests:** Currently informative, not blocking
- Blocks merge if build fails

### Review Gate

- At least one approval from a maintainer
- All conversations resolved

---

## Common Scenarios

### Scenario 1: You Need to Update Your PR

**Situation:** Reviewer requests changes.

```bash
# Make changes
vim src/components/MyComponent.tsx

# Commit (don't squash)
git commit -m "refactor: simplify component logic per review feedback"

# Push
git push origin fix/empty-state-on-history

# CI runs automatically, reviewer sees new commits
```

### Scenario 2: Your PR Falls Behind Main

**Situation:** Other PRs merged while yours was under review.

```bash
# Fetch latest
git fetch upstream

# Rebase on latest main
git rebase upstream/main

# If there are conflicts, resolve them
# vim src/conflicted-file.ts
# git add src/conflicted-file.ts
# git rebase --continue

# Force push to your branch
git push --force-with-lease origin fix/empty-state-on-history
```

### Scenario 3: Build Fails in CI

**Situation:** Your PR failed the CI build.

```bash
# Pull down the exact code CI ran
git fetch origin

# Check out your branch
git checkout fix/empty-state-on-history

# Reproduce the build locally
cd micopay/backend && npm run build
# or
cd micopay/frontend && npm run build

# Fix the error
# Commit and push
git commit -m "fix: resolve build error in component"
git push origin fix/empty-state-on-history

# CI runs again automatically
```

### Scenario 4: You Accidentally Committed to Main

**Situation:** You ran `git commit` while on `main` instead of a feature branch.

```bash
# Get the commit hash
git log -1 --oneline  # Example: a1b2c3d "fix: something"

# Create a new feature branch at this commit
git checkout -b fix/something

# Reset main to upstream/main
git checkout main
git reset --hard upstream/main

# Push to your fork
git push --force-with-lease origin main
```

---

## IDE Configuration (Kiro / VS Code)

### Git Workflow Hooks

Consider setting up hooks for your IDE:

**Pre-push hook (test before pushing):**
```bash
#!/bin/sh
# Run tests before allowing push
cd micopay/backend && npm run build || exit 1
cd micopay/frontend && npm run build || exit 1
```

**Pre-commit hook (verify format):**
```bash
#!/bin/sh
# Prevent commits with obvious errors
npm run lint --fix
```

### IDE Commands to Memorize

```
# Create and switch to branch
git checkout -b fix/issue-name

# Stage specific files
git add src/components/MyComponent.tsx

# Commit
git commit -m "fix: clear description"

# Push to feature branch
git push -u origin fix/issue-name

# Pull latest from upstream
git fetch upstream && git rebase upstream/main

# View branch history
git log --oneline --graph --all

# Undo last commit (keep changes)
git reset --soft HEAD~1

# See what changed
git diff src/components/MyComponent.tsx
```

---

## Troubleshooting

### "Your branch has diverged from 'origin/fix/issue-name'"

```bash
# Rebase to catch up
git fetch origin
git rebase origin/fix/issue-name
git push --force-with-lease origin fix/issue-name
```

### "Merge conflict in src/App.tsx"

```bash
# Open the file and resolve conflicts
vim src/App.tsx

# Look for <<< >>> markers and choose which code to keep

# Mark as resolved
git add src/App.tsx

# Continue the rebase
git rebase --continue

# Push
git push --force-with-lease origin fix/issue-name
```

### "Permission denied (publickey)"

```bash
# You need to set up SSH keys
# Follow: https://docs.github.com/en/authentication/connecting-to-github-with-ssh

# Or use HTTPS instead:
git remote set-url origin https://github.com/YOUR-USERNAME/micopay-protocol.git
```

### "npm install keeps failing"

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# For frontend (regenerates platform-specific binaries):
cd micopay/frontend
rm -f package-lock.json
npm install --no-audit --no-fund
```

---

## Summary: The Flawless Workflow

1. **Before work:** Sync fork with upstream
2. **Start work:** Create feature branch (`git checkout -b fix/...`)
3. **Develop:** Make focused commits (`git commit -m "fix: ..."`)
4. **Test:** Run `npm run build` and `npm run dev` locally
5. **Push:** Push to your fork (`git push -u origin fix/...`)
6. **PR:** Open PR with clear title and description
7. **Wait:** Let CI validate and reviewers approve
8. **Merge:** Squash and merge on GitHub
9. **Cleanup:** Delete branch and sync your fork back

**The key to zero conflicts:** Stay in-scope, test locally, commit focused changes, and communicate with your team.

---

## Resources

- [CONTRIBUTING.md](./CONTRIBUTING.md) — Scoping and issue picking
- [docs/UX_MANIFESTO.md](./docs/UX_MANIFESTO.md) — UI/UX standards
- [docs/PRODUCT_SCOPE.md](./docs/PRODUCT_SCOPE.md) — What we're building
- [GitHub Flow Docs](https://guides.github.com/introduction/flow/) — General GitHub workflow
- [Git Cheat Sheet](https://training.github.com/downloads/github-git-cheat-sheet.pdf) — Common Git commands

---

## Questions?

- **Unclear issue scope?** Comment on the issue in GitHub.
- **Blocked on a product decision?** Tag the maintainer.
- **General questions?** Check [docs/DRIPS_TEAM_GUIDE.md](./docs/DRIPS_TEAM_GUIDE.md).

---

**Last updated:** June 2026  
**For:** MicoPay Wave 4 contributors
