#!/usr/bin/env node

const FeatureBranchManager = require('./index.js');

// CLI interface for the skill
const args = require('minimist')(process.argv.slice(2));

if (args._.length === 0) {
  console.log('Usage: node skill.js <branch-name> <commit-message> [pr-title] [pr-body]');
  process.exit(1);
}

const branchName = args._[0];
const commitMessage = args._[1] || 'Default commit message';
const prTitle = args._[2] || 'Feature: ' + branchName;
const prBody = args._[2] || 'Automated PR';

const manager = new FeatureBranchManager();

// Create feature branch
if (manager.createFeatureBranch(branchName)) {
  // Create commit
  if (manager.createCommit(commitMessage)) {
    // Create PR
    if (manager.createPullRequest(prTitle, prBody)) {
      console.log('Successfully created feature branch, commit, and PR');
    }
  }
}