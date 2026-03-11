document.addEventListener('DOMContentLoaded', () => {
  const scrapeBtn = document.getElementById('scrapeBtn');
  const statusEl = document.getElementById('status');

  scrapeBtn.addEventListener('click', async () => {
    statusEl.textContent = 'Scraping...';
    
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Send a message to the content script in the active tab
    chrome.tabs.sendMessage(tab.id, { action: 'scrape_courses' }, (response) => {
      if (chrome.runtime.lastError) {
        statusEl.textContent = 'Error: Could not connect to the page. Make sure you are on the registration site.';
        console.error(chrome.runtime.lastError);
        return;
      }
      
      if (response && response.success) {
        statusEl.textContent = `Success! Found ${response.data.length} courses. Check console for details.`;
      } else {
        statusEl.textContent = 'Failed to scrape courses.';
      }
    });
  });
});
