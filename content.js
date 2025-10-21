(async function() {
  console.log("Poshmark XLSX Exporter (v2.3) script injected.");

  if (!window.location.href.startsWith("https://poshmark.com/closet/")) {
    alert("This script only works on Poshmark closet pages.");
    return;
  }

  // --- Helper Functions for UI ---
  function showLoadingIndicator(message) {
    let indicator = document.getElementById('poshmark-exporter-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'poshmark-exporter-indicator';
      Object.assign(indicator.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        backgroundColor: '#4CAF50',
        color: 'white',
        padding: '15px',
        borderRadius: '8px',
        zIndex: '9999',
        fontFamily: 'sans-serif',
        fontSize: '16px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
      });
      document.body.appendChild(indicator);
    }
    indicator.textContent = message;
  }

  function removeLoadingIndicator() {
    const indicator = document.getElementById('poshmark-exporter-indicator');
    if (indicator) indicator.remove();
  }

  function generateAndDownloadXLSX(listings) {
    const dataForSheet = [["Title", "URL"]];
    listings.forEach(item => {
      const title = item.title;
      const imageUrl = item.cover_shot ? item.cover_shot.url_large : 'N/A';
      dataForSheet.push([title, imageUrl]);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(dataForSheet);
    XLSX.utils.book_append_sheet(wb, ws, "Poshmark Listings");
    
    const closetUsername = window.location.pathname.split('/closet/')[1].split('/')[0] || 'closet';
    
    // Check for a search query in the URL
    const urlParams = new URLSearchParams(window.location.search);
    const query = urlParams.get('query');
    
    let filename;
    if (query) {
      // Create a filename-safe version of the query
      const sanitizedQuery = query.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      filename = `poshmark_${closetUsername}_search_${sanitizedQuery}.xlsx`;
    } else {
      filename = `poshmark_${closetUsername}_all_listings.xlsx`;
    }
    
    XLSX.writeFile(wb, filename);
  }

  const delay = ms => new Promise(res => setTimeout(res, ms));

  // --- Main Logic ---
  try {
    // 1. Get initial data from the page
    const initialState = window.__INITIAL_STATE__;
    const initialData = initialState.$_closet.listingsPostData;
    const shopUsername = initialState.$_closet.closetUserInfo.data.username;
    
    if (!initialData || !initialData.data) {
        throw new Error("Initial data not found.");
    }

    let allListings = [...initialData.data];
    let nextMaxId = initialData.more ? initialData.more.next_max_id : null;
    let pageCount = 1;

    showLoadingIndicator(`Đã tải ${allListings.length} sản phẩm...`);

    // 2. Loop to fetch subsequent pages
    while (nextMaxId) {
      console.log(`Fetching page ${pageCount + 1} with max_id: ${nextMaxId}`);
      await delay(800);

      const requestBody = {
        filters: { department: "All", inventory_status: ["all"] },
        experience: "all",
        max_id: nextMaxId,
        count: 48,
        static_facets: false
      };
      
      // Encode the request body for the GET request URL
      const encodedRequest = encodeURIComponent(JSON.stringify(requestBody));
      const apiUrl = `https://poshmark.com/vm-rest/users/${shopUsername}/posts/filtered?request=${encodedRequest}&summarize=true`;

      const response = await fetch(apiUrl, {
        method: 'GET', // Changed to GET
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      
      const jsonResponse = await response.json();

      if (jsonResponse.data && jsonResponse.data.length > 0) {
        allListings.push(...jsonResponse.data);
      }

      nextMaxId = jsonResponse.more ? jsonResponse.more.next_max_id : null;
      pageCount++;
      showLoadingIndicator(`Đang tải... Đã lấy được ${allListings.length} sản phẩm.`);
    }

    // 3. Generate and download the file
    showLoadingIndicator(`Hoàn tất! Đang tạo tệp Excel với ${allListings.length} sản phẩm.`);
    generateAndDownloadXLSX(allListings);
    
    setTimeout(removeLoadingIndicator, 4000);

  } catch (error) {
    console.error("Error during Poshmark export:", error);
    alert("Đã xảy ra lỗi khi lấy dữ liệu. Cấu trúc trang web có thể đã thay đổi hoặc có lỗi mạng. Vui lòng thử lại.");
    removeLoadingIndicator();
  }
})();

