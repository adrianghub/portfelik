# GitHub Actions for Firebase Deployment

This directory contains GitHub Actions workflows for automatically deploying your Firebase application when changes are pushed to the main branch.

## Setup Instructions

To enable automatic deployments, you need to set up the following GitHub secrets:

1. Open the Firebase Console and go to Project Settings.

2. Copy the `firebase-service-account.json` file.

3. In your GitHub repository, go to Settings > Secrets and variables > Actions.

4. Add the following secrets:

   a. Firebase Service Account:
   - Name: `FIREBASE_SERVICE_ACCOUNT_KEY`
   - Value: Paste the content of the `firebase-service-account.json` file you copied

   b. Firebase Configuration:
   - Name: `VITE_FIREBASE_API_KEY`
   - Value: Your Firebase API key
   - Name: `VITE_FIREBASE_AUTH_DOMAIN`
   - Value: Your Firebase auth domain
   - Name: `VITE_FIREBASE_PROJECT_ID`
   - Value: Your Firebase project ID
   - Name: `VITE_FIREBASE_STORAGE_BUCKET`
   - Value: Your Firebase storage bucket
   - Name: `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - Value: Your Firebase messaging sender ID
   - Name: `VITE_FIREBASE_APP_ID`
   - Value: Your Firebase app ID
   - Name: `VITE_FIREBASE_MEASUREMENT_ID`
   - Value: Your Firebase measurement ID

   You can find these values in your local `.env` file or in the Firebase Console under Project Settings.

5. Click "Add secret" for each secret.

## Workflows

- `firebase-deploy.yml`: Deploys the entire Firebase application when changes are pushed to the main branch.

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