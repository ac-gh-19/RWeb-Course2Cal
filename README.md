# Course2Cal for RWeb

[![Watch the Demo](https://img.shields.io/badge/YouTube-Demo-red?style=for-the-badge&logo=youtube)](https://www.youtube.com/watch?v=ogcCqrS7VNQ)

A Google Chrome extension designed for UCR students to easily sync their class schedule from RWeb to Google Calendar.

## Features

- **Automated Scraping**: Automatically identifies and extracts course details (Title, Type, Time, Days, Location) from RWeb's registration pages.
- **Title Customization**: Edit course titles before syncing to make your calendar more readable.
- **Recurring Events**: Automatically creates recurring events for the entire quarter.
- **Privacy Focused**: Processes data locally in your browser. No external servers are involved except for direct communication with Google Calendar.

## How to Use

1. **Navigate to RWeb**: Open the [RWeb Registration page](https://registrationssb.ucr.edu/StudentRegistrationSsb/ssb/classRegistration/classRegistration).
2. **View Your Schedule**: Ensure you are on the "View Registration Information" or "Register for Classes" page where your schedule is visible.
3. **Open the Extension**: Click the Course2Cal icon in your browser toolbar.
4. **Scrape Courses**: Click the **"Scrape Courses"** button. The extension will automatically open each course detail modal to gather information. **Do not click anything while scraping is in progress.**
5. **Review & Edit**: Once scraping is complete, review your courses. You can edit the titles (e.g., change "CS 100 - Software Construction" to just "CS 100").
6. **Sync to Calendar**: Click **"Confirm & Sync to Calendar"**. You will be prompted to authorize with your Google account.
7. **Success!**: Your courses will now appear in your primary Google Calendar as recurring weekly events.

## Permissions

- `activeTab`: Used to read course information from the current RWeb page.
- `identity`: Used to authorize with your Google account for secure calendar synchronization.
- `storage`: Used to track session status.

## Development & Setup

If you are a developer looking to build or modify this extension:

1. Clone the repository.
2. Go to `chrome://extensions/` in Chrome.
3. Enable **"Developer mode"**.
4. Click **"Load unpacked"** and select the project directory.
5. **OAuth2 Configuration**: You must create a project in the [Google Cloud Console](https://console.cloud.google.com/), enable the Google Calendar API, and create an OAuth 2.0 Client ID for a Chrome App. Update the `client_id` in `manifest.json` with your own.

## Privacy Policy

See our [Privacy Policy](privacy_policy.md).

## Disclaimer

This extension is a third-party tool and is not affiliated with, maintained, or endorsed by the University of California, Riverside (UCR). Use at your own risk.
