document.addEventListener('DOMContentLoaded', () => {
  const scrapeBtn = document.getElementById('scrapeBtn');
  const statusDiv = document.getElementById('status');

  scrapeBtn.addEventListener('click', async () => {
    // 1. Disable the button immediately
    scrapeBtn.disabled = true;
    scrapeBtn.textContent = 'Scraping...';
    statusDiv.textContent = 'Automated scraping started. Please keep the page open.';
    
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Send a message to the content script in the active tab
    chrome.tabs.sendMessage(tab.id, { action: 'scrape_data_attributes' }, (response) => {
      if (chrome.runtime.lastError) {
        statusDiv.textContent = 'Error: ' + chrome.runtime.lastError.message;
        scrapeBtn.disabled = false;
        scrapeBtn.textContent = 'Scrape Courses';
        return;
      }
      
      if (response && response.success) {
        console.log('Final Scraped Data:', response.data);
        statusDiv.textContent = `Success! Scraped ${response.data.length} courses. Check the console for full details.`;
      } else {
        statusDiv.textContent = 'Scraping failed: ' + (response ? response.error : 'Unknown error');
        scrapeBtn.disabled = false;
        scrapeBtn.textContent = 'Scrape Courses';
      }
    });
  });
});
