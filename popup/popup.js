document.addEventListener('DOMContentLoaded', async () => {
  const scrapeBtn = document.getElementById('scrapeBtn');
  const statusDiv = document.getElementById('status');
  let currentCourses = [];

  // Helper to update UI based on status
  const updateUI = (isScraping, data = null, error = null) => {
    if (isScraping) {
      if (scrapeBtn) {
        scrapeBtn.disabled = true;
        scrapeBtn.textContent = 'Scraping...';
      }
      statusDiv.textContent = 'Automated scraping in progress. Please wait...';
      document.getElementById('resultsContainer').style.display = 'none';
    } else if (data) {
      console.log('Scraped Data:', data);
      statusDiv.textContent = `Success! Scraped ${data.length} courses. Please confirm below:`;
      if (scrapeBtn && scrapeBtn.parentNode) scrapeBtn.remove();
      renderCourses(data);
    } else if (error) {
      statusDiv.textContent = 'Scraping failed: ' + error;
      if (scrapeBtn) {
        scrapeBtn.disabled = false;
        scrapeBtn.textContent = 'Scrape Courses';
      }
    }
  };

  function renderCourses(courses) {
    currentCourses = courses; // Keep reference to modified data
    const container = document.getElementById('resultsList');
    container.innerHTML = '';

    courses.forEach((course, index) => {
      const courseCard = document.createElement('div');
      courseCard.className = 'course-card';

      const editHint = document.createElement('div');
      editHint.className = 'editable-hint';
      editHint.textContent = 'Editable Title';

      // Title is editable
      const titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.className = 'course-title-input';
      titleInput.value = course.courseTitle;
      titleInput.dataset.index = index;

      // Track modified title
      titleInput.addEventListener('input', (e) => {
        currentCourses[e.target.dataset.index].modifiedTitle = e.target.value;
      });
      // Set initial modifiedTitle
      currentCourses[index].modifiedTitle = titleInput.value;

      // Details (non-editable view)
      const details = document.createElement('div');
      details.className = 'course-details';

      const addDetailLine = (label, value) => {
        const line = document.createElement('div');
        const strong = document.createElement('strong');
        strong.textContent = `${label}: `;
        line.appendChild(strong);
        line.appendChild(document.createTextNode(value));
        details.appendChild(line);
      };

      addDetailLine('Type', course.courseType || 'N/A');
      addDetailLine('Days', course.days ? course.days.join(', ') : 'N/A');
      addDetailLine('Time', `${course.startTime || 'N/A'} - ${course.endTime || 'N/A'}`);
      addDetailLine('Dates', course.dates || 'N/A');
      addDetailLine('Location', course.location || 'N/A');

      courseCard.appendChild(editHint);
      courseCard.appendChild(titleInput);
      courseCard.appendChild(details);
      container.appendChild(courseCard);
    });

    document.getElementById('resultsContainer').style.display = 'block';
  }

  // Helper to map days to RRULE format
  const RRULE_DAY_MAP = {
    sunday: 'SU', monday: 'MO', tuesday: 'TU', wednesday: 'WE',
    thursday: 'TH', friday: 'FR', saturday: 'SA'
  };

  // Helper to find the first occurrence date based on days of the week
  function findFirstOccurrence(startDateStr, targetDayNums) {
    const cursor = new Date(startDateStr + 'T00:00:00');
    for (let i = 0; i < 7; i++) {
      if (targetDayNums.includes(cursor.getDay())) {
        return cursor.toISOString().split('T')[0];
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return null;
  }

  // Parses 'MM/DD/YYYY - MM/DD/YYYY' into start and end dates formatted as YYYY-MM-DD
  function parseQuarterDates(datesString) {
    if (!datesString) return { start: null, end: null };
    const parts = datesString.split('-').map(s => s.trim());
    if (parts.length !== 2) return { start: null, end: null };

    const formatPart = (dateStr) => {
      const [m, d, y] = dateStr.split('/');
      // Assume 20xx for year if it's 2 digits
      const fullYear = y.length === 2 ? `20${y}` : y;
      const formatted = `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      console.log(`Debug: Parsed date part [${dateStr}] into [${formatted}]`);
      return formatted;
    };
    const result = { start: formatPart(parts[0]), end: formatPart(parts[1]) };
    console.log('Debug: Final parsed quarter dates:', result);
    return result;
  }

  async function createRecurringEvents(token, courses) {
    console.log('Debug: Starting createRecurringEvents with', courses.length, 'courses');
    const TIMEZONE = 'America/Los_Angeles'; // Default timezone for UCR
    const failures = [];
    let created = 0;

    for (const course of courses) {
      // Parse the quarter date range ("MM/DD/YY - MM/DD/YY")
      const { start: quarterStart, end: quarterEnd } = parseQuarterDates(course.dates);

      // Build BYDAY string (e.g. "MO,WE,FR")
      // Adding trim() to handle potential spaces like " Monday, Wednesday"
      const byDay = (course.days || [])
          .map(d => d.trim().toLowerCase())
          .map(d => RRULE_DAY_MAP[d])
          .filter(Boolean)
          .join(',');

      console.log(`Debug: Mapped days [${course.days}] to RRULE string [${byDay}]`);

      // Skip if missing crucial data (like async courses with no times)
      if (!byDay || !course.startTime || !course.endTime || !quarterStart || !quarterEnd) {
        failures.push({ event: course, error: 'Missing required scheduling data (days, times, or dates)' });
        continue;
      }

      // Format UNTIL date for RRULE (end of day in UTC: YYYYMMDDTHHMMSSZ)
      // Removing hyphens from YYYY-MM-DD -> YYYYMMDD
      const untilDate = quarterEnd.replace(/-/g, '') + 'T235959Z';

      // Build recurrence rules
      const recurrence = [`RRULE:FREQ=WEEKLY;BYDAY=${byDay};UNTIL=${untilDate}`];

      // Map string day names to JS Date.getDay() numbers (0-6)
      const patternDayNums = course.days.map(d => {
        const map = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
        return map[d.trim().toLowerCase()];
      });

      console.log(`Debug: Quarter window [${quarterStart} to ${quarterEnd}], Target day numbers: [${patternDayNums}]`);

      // Find the actual first occurrence date
      const startDate = findFirstOccurrence(quarterStart, patternDayNums);
      console.log(`Debug: First occurrence for ${course.courseTitle} set to ${startDate}`);
      
      if (!startDate) {
        failures.push({ event: course, error: 'Could not find first occurrence within the window' });
        continue;
      }

      const calendarEvent = {
        summary: course.modifiedTitle || course.courseTitle,
        location: course.location || undefined,
        description: course.courseType ? `Course Type: ${course.courseType}` : undefined,
        start: {
          dateTime: `${startDate}T${course.startTime}:00`,
          timeZone: TIMEZONE,
        },
        end: {
          dateTime: `${startDate}T${course.endTime}:00`,
          timeZone: TIMEZONE,
        },
        recurrence: recurrence,
      };

      console.log(`Debug: Sending payload for ${course.courseTitle}:`, calendarEvent);

      try {
        const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(calendarEvent)
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error('Google Calendar API Error:', errorData);
          throw new Error(errorData.error ? errorData.error.message : `API request failed with status ${response.status}`);
        }

        created++;
        statusDiv.textContent = `Syncing... (${created}/${courses.length})`;
      } catch (err) {
        failures.push({
          event: course,
          error: err.message,
        });
      }
    }

    return { created, failed: failures };
  }

  // Handle confirm button
  document.getElementById('confirmBtn').addEventListener('click', () => {
    console.log("Confirmed Data for Sync:", currentCourses);
    statusDiv.textContent = `Authorizing with Google Calendar...`;

    // Request OAuth2 Token
    chrome.identity.getAuthToken({ interactive: true }, async function (token) {
      if (chrome.runtime.lastError || !token) {
        console.error(chrome.runtime.lastError);
        statusDiv.textContent = `Authorization failed: ${chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Unknown error'}. Make sure your client_id is set in manifest.json.`;
        return;
      }

      console.log("Successfully obtained OAuth token!", token);
      statusDiv.textContent = `Authorization successful! Starting sync...`;

      const { created, failed } = await createRecurringEvents(token, currentCourses);

      if (failed.length > 0) {
        console.error("Some events failed to sync:", failed);
        const firstError = failed[0].error || 'Unknown error';
        statusDiv.textContent = `Synced ${created} events. ${failed.length} failed. First error: ${firstError}`;
      } else {
        statusDiv.textContent = `Successfully synced all ${created} events to your calendar!`;
      }
      document.getElementById('confirmBtn').remove(); // remove button once done
    });
  });

  // Check if a scrape is already in progress or results already exist on load
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'check_status' }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response) updateUI(response.isScraping, response.data);
    });
  }

  // Listen for real-time updates from content script
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'scraping_started') {
      updateUI(true);
    } else if (request.action === 'scraping_finished') {
      updateUI(false, request.data, request.error);
    }
  });

  if (scrapeBtn) {
    scrapeBtn.addEventListener('click', async () => {
      updateUI(true);

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      chrome.tabs.sendMessage(tab.id, { action: 'scrape_data_attributes' }, (response) => {
        if (chrome.runtime.lastError) {
          updateUI(false, null, chrome.runtime.lastError.message);
          return;
        }
        // Note: Final UI update is handled by the onMessage listener for 'scraping_finished'
      });
    });
  }
});
