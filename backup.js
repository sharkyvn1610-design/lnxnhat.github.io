const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbyjd4ci8C3Zlv_3cmolB-yqgqcHgJtowYB9p4Xdr1DSalPtpg_RKfQObVuQhtDRjzAy/exec";

window.localDatabase = [];
window.rawDatabase = [];
window.tagsDatabase = [];

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
    
    // Gọi hàm đồng bộ từ Drive
    syncFromDrive();
}

async function syncFromDrive() {
    if (!WEB_APP_URL) return;
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

        // LỖI PAYLOAD NẰM Ở ĐÂY (Dòng 111 trong console của bạn)
        console.log(payload); 

        if (typeof window.refreshUI === 'function') window.refreshUI();
    } catch (e) {
        console.error("Offline Mode - Dùng dữ liệu đệm cũ.", e);
    }
}

async function sendToDrive(payloadToSend) {
    if (payloadToSend.action === "ADD_RECORD") {
         window.rawDatabase.push(payloadToSend);
         window.localDatabase = processRawData(window.rawDatabase);
    } else if (payloadToSend.action === "ADD_TAG") {
         window.tagsDatabase.push(payloadToSend);
    }
    if (typeof window.refreshUI === 'function') window.refreshUI();

    try {
        // LỖI CORS NẰM Ở ĐÂY (Thiếu mode: 'no-cors' và dùng sai Content-Type)
        await fetch(WEB_APP_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json" 
            },
            body: JSON.stringify(payloadToSend)
        });
        setTimeout(syncFromDrive, 1500); 
    } catch (e) {
        console.error("Lỗi Sync Drive:", e);
    }
}

// Khởi động hệ thống
initBackupSystem();
