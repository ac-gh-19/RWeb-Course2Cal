document.addEventListener('DOMContentLoaded', async () => {
  const scrapeBtn = document.getElementById('scrapeBtn');
  const statusDiv = document.getElementById('status');

  // Helper to update UI based on status
  const updateUI = (isScraping, data = null, error = null) => {
    if (isScraping) {
      scrapeBtn.disabled = true;
      scrapeBtn.textContent = 'Scraping...';
      statusDiv.textContent = 'Automated scraping in progress. Please wait...';
    } else if (data) {
      console.log('Scraped Data:', data);
      statusDiv.textContent = `Success! Scraped ${data.length} courses. Check the console for details.`;
      scrapeBtn.remove();
    } else if (error) {
      statusDiv.textContent = 'Scraping failed: ' + error;
      scrapeBtn.disabled = false;
      scrapeBtn.textContent = 'Scrape Courses';
    }
  };

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
});
