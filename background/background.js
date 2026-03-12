let syncStatus = {
  isSyncing: false,
  total: 0,
  created: 0,
  failed: [],
  done: false
};

// Helper to map days to RRULE format
const RRULE_DAY_MAP = {
  sunday: 'SU', monday: 'MO', tuesday: 'TU', wednesday: 'WE',
  thursday: 'TH', friday: 'FR', saturday: 'SA'
};

// Helper to find the first occurrence date
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

// Parse quarter dates
function parseQuarterDates(datesString) {
  if (!datesString) return { start: null, end: null };
  const parts = datesString.split('-').map(s => s.trim());
  if (parts.length !== 2) return { start: null, end: null };

  const formatPart = (dateStr) => {
    const [m, d, y] = dateStr.split('/');
    const fullYear = y.length === 2 ? `20${y}` : y;
    return `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  };
  return { start: formatPart(parts[0]), end: formatPart(parts[1]) };
}

async function createRecurringEvents(token, courses) {
  const TIMEZONE = 'America/Los_Angeles';
  
  syncStatus.isSyncing = true;
  syncStatus.total = courses.length;
  syncStatus.created = 0;
  syncStatus.failed = [];
  syncStatus.done = false;

  for (const course of courses) {
    const { start: quarterStart, end: quarterEnd } = parseQuarterDates(course.dates);

    const byDay = (course.days || [])
        .map(d => d.trim().toLowerCase())
        .map(d => RRULE_DAY_MAP[d])
        .filter(Boolean)
        .join(',');

    if (!byDay || !course.startTime || !course.endTime || !quarterStart || !quarterEnd) {
      syncStatus.failed.push({ event: course, error: 'Missing required scheduling data' });
      continue;
    }

    const untilDate = quarterEnd.replace(/-/g, '') + 'T235959Z';
    const recurrence = [`RRULE:FREQ=WEEKLY;BYDAY=${byDay};UNTIL=${untilDate}`];

    const patternDayNums = course.days.map(d => {
      const map = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
      return map[d.trim().toLowerCase()];
    });

    const startDate = findFirstOccurrence(quarterStart, patternDayNums);
    
    if (!startDate) {
      syncStatus.failed.push({ event: course, error: 'Could not find first occurrence' });
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
        throw new Error(errorData.error ? errorData.error.message : `API request failed with status ${response.status}`);
      }

      syncStatus.created++;
      // Broadcast progress update
      chrome.runtime.sendMessage({ action: 'sync_progress', status: syncStatus });
    } catch (err) {
      syncStatus.failed.push({ event: course, error: err.message });
    }
  }

  syncStatus.isSyncing = false;
  syncStatus.done = true;
  // Broadcast final success/failure
  chrome.runtime.sendMessage({ action: 'sync_finished', status: syncStatus });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'start_sync') {
    if (syncStatus.isSyncing) {
      sendResponse({ error: 'Sync already in progress' });
      return;
    }
    
    // We get the token in the background script using the interactive flag from the popup's request
    chrome.identity.getAuthToken({ interactive: true }, function (token) {
      if (chrome.runtime.lastError || !token) {
        sendResponse({ error: chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Unknown auth error' });
        return;
      }
      
      // Start async sync without waiting for it to finish before responding
      createRecurringEvents(token, request.courses);
      sendResponse({ success: true, message: 'Sync started' });
    });
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'get_sync_status') {
    sendResponse(syncStatus);
    return false;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  // console.log('RWeb Course2Cal Extension installed');
});
