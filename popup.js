/**
 * Poshmark Exporter - Popup Logic (v2.1 - Đã sửa lỗi)
 */

// Đảm bảo script chỉ chạy khi DOM đã tải xong
document.addEventListener('DOMContentLoaded', () => {
    // Lấy các phần tử DOM
    const configForm = document.getElementById('configForm');
    if (!configForm) {
        console.error("Lỗi nghiêm trọng: Không tìm thấy #configForm. HTML có thể bị hỏng.");
        return; // Dừng thực thi nếu không tìm thấy form
    }
    
    const cloudNameInput = document.getElementById('cloudName');
    const apiKeyInput = document.getElementById('apiKey');
    const apiSecretInput = document.getElementById('apiSecret');
    const saveButton = document.getElementById('saveButton');
    const messageDiv = document.getElementById('message');
    const configListDiv = document.getElementById('configList');

    let configs = [];
    let activeIndex = -1;
    let editingIndex = -1; // -1 nghĩa là thêm mới, ngược lại là chỉnh sửa

    // --- Helper Functions ---

    function showMessage(text, isError = false) {
        messageDiv.textContent = text;
        messageDiv.className = isError ? 'message error' : 'message success';
        
        // Tự động ẩn sau 4 giây
        setTimeout(() => {
            messageDiv.textContent = '';
            messageDiv.className = 'message';
        }, 4000);
    }

    // Thông báo cho background script để cập nhật các tab đang mở
    function notifyBackgroundOfChange() {
        console.log("Thông báo cho background: Cấu hình đã thay đổi.");
        // Gửi thông báo cho background script
        chrome.runtime.sendMessage({ type: "CONFIG_UPDATED" }, (response) => {
            if (chrome.runtime.lastError) {
                // Xử lý lỗi nếu không thể gửi tin nhắn (ví dụ: background chưa sẵn sàng)
                console.warn("Không thể gửi tin nhắn đến background:", chrome.runtime.lastError.message);
            }
        });
    }

    // Tải cấu hình từ storage
    function loadConfigs() {
        chrome.storage.sync.get(['cloudinaryConfigs', 'activeConfigIndex'], (result) => {
            if (chrome.runtime.lastError) {
                console.error("Không thể tải cấu hình:", chrome.runtime.lastError);
                showMessage("Lỗi: Không thể tải cấu hình đã lưu.", true);
                return;
            }
            configs = result.cloudinaryConfigs || [];
            activeIndex = result.activeConfigIndex !== undefined ? result.activeConfigIndex : -1;
            renderConfigList();
            resetForm();
        });
    }

    // Hiển thị danh sách cấu hình
    function renderConfigList() {
        configListDiv.innerHTML = ''; // Xóa danh sách cũ
        if (configs.length === 0) {
            configListDiv.innerHTML = '<p class="empty-list">Chưa có cấu hình nào được lưu.</p>';
            return;
        }

        configs.forEach((config, index) => {
            const configItem = document.createElement('div');
            configItem.className = 'config-item';
            
            const isActive = (index === activeIndex);
            if (isActive) {
                configItem.classList.add('active');
            }

            // Tạo nội dung HTML an toàn
            const nameSpan = document.createElement('span');
            nameSpan.className = 'config-name';
            nameSpan.textContent = `${config.cloudName} ${isActive ? '(Đang kích hoạt)' : ''}`;

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'config-actions';

            const activateButton = document.createElement('button');
            activateButton.className = 'btn-activate';
            activateButton.textContent = 'Kích hoạt';
            activateButton.dataset.index = index;
            activateButton.disabled = isActive;

            const editButton = document.createElement('button');
            editButton.className = 'btn-edit';
            editButton.textContent = 'Sửa';
            editButton.dataset.index = index;

            const deleteButton = document.createElement('button');
            deleteButton.className = 'btn-delete';
            deleteButton.textContent = 'Xóa';
            deleteButton.dataset.index = index;

            actionsDiv.appendChild(activateButton);
            actionsDiv.appendChild(editButton);
            actionsDiv.appendChild(deleteButton);

            configItem.appendChild(nameSpan);
            configItem.appendChild(actionsDiv);
            
            configListDiv.appendChild(configItem);
        });
    }

    // Đặt lại form về trạng thái thêm mới
    function resetForm() {
        configForm.reset(); // Cách đơn giản để xóa form
        editingIndex = -1;
        saveButton.textContent = 'Thêm & Xác thực';
        saveButton.disabled = false;
    }

    // Ping Cloudinary để xác thực
    async function pingCloudinary(cloudName, apiKey, apiSecret) {
        const url = `https://api.cloudinary.com/v1_1/${cloudName}/ping`;
        // Mã hóa Base64 tên người dùng và mật khẩu
        const credentials = btoa(`${apiKey}:${apiSecret}`); 

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${credentials}`
                }
            });
            // response.ok là true nếu status code là 200-299
            return response.ok; 
        } catch (error) {
            console.error('Ping thất bại:', error);
            return false;
        }
    }

    // --- Event Handlers ---

    // Xử lý lưu (thêm mới hoặc cập nhật)
    configForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Ngăn form gửi đi theo cách truyền thống
        
        const cloudName = cloudNameInput.value.trim();
        const apiKey = apiKeyInput.value.trim();
        const apiSecret = apiSecretInput.value.trim();

        if (!cloudName || !apiKey || !apiSecret) {
            showMessage('Vui lòng điền đầy đủ thông tin.', true);
            return;
        }

        saveButton.disabled = true;
        saveButton.textContent = 'Đang xác thực...';

        const isValid = await pingCloudinary(cloudName, apiKey, apiSecret);
        saveButton.disabled = false; // Kích hoạt lại nút

        if (!isValid) {
            showMessage('Xác thực thất bại. Vui lòng kiểm tra lại thông tin.', true);
            saveButton.textContent = (editingIndex === -1) ? 'Thêm & Xác thực' : 'Cập nhật';
            return;
        }

        const newConfig = { cloudName, apiKey, apiSecret };

        if (editingIndex === -1) {
            // Thêm mới
            configs.push(newConfig);
            // Nếu đây là cấu hình đầu tiên, tự động kích hoạt nó
            if (configs.length === 1) {
                activeIndex = 0;
            }
        } else {
            // Cập nhật
            configs[editingIndex] = newConfig;
        }

        // Lưu lại và thông báo cho background
        chrome.storage.sync.set({ cloudinaryConfigs: configs, activeConfigIndex: activeIndex }, () => {
            if (chrome.runtime.lastError) {
                showMessage('Lỗi khi lưu cấu hình.', true);
                return;
            }
            showMessage('Lưu cấu hình thành công!', false);
            loadConfigs(); // Tải lại danh sách (đã bao gồm resetForm)
            notifyBackgroundOfChange(); // Thông báo cho background script
        });
    });

    // Xử lý các nút trong danh sách (kích hoạt, sửa, xóa)
    configListDiv.addEventListener('click', (e) => {
        const target = e.target; // Phần tử đã được nhấp
        
        // Kiểm tra xem có phải là nút không và có data-index không
        if (target.tagName !== 'BUTTON' || !target.dataset.index) {
            return; 
        }
        
        const index = parseInt(target.dataset.index, 10);

        if (target.classList.contains('btn-activate')) {
            // Kích hoạt
            activeIndex = index;
            chrome.storage.sync.set({ activeConfigIndex: activeIndex }, () => {
                showMessage(`Đã kích hoạt ${configs[index].cloudName}.`, false);
                loadConfigs(); // Tải lại
                notifyBackgroundOfChange(); // Thông báo
            });
        } else if (target.classList.contains('btn-edit')) {
            // Sửa
            const config = configs[index];
            cloudNameInput.value = config.cloudName;
            apiKeyInput.value = config.apiKey;
            apiSecretInput.value = config.apiSecret;
            editingIndex = index; // Đặt chỉ số chỉnh sửa
            saveButton.textContent = 'Cập nhật';
            window.scrollTo(0, 0); // Cuộn lên đầu trang
        } else if (target.classList.contains('btn-delete')) {
            // Xóa
            if (!confirm(`Bạn có chắc muốn xóa cấu hình ${configs[index].cloudName}?`)) {
                return;
            }
            
            configs.splice(index, 1); // Xóa khỏi mảng
            
            // Cập nhật lại activeIndex nếu cần
            if (index === activeIndex) {
                // Nếu xóa tài khoản đang active, chọn tài khoản đầu tiên (nếu có)
                activeIndex = (configs.length > 0) ? 0 : -1;
            } else if (index < activeIndex) {
                // Nếu xóa tài khoản ở trước tài khoản active, giảm chỉ số active
                activeIndex--;
            }

            chrome.storage.sync.set({ cloudinaryConfigs: configs, activeConfigIndex: activeIndex }, () => {
                showMessage('Đã xóa cấu hình.', false);
                loadConfigs(); // Tải lại
                notifyBackgroundOfChange(); // Thông báo
            });
        }
    });

    // Tải lần đầu khi mở popup
    loadConfigs();
});

