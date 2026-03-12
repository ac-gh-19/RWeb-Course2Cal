// content/content.js
// console.log("Course2Cal content script loaded!");

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Polls for a condition to be met.
 * @param {Function} predicate - A function that returns a value when the condition is met.
 * @param {number} timeout - Maximum time to wait in ms.
 * @returns {Promise<any>} - The result of the predicate.
 */
async function waitFor(predicate, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = predicate();
    if (result) return result;
    await sleep(100);
  }
  return null;
}

let isScraping = false;
let lastResults = null;

// Listen for messages from the popup or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrape_data_attributes') {
    // Prevent starting a multiple scrapes
    if (isScraping) {
      sendResponse({ success: false, error: 'Scraping already in progress' });
      return;
    }

    // We make this an async IIFE to use 'await'
    (async () => {
      try {
        // Broadcast that we've started
        chrome.runtime.sendMessage({ action: 'scraping_started' });

        const results = await startAutomatedScrape();
        sendResponse({ success: true, data: results });

        // Broadcast that we've finished successfully
        chrome.runtime.sendMessage({ action: 'scraping_finished', success: true, data: results });
      } catch (error) {
        // Scraping error silenced for production
        sendResponse({ success: false, error: 'An error occurred during scraping. Please try again.' });

        // Broadcast the error
        chrome.runtime.sendMessage({ action: 'scraping_finished', success: false, error: 'An error occurred during scraping. Please try again.' });
      }
    })();
    return true; // Keep channel open for async response
  }

  if (request.action === 'check_status') {
    sendResponse({ isScraping, data: lastResults });
    return false;
  }
});

function showOverlay() {
  if (document.getElementById("scraping-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "scraping-overlay";
  Object.assign(overlay.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    zIndex: "99999",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    color: "white",
    fontFamily: "sans-serif",
    pointerEvents: "all"
  });

  const spinner = document.createElement("div");
  Object.assign(spinner.style, {
    width: "50px",
    height: "50px",
    border: "5px solid #f3f3f3",
    borderTop: "5px solid #3498db",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
    marginBottom: "20px"
  });

  // Add the animation via a style tag if it doesn't exist
  if (!document.getElementById("scraping-style")) {
    const style = document.createElement("style");
    style.id = "scraping-style";
    style.textContent = `
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);
  }

  const message = document.createElement("h2");
  message.textContent = "Scraping courses... Please do not click anything!";
  Object.assign(message.style, {
    margin: "10px 0",
    textAlign: "center"
  });

  const submessage = document.createElement("p");
  submessage.textContent = "We are automating navigation to gather your course details.";
  Object.assign(submessage.style, {
    fontSize: "1.1rem",
    opacity: "0.8",
    maxWidth: "450px",
    textAlign: "center",
    lineHeight: "1.5",
    color: "white"
  });

  overlay.appendChild(spinner);
  overlay.appendChild(message);
  overlay.appendChild(submessage);
  document.body.appendChild(overlay);
}

function hideOverlay() {
  const overlay = document.getElementById("scraping-overlay");
  if (overlay) overlay.remove();
}

async function startAutomatedScrape() {
  isScraping = true;
  showOverlay();
  const allCourseData = [];
  const seen = new Set();

  try {
    const selector = ".section-details-link";
    const container = document.getElementById("scheduleCalView") || document.getElementById("scheduleListView") || document.querySelector(".registration-results-container") || document;
    if (!container) throw new Error("Could not find course container on page.");
    const courseLinks = Array.from(container.querySelectorAll(selector));

    for (const link of courseLinks) {
      const courseIdentifier = link.getAttribute("data-attributes");

      // Skip if already processed or invalid
      if (!courseIdentifier || seen.has(courseIdentifier)) continue;
      seen.add(courseIdentifier);

      // console.log(`Scraping course identifier: ${courseIdentifier}`);

      // Open the course details modal
      link.click();
      await sleep(200); // Small pacing delay to show the "click"

      // Wait for the course details modal AND the specific course details content to be populated
      const modal = await waitFor(() => {
        const dialog = document.querySelector(".course-details-dialog") || 
                       Array.from(document.querySelectorAll(".ui-dialog")).find(d => d.innerText.includes("Schedule Type"));
        if (!dialog) return null;

        // Ensure the content div is actually populated before returning the modal
        const content = dialog.querySelector("#classDetailsContentDetailsDiv") || document.getElementById("classDetailsContentDetailsDiv");
        return content ? dialog : null;
      }, 5000);

      let courseData = {
        id: courseIdentifier
      };

      if (modal) {
        // Try searching inside the modal first, then globally as a fallback
        let classDetails = modal.querySelector("#classDetailsContentDetailsDiv");
        if (!classDetails) {
            // console.log("Details not in modal tree, trying global search...");
            classDetails = document.getElementById("classDetailsContentDetailsDiv");
        }

        if (classDetails) {
          // Extract basic details: Schedule Type
          const boldSpans = classDetails.querySelectorAll(".status-bold");
          boldSpans.forEach(span => {
            const label = span.textContent.trim();
            if (label === "Schedule Type:") {
              // The value is usually a text node next to the "Schedule Type:" bold label
              courseData.courseType = span.nextSibling?.textContent?.trim() || "N/A";
            }
          });

          // Extract basic details: Course Title
          // Using ID search directly as it's more specific on this page
          const titleSpan = classDetails.querySelector("#courseTitle") || document.getElementById("courseTitle");
          if (titleSpan) {
            courseData.courseTitle = titleSpan.textContent.trim();
          }

          // Click on the "Instructor/Meeting Times" tab
          const meetingTimesTab = modal.querySelector("#facultyMeetingTimes a") || document.querySelector("#facultyMeetingTimes a");
          if (meetingTimesTab) {
            meetingTimesTab.click();
            await sleep(200); // Pacing delay
            
            // Wait for tab content (.meetingTimesContainer) to load
            const meetingContainer = await waitFor(() => modal.querySelector(".meetingTimesContainer"), 3000);

            if (meetingContainer) {
              // Get Meeting Dates
              const datesDiv = meetingContainer.querySelector(".left .dates");
              if (datesDiv) {
                courseData.dates = datesDiv.textContent.trim();
              }

              // Get Days (normalized full names like "Monday")
              const daySummary = meetingContainer.querySelector(".left .ui-pillbox .ui-pillbox-summary");
              if (daySummary) {
                courseData.days = daySummary.textContent.trim().split(",");
              }

              // Get Time and Location (from the 'right' detail panel)
              const rightDiv = meetingContainer.querySelector(".right");
              if (rightDiv) {
                // The first child div contains the time spans (e.g., "08:00 AM - 09:20 AM")
                const timeDiv = rightDiv.querySelector("div:first-child");
                if (timeDiv) {
                  const rawTime = timeDiv.textContent.replace(/\s+/g, ' ').trim();
                  const [startRaw, endRaw] = rawTime.split("-").map(t => t.trim());

                  // Helper to normalize "HH:mm AM/PM" to 24-hour "HH:mm"
                  const to24h = (timeStr) => {
                    if (!timeStr) return null;
                    const parts = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
                    if (!parts) return null;
                    let hours = parseInt(parts[1], 10);
                    const minutes = parts[2];
                    const ampm = parts[3].toUpperCase();
                    if (ampm === "PM" && hours < 12) hours += 12;
                    if (ampm === "AM" && hours === 12) hours = 0;
                    return `${String(hours).padStart(2, '0')}:${minutes}`;
                  };

                  courseData.startTime = to24h(startRaw);
                  courseData.endTime = to24h(endRaw);
                }

                // The second child div contains the physical location
                const locationDiv = rightDiv.querySelector("div:nth-child(2)");
                if (locationDiv) {
                  const fullLocation = locationDiv.textContent.replace(/\s+/g, ' ').trim();
                  // Remove "RIVERSIDE CAMPUS | " if it exists by splitting at the first pipe
                  const parts = fullLocation.split('|').map(s => s.trim());
                  if (parts.length > 1) {
                    // Joins everything after the first part (e.g., "Olmsted | Room 1208")
                    courseData.location = parts.slice(1).join(' | ');
                  } else {
                    courseData.location = fullLocation;
                  }
                }
              }
            }
          }
        }

        // Close the modal after scraping to clean up the UI for the next item
        const closeBtn = modal.querySelector(".ui-dialog-titlebar-close");
        if (closeBtn) {
          closeBtn.click();
          // Wait for modal to disappear or just a small pause for cleanup
          await waitFor(() => !document.body.contains(modal), 2000);
        }
      }

      allCourseData.push(courseData);
    }
  } catch (error) {
    // Silenced for production
  } finally {
    isScraping = false;
    hideOverlay();
  }

  lastResults = allCourseData;
  // console.log("Scrape complete!", allCourseData);
  return allCourseData;
}
