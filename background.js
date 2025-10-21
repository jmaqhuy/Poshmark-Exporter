// Lắng nghe sự kiện khi người dùng nhấp vào biểu tượng của tiện ích
chrome.action.onClicked.addListener((tab) => {
  // Chỉ thực thi nếu URL của tab là trang tủ đồ Poshmark
  if (tab.url.includes("https://poshmark.com/closet/")) {
    // Thực thi thư viện xlsx và content script trên tab hiện tại,
    // chỉ định chạy trong "MAIN world"
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['xlsx.full.min.js', 'content.js'], // <-- Tải thư viện XLSX trước
      world: 'MAIN'
    });
  } else {
    // Thông báo cho người dùng nếu họ không ở đúng trang
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        alert("Please navigate to a Poshmark closet page (e.g., https://poshmark.com/closet/<shop_username>) to use this extension.");
      }
    });
  }
});
