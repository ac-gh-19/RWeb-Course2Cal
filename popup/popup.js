document.addEventListener('DOMContentLoaded', async () => {
  const scrapeBtn = document.getElementById('scrapeBtn');
  const statusDiv = document.getElementById('status');
  const confirmBtn = document.getElementById('confirmBtn');
  let currentCourses = [];

  // Check if sync was already clicked previously
  chrome.storage.local.get(['syncClicked'], (res) => {
    if (res.syncClicked && confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Sync already requested...';
    }
  });

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
      statusDiv.textContent = 'Scraping failed. Please try again.';
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

  function updateSyncUI(status) {
    if (status.isSyncing) {
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Syncing...';
      }
      statusDiv.textContent = `Syncing... (${status.created}/${status.total})`;
    } else if (status.done) {
      if (confirmBtn && confirmBtn.parentNode) {
        confirmBtn.remove();
      }
      if (status.failed && status.failed.length > 0) {
        console.error("Some events failed to sync:", status.failed);
        const firstError = status.failed[0].error || 'Unknown error';
        statusDiv.textContent = `Synced ${status.created} events. ${status.failed.length} failed. First error: ${firstError}`;
      } else {
        statusDiv.textContent = `Successfully synced all ${status.created} events to your calendar!`;
        const resultsContainer = document.getElementById('resultsContainer');
        if (resultsContainer) {
          resultsContainer.style.display = 'none';
        }
      }
      chrome.storage.local.remove(['syncClicked']);
    }
  }

  // Handle confirm button
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Starting Sync...';
      chrome.storage.local.set({ syncClicked: true });

      console.log("Starting sync via background script...");
      statusDiv.textContent = `Authorizing and starting sync...`;

      chrome.runtime.sendMessage({ action: 'start_sync', courses: currentCourses }, (response) => {
        if (chrome.runtime.lastError) {
           console.error("Extension runtime error:", chrome.runtime.lastError);
           statusDiv.textContent = `Error: Could not contact background script.`;
           confirmBtn.disabled = false;
           confirmBtn.textContent = 'Confirm & Sync to Calendar';
           chrome.storage.local.remove(['syncClicked']);
        } else if (response && response.error) {
           console.error("Sync error:", response.error);
           statusDiv.textContent = `Error: ${response.error}`;
           confirmBtn.disabled = false;
           confirmBtn.textContent = 'Confirm & Sync to Calendar';
           chrome.storage.local.remove(['syncClicked']);
        }
      });
    });
  }

  // Check if a sync is already in progress on load
  chrome.runtime.sendMessage({ action: 'get_sync_status' }, (status) => {
    if (chrome.runtime.lastError) return; // Ignore if background isn't ready
    if (status && (status.isSyncing || status.done)) {
      updateSyncUI(status);
    }
  });

  // Check if a scrape is already in progress
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'check_status' }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response) updateUI(response.isScraping, response.data);
    });
  }

  // Listen for real-time updates from content and background scripts
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'scraping_started') {
      updateUI(true);
    } else if (request.action === 'scraping_finished') {
      updateUI(false, request.data, request.error);
    } else if (request.action === 'sync_progress' || request.action === 'sync_finished') {
      updateSyncUI(request.status);
    }
  });

  if (scrapeBtn) {
    scrapeBtn.addEventListener('click', async () => {
      // Reset sync state on new scrape
      chrome.storage.local.remove(['syncClicked']);
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Confirm & Sync to Calendar';
      }
      
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
