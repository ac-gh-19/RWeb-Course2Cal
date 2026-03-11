// background/background.js

// Background scripts (Service Workers in Manifest V3) are useful for handling 
// events that happen in the browser, independent of any specific web page.
// Examples: Clicking the extension icon, alarms, web requests, etc.

chrome.runtime.onInstalled.addListener(() => {
  console.log('RWeb Course2Cal Extension installed');
});
