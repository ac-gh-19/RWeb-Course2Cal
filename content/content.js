// content/content.js
console.log("Course2Cal content script loaded!");

// Listen for messages from the popup or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrape_courses') {
    const courses = extractCourses();
    console.log("Scraped courses from page:", courses);
    
    // Send the data back to the popup
    sendResponse({ success: true, data: courses });
  }
  return true; // Indicates we might send an async response
});

// A function to extract course data from the page DOM
function extractCourses() {
  // TODO: You will need to inspect the registration site and update these selectors
  // based on the actual HTML structure of the page.
  
  const extractedCourses = [];
  
  // Example dummy logic:
  // const courseNodes = document.querySelectorAll('.class-row-selector');
  // courseNodes.forEach(node => { ... })
  
  // Returning dummy data for now to show the flow
  extractedCourses.push({
    title: 'Example Course 101',
    time: 'MWF 10:00 AM - 10:50 AM',
    crn: '12345'
  });

  return extractedCourses;
}
