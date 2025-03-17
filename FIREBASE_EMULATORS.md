# Firebase Emulators Setup

This guide explains how to use Firebase Emulators with the Portfelik application for local development.

## What are Firebase Emulators?

Firebase Emulators allow you to run a local version of Firebase services (Authentication, Firestore, etc.) without connecting to the production Firebase services. This is useful for:

- Developing without an internet connection
- Testing without affecting production data
- Faster development iterations
- Avoiding costs associated with Firebase usage

## Setup

The project is already configured to use Firebase Emulators. Here's how to get started:

### 1. Start the Emulators

```bash
npm run dev:emulators
```

This will start the following emulators:
- Authentication (port 9099)
- Firestore (port 8080)
- Hosting (port 5000)
- Emulator UI (port 4000)

### 2. Start the Development Server

In a separate terminal:

```bash
npm run dev
```

### 3. Or Start Everything at Once

```bash
npm run dev:all
```

This will start both the emulators and the development server concurrently.

## Accessing the Emulator UI

Once the emulators are running, you can access the Emulator UI at:

http://localhost:4000

This provides a visual interface to:
- View and manage Firestore data
- Manage authentication users
- Monitor emulator logs

## Seeding Test Data

To populate the emulators with test data:

```bash
npm run seed:emulator
```

This will create:
- A test user (email: test@example.com, password: password123)
- An admin user (email: admin@example.com, password: admin123)
- Default categories
- Sample transactions

## Connecting Your App to Emulators

The application is already configured to automatically connect to the emulators when running in development mode. This is handled in `src/lib/firebase.ts`.

## Troubleshooting

### Emulators Won't Start

If the emulators won't start, try:

1. Ensure ports 9099, 8080, 5000, and 4000 are not in use by other applications
2. Delete the `.firebase/` directory and try again
3. Run `firebase logout` and `firebase login` to refresh your credentials

### Data Persistence

By default, emulator data is not persisted between sessions. If you want to persist data:

1. Start emulators with the `--export-on-exit=./firebase-data` flag
2. Next time, start with `--import=./firebase-data`

Or modify the `dev:emulators` script in package.json:

```json
"dev:emulators": "firebase emulators:start --import=./firebase-data --export-on-exit=./firebase-data"
```

## Additional Resources

- [Firebase Emulator Suite Documentation](https://firebase.google.com/docs/emulator-suite)
- [Firebase Local Emulator UI](https://firebase.google.com/docs/emulator-suite/ui)

## Security Rules in Emulator Mode

For development convenience, the Firestore security rules are configured to allow all operations when running in the emulator environment. This is done by adding a wildcard rule at the top of the rules file:

```
match /{document=**} {
  allow read, write: if true;
}
```

This rule overrides all other rules when running in the emulator, making it easier to test and develop without authentication issues. In production, this rule will be ignored, and the more restrictive rules below it will be applied.

If you want to test your security rules in the emulator, you can comment out or remove this wildcard rule temporarily.