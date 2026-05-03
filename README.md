# Firebase Authentication Login Page

A production-ready React + Vite login system using Firebase Auth.

## Features
- Email/Password Login & Signup
- Google Social Auth
- Password Reset Flow
- Protected Routes
- Persistence Management (Remember Me)
- Responsive Tailwind UI
- Unit Tests with Jest & RTL

## Setup

1. **Firebase Project**: Create a project at [Firebase Console](https://console.firebase.google.com/).
2. **Enable Auth**: Enable Email/Password and Google providers in the Authentication tab.
3. **Get Config**: Copy your Web SDK configuration.
4. **Environment Variables**: Create a `.env` file based on `.env.example` and fill in your Firebase credentials.

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

## Running Locally

```bash
npm install
npm run dev
```

## Testing

```bash
npm test
```

## Production Build

```bash
npm run build
```

## Server-Side Verification (Node.js)

To protect your backend APIs, verify the ID token sent from the client:

```javascript
const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const verifyToken = async (req, res, next) => {
  const idToken = req.headers.authorization?.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(401).send('Unauthorized');
  }
};
```
