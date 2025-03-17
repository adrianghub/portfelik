# GitHub Actions for Firebase Deployment

This directory contains GitHub Actions workflows for automatically deploying your Firebase application when changes are pushed to the main branch.

## Setup Instructions

To enable automatic deployments, you need to set up a GitHub secret:

1. Generate a Firebase CI token:
   ```bash
   firebase login:ci
   ```

2. Copy the token that is displayed.

3. In your GitHub repository, go to Settings > Secrets and variables > Actions.

4. Click on "New repository secret".

5. Create a secret with the name `FIREBASE_TOKEN` and paste the token you copied as the value.

6. Click "Add secret".

## Workflows

- `firebase-deploy.yml`: Deploys the entire Firebase application when changes are pushed to the main branch.
- `firebase-rules-deploy.yml`: Deploys only Firestore rules when the `firestore.rules` file is changed.

## Local Development

For local development, use the following npm scripts:

```bash
# Start the development server
npm run dev

# Start Firebase emulators
npm run dev:emulators

# Start both the development server and emulators
npm run dev:all

# Deploy to production
npm run deploy
```