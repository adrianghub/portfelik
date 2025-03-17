# Firebase Integration Guide

This document provides instructions for setting up and deploying Firebase for the Portfelik application.

## Setup

### 1. Firebase Project Setup

1. Create a new Firebase project at [https://console.firebase.google.com/](https://console.firebase.google.com/)
2. Enable the following services:
   - Authentication (Email Link)
   - Firestore Database
   - Hosting (optional)

### 2. Environment Configuration

Create a `.env` file in the root of your project with the following variables:

```
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_FIREBASE_MEASUREMENT_ID=your-measurement-id
VITE_FIREBASE_AUTH_REDIRECT_URL=https://your-domain.com/login
```

For local development, you can use:
```
VITE_FIREBASE_AUTH_REDIRECT_URL=http://localhost:5173/login
```

### 3. Firebase CLI Installation

Install the Firebase CLI:

```bash
npm install -g firebase-tools
```

Login to Firebase:

```bash
firebase login
```

Initialize Firebase in your project:

```bash
firebase init
```

Select the following features:
- Firestore
- Hosting (optional)

## Firestore Security Rules

The application uses role-based security rules to protect your data. These rules are defined in `firestore.rules`.

Key security features:
- Users can only access their own data
- Admin users can access all data
- Default categories are accessible to all authenticated users
- Custom categories are private to their creators

## Deployment

### 1. Using the Deployment Script

We've provided a deployment script to simplify the process:

```bash
./deploy-firebase.js
```

This script will:
- Build your application
- Deploy Firestore security rules
- Deploy Firestore indexes
- Deploy hosting (if configured)

### 2. Manual Deployment

Alternatively, you can deploy manually:

```bash
# Build the application
npm run build

# Deploy Firestore rules
firebase deploy --only firestore:rules

# Deploy Firestore indexes
firebase deploy --only firestore:indexes

# Deploy hosting (if configured)
firebase deploy --only hosting
```

## Email Link Authentication

For email link (passwordless) authentication to work in production:

1. Go to the Firebase Console > Authentication > Sign-in method
2. Edit the "Email/Password" provider
3. Make sure "Email link (passwordless sign-in)" is enabled
4. Add your production domain to the "Authorized domains" list
5. Update your `.env` file with the correct `VITE_FIREBASE_AUTH_REDIRECT_URL`

### Security Considerations

- Email link authentication is secure when properly configured
- Always use HTTPS in production
- Set proper authorized domains in Firebase Console
- Consider adding additional security measures like IP restrictions for admin access

## Data Migration

If you need to migrate existing data to Firestore:

1. Export your data to JSON format
2. Use the Firebase Admin SDK to import data
3. Ensure data follows the schema defined in the application

## Troubleshooting

### Common Issues

1. **Authentication Errors**:
   - Verify authorized domains in Firebase Console
   - Check that redirect URL matches the authorized domain
   - Ensure email link authentication is enabled

2. **Security Rules Errors**:
   - Test rules using the Firebase Console Rules Playground
   - Check for syntax errors in rules
   - Verify user roles are correctly set

3. **Deployment Failures**:
   - Ensure Firebase CLI is logged in
   - Check project ID matches your Firebase project
   - Verify you have the necessary permissions