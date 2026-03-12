// content/content.js
console.log("Course2Cal content script loaded!");

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Listen for messages from the popup or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrape_data_attributes') {
    // We make this an async IIFE to use 'await'
    (async () => {
      try {
        const results = await startAutomatedScrape();
        sendResponse({ success: true, data: results });
      } catch (error) {
        console.error("Scraping error:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep channel open for async response
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
    backgroundColor: "rgba(0, 0, 0, 0.7)",
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
  showOverlay();
  const allCourseData = [];
  const seen = new Set();
  
  try {
    const selector = ".section-details-link";
    const courseLinks = Array.from(document.getElementById("scheduleCalView").querySelectorAll(selector));
    
    console.log(`Starting scrape of ${courseLinks.length} potential courses...`);

    for (const link of courseLinks) {
      const courseIdentifier = link.getAttribute("data-attributes");

      // Skip if already processed or invalid
      if (!courseIdentifier || seen.has(courseIdentifier)) continue;
      seen.add(courseIdentifier);

      console.log(`Scraping course identifier: ${courseIdentifier}`);
      
      // Open the course details modal
      link.click();

      // Wait for the modal to appear (jQuery UI dialogs often have transition times)
      await sleep(1000); 

      // Select the modal - typically a .ui-dialog on this registration site
      const modal = document.querySelector(".ui-dialog"); 

      let courseData = { 
        id: courseIdentifier 
      };

      if (modal) {
        console.log("Modal found, scraping details...");

        const classDetails = modal.querySelector("#classDetailsContentDetailsDiv");
        
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
          const titleSpan = classDetails.querySelector("#courseTitle");
          if (titleSpan) {
            courseData.courseTitle = titleSpan.textContent.trim();
          }

          // Click on the "Instructor/Meeting Times" tab
          const meetingTimesTab = modal.querySelector("#facultyMeetingTimes a");
          if (meetingTimesTab) {
            console.log("Found Meeting Times tab, clicking...");
            meetingTimesTab.click();
            // Wait for tab content to load
            await sleep(1000); 
            
            const meetingContainer = modal.querySelector(".meetingTimesContainer");
            if (meetingContainer) {
              console.log("Meeting times container found, scraping...");
              
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
                  courseData.location = locationDiv.textContent.replace(/\s+/g, ' ').trim();
                }
              }
            }
          }
        }
        
        // Close the modal after scraping to clean up the UI for the next item
        const closeBtn = modal.querySelector(".ui-dialog-titlebar-close");
        if (closeBtn) {
          closeBtn.click();
          await sleep(500); // Small pause for the modal clear
        }
      }

      allCourseData.push(courseData);
    }
  } catch (error) {
    console.error("Scraping error:", error);
  } finally {
    hideOverlay();
  }
  
  console.log("Scrape complete!", allCourseData);
  return allCourseData;
}
