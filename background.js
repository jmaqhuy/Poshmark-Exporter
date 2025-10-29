/**
 * Poshmark Exporter - Background Script (v2.0 - Hỗ trợ tự động cập nhật)
 */

// Hàm để lấy cấu hình đang kích hoạt từ storage
async function getActiveConfigFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['cloudinaryConfigs', 'activeConfigIndex'], ({ cloudinaryConfigs, activeConfigIndex }) => {
      let activeConfig = null;
      if (cloudinaryConfigs && activeConfigIndex !== undefined && activeConfigIndex >= 0 && activeConfigIndex < cloudinaryConfigs.length) {
        activeConfig = cloudinaryConfigs[activeConfigIndex];
      }
      resolve(activeConfig);
    });
  });
}

// Hàm để tiêm (hoặc cập nhật) config vào một tab cụ thể
async function injectConfigIntoTab(tabId, config) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      world: 'MAIN',
      func: (activeConfig) => {
        window.poshmarkActiveConfig = activeConfig;
        console.log("Cấu hình Cloudinary đã được cập nhật trên trang.", activeConfig ? activeConfig.cloudName : 'NONE');
      },
      args: [config] // Truyền config mới vào
    });
  } catch (err) {
    console.error(`Không thể tiêm config vào tab ${tabId}:`, err.message);
  }
}

// Hàm để tiêm script đầy đủ (cho lần tải trang đầu tiên)
async function injectInitialScripts(tabId, iconUrl, activeConfig) {
  try {
    // 1. Tiêm các biến toàn cục (icon và config)
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      world: 'MAIN',
      func: (url, config) => {
        window.poshmarkExporterIconUrl = url;
        window.poshmarkActiveConfig = config;
      },
      args: [iconUrl, activeConfig]
    });

    // 2. Tiêm thư viện XLSX
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['xlsx.full.min.js'],
      world: 'MAIN'
    });

    // 3. Tiêm content script chính
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js'],
      world: 'MAIN'
    });

    console.log(`Đã tiêm script đầy đủ vào tab ${tabId}.`);

  } catch (err) {
    console.error(`Lỗi tiêm script lần đầu vào tab ${tabId}:`, err.message);
  }
}

// === LẮNG NGHE SỰ KIỆN ===

// 1. Lắng nghe sự kiện tải trang
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Chỉ thực thi khi trang đã tải xong và URL là trang tủ đồ Poshmark
  if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith("https://poshmark.com/closet/")) {
    console.log(`Phát hiện trang Poshmark tải xong: ${tabId}`);
    
    // Lấy các tài nguyên cần thiết
    const iconUrl = chrome.runtime.getURL('images/icon48.png');
    const activeConfig = await getActiveConfigFromStorage();
    
    // Tiêm script đầy đủ
    await injectInitialScripts(tabId, iconUrl, activeConfig);
  }
});

// 2. Lắng nghe thông báo từ popup (khi config thay đổi)
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === "CONFIG_UPDATED") {
    console.log("Nhận được thông báo CONFIG_UPDATED từ popup.");
    
    // 1. Lấy cấu hình mới
    const newActiveConfig = await getActiveConfigFromStorage();
    
    // 2. Tìm tất cả các tab Poshmark đang mở
    chrome.tabs.query({ url: "*://poshmark.com/closet/*" }, (tabs) => {
      if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
          return;
      }
      
      console.log(`Tìm thấy ${tabs.length} tab Poshmark để cập nhật config.`);
      
      // 3. Tiêm config mới vào từng tab
      for (const tab of tabs) {
        if (tab.id) {
          injectConfigIntoTab(tab.id, newActiveConfig);
        }
      }
    });
    
    // Không cần sendResponse() vì đây là thông báo một chiều
  }
});

