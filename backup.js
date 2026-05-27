/**
 * LNXNhat System — Core Backup Engine (v5.0 - CORS Fixed & Versioning)
 */
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwT5PnRJoDg4gMKMcKWIUu3JS0cLus-DR33zk2sB6-L743BTWVu-fMxgUMs9IylUwnW/exec";

window.localDatabase = [];
window.rawDatabase = [];
window.tagsDatabase = [];

// 1. Tạo ID ngẫu nhiên (5 ký tự cho User, 3 ký tự cho Tag)
function generateID(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    let isDuplicate = true;
    
    while (isDuplicate) {
        result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        if (length === 5) {
            isDuplicate = window.rawDatabase.some(r => r.id === result);
        } else if (length === 3) {
            isDuplicate = window.tagsDatabase.some(t => t.tagId === result);
        } else {
            isDuplicate = false;
        }
    }
    return result;
}

// 2. Khởi tạo dữ liệu từ Local
function initBackupSystem() {
    try {
        const savedData = localStorage.getItem('lnxnhat_db_backup');
        const savedTags = localStorage.getItem('lnxnhat_tags_backup');
        const savedRaw = localStorage.getItem('lnxnhat_raw_backup');
        if (savedData) window.localDatabase = JSON.parse(savedData);
        if (savedTags) window.tagsDatabase = JSON.parse(savedTags);
        if (savedRaw) window.rawDatabase = JSON.parse(savedRaw);
    } catch (e) {
        console.error("Lỗi khởi tạo LocalStorage:", e);
    }
    syncFromDrive();
}

// 3. Thuật toán Lọc Versioning (Lấy fix cao nhất, loại bỏ remove)
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
            if (status.includes("remove")) {
                isRemoved = true; 
            } else if (status.startsWith("fix")) {
                const fixNum = parseInt(status.replace("fix", "")) || 0;
                if (fixNum > maxFix) {
                    maxFix = fixNum;
                    latestRow = r;
                }
            } else {
                if (maxFix === -1) {
                    maxFix = 0;
                    latestRow = r;
                }
            }
        });

        if (!isRemoved && latestRow) {
            activeRecords.push(latestRow);
        }
    }
    return activeRecords;
}

// 4. Đồng bộ từ Sheets về
async function syncFromDrive() {
    if (!WEB_APP_URL || WEB_APP_URL.includes("ĐIỀN_URL")) return;
    try {
        const res = await fetch(WEB_APP_URL + "?action=getData");
        const data = await res.json();
        
        window.rawDatabase = data.records.slice(1).map(r => ({
            id: r[0], name: r[1], class: r[2], birth: r[3], note: r[4], sig: r[5], status: r[6] || "", relId: r[7] || ""
        }));
        window.tagsDatabase = data.tags.slice(1).map(r => ({
            tagName: r[0], tagId: r[1], tagColor: r[2]
        }));

        window.localDatabase = processRawData(window.rawDatabase);

        localStorage.setItem('lnxnhat_db_backup', JSON.stringify(window.localDatabase));
        localStorage.setItem('lnxnhat_tags_backup', JSON.stringify(window.tagsDatabase));
        localStorage.setItem('lnxnhat_raw_backup', JSON.stringify(window.rawDatabase));

        if (typeof window.refreshUI === 'function') window.refreshUI();
    } catch (e) {
        console.error("Offline Mode - Dùng dữ liệu đệm cũ.", e);
    }
}

// 5. Gửi dữ liệu lên Sheets (ĐÃ FIX CORS Ở ĐÂY)
async function sendToDrive(payloadToSend) {
    // Đẩy ngay vào Local để UI phản hồi tức thì
    if (payloadToSend.action === "ADD_RECORD") {
         window.rawDatabase.push(payloadToSend);
         window.localDatabase = processRawData(window.rawDatabase);
    } else if (payloadToSend.action === "ADD_TAG") {
         window.tagsDatabase.push(payloadToSend);
    }
    if (typeof window.refreshUI === 'function') window.refreshUI();

    try {
        await fetch(WEB_APP_URL, {
            method: "POST",
            headers: {
                // BẮT BUỘC PHẢI LÀ TEXT/PLAIN ĐỂ VƯỢT QUA CORS CỦA GOOGLE
                "Content-Type": "text/plain;charset=utf-8" 
            },
            body: JSON.stringify(payloadToSend)
        });
        // Sau khi gửi xong, tải lại dữ liệu mới nhất
        setTimeout(syncFromDrive, 1500); 
    } catch (e) {
        console.error("Lỗi Sync Drive:", e);
    }
}

initBackupSystem();
