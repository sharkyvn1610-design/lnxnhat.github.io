// DÁN LINK WEB APP MỚI CỦA BẠN VÀO ĐÂY
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbyC.../exec"; 

window.localDatabase = [];
window.rawDatabase = [];
window.tagsDatabase = [];

function generateID(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    let isDuplicate = true;
    while (isDuplicate) {
        result = '';
        for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
        if (length === 5) isDuplicate = window.rawDatabase.some(r => r.id === result);
        else if (length === 3) isDuplicate = window.tagsDatabase.some(t => t.tagId === result);
        else isDuplicate = false;
    }
    return result;
}

function processRawData(rawRecords) {
    const grouped = {};
    rawRecords.forEach(row => {
        if (!grouped[row.id]) grouped[row.id] = [];
        grouped[row.id].push(row);
    });

    const activeRecords = [];
    for (const id in grouped) {
        const rows = grouped[id];
        let isRemoved = false;
        let maxFix = -1;
        let latestRow = null;

        rows.forEach(r => {
            const status = (r.status || "").toString();
            if (status.includes("remove")) isRemoved = true; 
            else if (status.startsWith("fix")) {
                const fixNum = parseInt(status.replace("fix", "")) || 0;
                if (fixNum > maxFix) { maxFix = fixNum; latestRow = r; }
            } else {
                if (maxFix === -1) { maxFix = 0; latestRow = r; }
            }
        });

        if (!isRemoved && latestRow) activeRecords.push(latestRow);
    }
    return activeRecords;
}

function initBackupSystem() {
    try {
        const savedData = localStorage.getItem('lnxnhat_db_backup');
        const savedTags = localStorage.getItem('lnxnhat_tags_backup');
        const savedRaw = localStorage.getItem('lnxnhat_raw_backup');
        if (savedData) window.localDatabase = JSON.parse(savedData);
        if (savedTags) window.tagsDatabase = JSON.parse(savedTags);
        if (savedRaw) window.rawDatabase = JSON.parse(savedRaw);
    } catch (e) { console.error("Lỗi khởi tạo LocalStorage:", e); }
    
    syncFromDrive();
}

async function syncFromDrive() {
    if (!WEB_APP_URL || WEB_APP_URL.includes("ĐIỀN_LINK")) return;
    try {
        console.log("Đang tải dữ liệu từ Google Sheets...");
        const res = await fetch(WEB_APP_URL); // Gọi GET request
        const data = await res.json();
        
        if (data.success) {
            // Cắt dòng tiêu đề (slice(1)) nếu có
            window.rawDatabase = data.records.length > 1 ? data.records.slice(1).map(r => ({
                id: r[0], name: r[1], class: r[2], birth: r[3], note: r[4], sig: r[5], status: r[6] || "", relId: r[7] || ""
            })) : [];
            
            window.tagsDatabase = data.tags.length > 1 ? data.tags.slice(1).map(r => ({
                tagName: r[0], tagId: r[1], tagColor: r[2]
            })) : [];

            window.localDatabase = processRawData(window.rawDatabase);

            localStorage.setItem('lnxnhat_db_backup', JSON.stringify(window.localDatabase));
            localStorage.setItem('lnxnhat_tags_backup', JSON.stringify(window.tagsDatabase));
            localStorage.setItem('lnxnhat_raw_backup', JSON.stringify(window.rawDatabase));
            
            console.log("Đã đồng bộ dữ liệu thành công!");
            if (typeof window.refreshUI === 'function') window.refreshUI();
        } else {
            console.error("Lỗi từ server:", data.error);
        }
    } catch (e) {
        console.error("Offline Mode - Dùng dữ liệu đệm cũ.", e);
    }
}

async function sendToDrive(payloadToSend) {
    console.log("Đang gửi dữ liệu...", payloadToSend);
    
    // Cập nhật giao diện nội bộ ngay lập tức để người dùng không phải đợi
    if (payloadToSend.action === "ADD_RECORD") {
         window.rawDatabase.push(payloadToSend);
         window.localDatabase = processRawData(window.rawDatabase);
    } else if (payloadToSend.action === "ADD_TAG") {
         window.tagsDatabase.push(payloadToSend);
    }
    if (typeof window.refreshUI === 'function') window.refreshUI();

    try {
        const response = await fetch(WEB_APP_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" }, // Vượt CORS
            body: JSON.stringify(payloadToSend)
        });
        const result = await response.json();
        console.log("Kết quả từ máy chủ:", result);
        
        // Gọi sync lại sau 2 giây để đảm bảo lấy đúng link ảnh từ Drive về
        setTimeout(syncFromDrive, 2000); 
    } catch (e) {
        console.error("Lỗi Sync Drive:", e);
    }
}

initBackupSystem();
