#!/usr/bin/env node

/**
 * Firebase Deployment Script
 *
 * This script helps deploy Firebase configuration, security rules, and hosting.
 * Run with: node deploy-firebase.js
 */

import { execSync } from 'child_process';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function runCommand(command, errorMessage) {
  try {
    console.log(`${colors.blue}Running: ${command}${colors.reset}`);
    execSync(command, { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error(`${colors.red}${errorMessage || 'Command failed'}${colors.reset}`);
    console.error(error.message);
    return false;
  }
}

try {
  execSync('firebase --version', { stdio: 'ignore' });
} catch (error) {
  console.error(`${colors.red}Firebase CLI is not installed. Please install it with:${colors.reset}`);
  console.error(`${colors.yellow}npm install -g firebase-tools${colors.reset}`);
  process.exit(1);
}

try {
  execSync('firebase projects:list', { stdio: 'ignore' });
} catch (error) {
  console.error(`${colors.red}You are not logged in to Firebase. Please login with:${colors.reset}`);
  console.error(`${colors.yellow}firebase login${colors.reset}`);
  process.exit(1);
}

console.log(`${colors.magenta}Building the application...${colors.reset}`);
if (!runCommand('npm run build', 'Failed to build the application')) {
  process.exit(1);
}

// Deploy Firestore security rules
console.log(`${colors.magenta}Deploying Firestore security rules...${colors.reset}`);
if (!runCommand('firebase deploy --only firestore:rules', 'Failed to deploy Firestore security rules')) {
  process.exit(1);
}

console.log(`${colors.magenta}Deploying Firestore indexes...${colors.reset}`);
if (!runCommand('firebase deploy --only firestore:indexes', 'Failed to deploy Firestore indexes')) {
  process.exit(1);
}

console.log(`${colors.magenta}Deploying hosting...${colors.reset}`);
if (!runCommand('firebase deploy --only hosting', 'Failed to deploy hosting')) {
  process.exit(1);
}

// console.log(`${colors.magenta}Deploying functions...${colors.reset}`);
// if (!runCommand('firebase deploy --only functions --debug', 'Failed to deploy functions')) {
//   process.exit(1);
// }

// console.log(`${colors.green}Deployment completed successfully!${colors.reset}`);