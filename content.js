/**
 * Poshmark XLSX Exporter (v2.6 - Cloudinary + In-Page Button)
 * Script này được tiêm tự động bởi background.js
 */

// --- Hàm chính để chạy toàn bộ logic ---
async function startPoshmarkExport() {
  console.log("Bắt đầu quá trình xuất Poshmark...");

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

  // --- Cloudinary Helper Functions ---

  /**
   * Lấy cấu hình Cloudinary đang kích hoạt từ storage
   */
  async function getActiveConfig() {
    // SỬA LỖI: Đọc config từ biến window (do background.js tiêm vào)
    const activeConfig = window.poshmarkActiveConfig;
    
    if (!activeConfig) {
      return null;
    }
    // Trả về một promise đã giải quyết để giữ cấu trúc async
    return Promise.resolve(activeConfig);
  }

  /**
   * Tạo chữ ký SHA-1 cho Cloudinary
   */
  async function generateSignature(paramsToSign, apiSecret) {
    const stringToSign = `${paramsToSign}${apiSecret}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(stringToSign);
    const hash = await window.crypto.subtle.digest('SHA-1', data);
    
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
  }

  /**
   * Tải 1 ảnh lên Cloudinary và trả về item đã được cập nhật
   */
  async function uploadImage(item, activeConfig) {
    const originalUrl = item.cover_shot ? item.cover_shot.url_large : null;
    if (!originalUrl) {
      return { ...item, processed_url: 'N/A' }; // Thêm một trường mới
    }

    try {
      const { cloudName, apiKey, apiSecret } = activeConfig;
      const filename = originalUrl.split('/').pop(); 
      const public_id = filename.split('.').slice(0, -1).join('.'); 

      if (!public_id) {
        return { ...item, processed_url: originalUrl }; // Không thể lấy public_id
      }

      const timestamp = Math.floor(Date.now() / 1000);
      const paramsToSign = `public_id=${public_id}&timestamp=${timestamp}`;
      const signature = await generateSignature(paramsToSign, apiSecret);
      
      const formData = new FormData();
      formData.append('file', originalUrl);
      formData.append('public_id', public_id);
      formData.append('api_key', apiKey);
      formData.append('timestamp', timestamp);
      formData.append('signature', signature);
      
      const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
      
      const response = await fetch(uploadUrl, {
          method: 'POST',
          body: formData
      });
      
      if (!response.ok) {
          throw new Error(`Cloudinary upload failed: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (result.secure_url) {
          console.log(`Ảnh tải lên thành công: ${result.public_id}`);
          return { ...item, processed_url: result.secure_url };
      }
      return { ...item, processed_url: originalUrl }; // Lỗi không xác định
      
    } catch (error) {
      console.error(`Lỗi tải lên ảnh ${originalUrl}:`, error);
      return { ...item, processed_url: originalUrl }; // Trả về URL gốc nếu lỗi
    }
  }

  // --- Excel Helper Function ---
  function generateAndDownloadXLSX(listings) {
    const dataForSheet = [["Title", "URL"]];
    listings.forEach(item => {
      const title = item.title;
      // Sử dụng URL đã qua xử lý (Cloudinary hoặc N/A)
      const imageUrl = item.processed_url || 'N/A';
      dataForSheet.push([title, imageUrl]);
    });

    // Kiểm tra xem XLSX đã được tải chưa
    if (typeof XLSX === 'undefined') {
        console.error("Thư viện XLSX chưa được tải!");
        alert("Lỗi: Thư viện XLSX chưa được tải. Vui lòng tải lại trang.");
        return;
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(dataForSheet);
    XLSX.utils.book_append_sheet(wb, ws, "Poshmark Listings");
    
    const closetUsername = window.location.pathname.split('/closet/')[1].split('/')[0] || 'closet';
    const urlParams = new URLSearchParams(window.location.search);
    const query = urlParams.get('query');
    
    let filename;
    if (query) {
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
    // 0. Lấy cấu hình Cloudinary đang kích hoạt
    const activeConfig = await getActiveConfig();
    if (!activeConfig) {
      alert("Vui lòng thiết lập và kích hoạt một tài khoản Cloudinary trong popup của tiện ích trước.");
      removeLoadingIndicator();
      return;
    }
    console.log(`Sử dụng Cloudinary cloud: ${activeConfig.cloudName}`);

    // 1. Get initial data from the page
    const initialState = window.__INITIAL_STATE__;
    const initialData = initialState.$_closet.listingsPostData;
    const shopUsername = initialState.$_closet.closetUserInfo.data.username;
    
    if (!initialData || !initialData.data) {
        throw new Error("Initial data not found.");
    }
    
    let pageCount = 1;
    showLoadingIndicator(`Đang tải 0 sản phẩm... (Đang xử lý & tải lên trang 1)`);

    // 1b. Xử lý và tải lên đợt dữ liệu đầu tiên
    const processPromises = initialData.data.map(item => uploadImage(item, activeConfig));
    let allListings = await Promise.all(processPromises);
    
    let nextMaxId = initialData.more ? initialData.more.next_max_id : null;
    showLoadingIndicator(`Đã tải ${allListings.length} sản phẩm...`);

    // 2. Loop to fetch subsequent pages
    while (nextMaxId) {
      console.log(`Fetching page ${pageCount + 1} with max_id: ${nextMaxId}`);
      // await delay(500);

      const requestBody = {
        filters: { department: "All", inventory_status: ["all"] },
        experience: "all",
        max_id: nextMaxId,
        count: 48,
        static_facets: false
      };
      
      const encodedRequest = encodeURIComponent(JSON.stringify(requestBody));
      const apiUrl = `https://poshmark.com/vm-rest/users/${shopUsername}/posts/filtered?request=${encodedRequest}&summarize=true`;

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      
      const jsonResponse = await response.json();

      // 2b. Xử lý và tải lên đợt dữ liệu mới
      if (jsonResponse.data && jsonResponse.data.length > 0) {
        showLoadingIndicator(`Đang tải ${allListings.length} sản phẩm... (Đang xử lý & tải lên trang ${pageCount + 1})`);
        
        const uploadPromises = jsonResponse.data.map(item => uploadImage(item, activeConfig));
        const newProcessedItems = await Promise.all(uploadPromises);
        
        allListings.push(...newProcessedItems);
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
}


// --- Hàm chèn nút bấm vào trang ---
function injectExportButton() {
  // Kiểm tra xem nút đã tồn tại chưa
  if (document.getElementById('poshmark-export-btn')) {
    return;
  }

  // Tìm vùng chứa các nút hành động
  const targetContainer = document.querySelector('.closet__header__info__user-details__actions');
  
  if (targetContainer) {
    console.log("Tìm thấy vùng chứa, đang chèn nút..."); // Thêm log
    
    // Lấy URL icon từ biến window (do background.js tiêm vào)
    const iconUrl = window.poshmarkExporterIconUrl;

    // Tạo nút bấm mới
    const exportButton = document.createElement('button');
    exportButton.id = 'poshmark-export-btn';
    exportButton.className = 'btn btn--primary m--l--2'; // Sử dụng class của Poshmark
    exportButton.style.display = 'inline-flex';
    exportButton.style.alignItems = 'center';
    exportButton.style.padding = '6px 10px'; // Điều chỉnh padding
    
    // Thêm biểu tượng vào nút
    const iconImg = document.createElement('img');
    
    // Chỉ đặt src nếu iconUrl tồn tại
    if (iconUrl) {
      iconImg.src = iconUrl;
    } else {
      console.error("Không tìm thấy URL của icon (từ window.poshmarkExporterIconUrl).");
    }

    iconImg.style.width = '20px';
    iconImg.style.height = '20px';
    iconImg.style.marginRight = '6px';
    
    exportButton.appendChild(iconImg);
    exportButton.appendChild(document.createTextNode('Xuất File'));

    // Gán sự kiện click
    exportButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation(); // Ngăn các sự kiện khác
        
        const btn = e.currentTarget; // Lấy nút
        
        // Vô hiệu hóa nút để tránh nhấp đúp
        btn.disabled = true;
        
        // Chỉ thay đổi text, giữ lại icon
        const textNode = btn.childNodes[1]; // Giả sử text node là phần tử thứ 2
        textNode.textContent = ' Đang xử lý...';
        
        startPoshmarkExport().finally(() => {
            // Kích hoạt lại nút sau khi hoàn tất (hoặc lỗi)
            btn.disabled = false;
            // Phục hồi nội dung text
            textNode.textContent = ' Xuất File';
        });
    });

    // Chèn nút vào vùng chứa
    targetContainer.appendChild(exportButton);
    
  } else {
    // Nếu chưa tìm thấy, thử lại sau một chút
    // (Điều này được xử lý bởi logic bên dưới)
  }
}

// --- Logic khởi chạy (ĐÃ CẬP NHẬT) ---

// Hàm thử chèn nút
function tryInjectButton() {
  // Kiểm tra xem nút đã tồn tại chưa
  if (document.getElementById('poshmark-export-btn')) {
    return true; // Đã chèn, không cần làm gì
  }

  // Tìm vùng chứa các nút hành động
  const targetContainer = document.querySelector('.closet__header__info__user-details__actions');
  
  if (targetContainer) {
    console.log("Tìm thấy vùng chứa, đang chèn nút...");
    injectExportButton(); // Chèn nút
    return true; // Chèn thành công
  }
  
  return false; // Chưa tìm thấy vùng chứa
}

// 1. Thử chèn ngay lập tức
if (tryInjectButton()) {
  console.log("Nút đã được chèn ngay lập tức.");
} else {
  // 2. Nếu chưa thành công, sử dụng MutationObserver để theo dõi thay đổi DOM
  console.log("Không tìm thấy vùng chứa, đang khởi tạo MutationObserver...");

  const observer = new MutationObserver((mutationsList, obs) => {
    // Không cần lặp qua mutationsList, chỉ cần kiểm tra xem phần tử đã tồn tại chưa
    if (tryInjectButton()) {
      console.log("Nút đã được chèn sau khi DOM thay đổi.");
      obs.disconnect(); // Dừng theo dõi khi đã chèn nút
    }
  });

  // Bắt đầu theo dõi body và các phần tử con của nó
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

