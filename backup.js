import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

public class BackupSystem {

    // ================================================================
    //  ⚙️ ĐỊNH CẤU HÌNH ĐƯỜNG DẪN TRÊN MÁY TÍNH CỦA BẠN
    // ================================================================
    // Tải file Google Sheets xuống dạng .csv rồi sửa đường dẫn ở đây:
    private static final String CSV_FILE_PATH = "G:\\My Drive\\Chu_ki\\Danh sách phản hồi.csv";
    private static final String OUTPUT_DIR    = "G:\\My Drive\\Chu_ki"; // Nơi trích xuất cây thư mục ID
    // ================================================================

    public static void main(String[] args) {
        System.out.println("====================================================");
        System.out.println("🚀 BẮT ĐẦU QUÉT HỆ THỐNG PHÂN LOẠI FILE TỰ ĐỘNG (JAVA)...");
        System.out.println("====================================================");

        File csvFile = new File(CSV_FILE_PATH);
        if (!csvFile.exists()) {
            System.out.println("❌ Không tìm thấy tệp dữ liệu CSV tại: " + CSV_FILE_PATH);
            System.out.println("💡 Mẹo: Trên Google Sheets, chọn File -> Download -> Comma Separated Values (.csv)");
            System.out.println("   Sau đó đổi tên file tải về trùng với đường dẫn cấu hình ở trên là được!");
            return;
        }

        try (BufferedReader br = new BufferedReader(
                new InputStreamReader(new FileInputStream(csvFile), StandardCharsets.UTF_8))) {
            
            String line;
            boolean isHeader = true;

            while ((line = br.readLine()) != null) {
                // Bỏ qua dòng tiêu đề đầu tiên của file Excel CSV
                if (isHeader) {
                    isHeader = false;
                    continue;
                }

                // Phân tách các cột bằng hàm phân tích CSV cơ bản
                List<String> columns = parseCSVLine(line);
                if (columns.size() < 8) {
                    continue; // Bỏ qua dòng lỗi hoặc thiếu cột
                }

                String timestamp = columns.get(0);
                String actionText = columns.get(1).trim();
                String recordId = safeIdString(columns.get(2));
                String name = columns.get(3);
                String uClass = columns.get(4);
                String bYear = columns.get(5);
                String bMonth = columns.get(6);
                String bDay = columns.get(7);

                if (recordId.isEmpty() || "0000".equals(recordId)) {
                    continue;
                }

                // Định nghĩa thư mục ID riêng biệt
                File idFolder = new File(OUTPUT_DIR, recordId);
                if (!idFolder.exists()) {
                    idFolder.mkdirs();
                }

                // Định dạng chuỗi ngày sinh hoàn chỉnh
                String birthday = padLeft(bDay, 2, '0') + "/" + padLeft(bMonth, 2, '0') + "/" + bYear;

                // Trích xuất dữ liệu Ghi chú và Ảnh chữ ký mã hóa từ cột Action
                String note = "Trống";
                String base64Image = "";
                if (actionText.contains("SAVE - Note:")) {
                    try {
                        String[] partsNote = actionText.split("SAVE - Note: ");
                        if (partsNote.length > 1) {
                            String[] partsSig = partsNote[1].split(" \\| Sig: ");
                            note = partsSig[0].isEmpty() ? "Trống" : partsSig[0];
                            if (partsSig.length > 1 && !partsSig[1].startsWith("...")) {
                                base64Image = partsSig[1];
                            }
                        }
                    } catch (Exception e) {
                        // Bỏ qua lỗi bóc tách nếu định dạng chuỗi bị biến đổi dữ liệu
                    }
                }

                // TRƯỜNG HỢP 1: YÊU CẦU XÓA HỒ SƠ (REMOVE)
                if (actionText.toUpperCase().contains("REMOVE")) {
                    File removeFile = new File(idFolder, "remove.txt");
                    if (!removeFile.exists()) {
                        String removeContent = "Hồ sơ ID " + recordId + " đã bị xóa trên hệ thống web.\nThời gian xóa: " + timestamp + "\n";
                        writeFile(removeFile, removeContent);
                        System.out.println("🗑️ [ID: " + recordId + "] -> Đã tạo tệp đánh dấu xóa (remove.txt)");
                    }
                    continue;
                }

                // TRƯỜNG HỢP 2: LƯU MỚI HOẶC CHỈNH SỬA HỒ SƠ
                File baseTxtFile = new File(idFolder, recordId + ".txt");
                String content = "=== THÔNG TIN HỒ SƠ ID: " + recordId + " ===\n"
                        + "Họ và Tên: " + name + "\n"
                        + "Ngày Sinh: " + birthday + "\n"
                        + "Đơn vị/Lớp: " + uClass + "\n"
                        + "Ghi Chú: " + note + "\n"
                        + "Cập nhật hệ thống: " + timestamp + "\n";

                // Tạo file gốc nếu chưa từng tồn tại
                if (!baseTxtFile.exists()) {
                    writeFile(baseTxtFile, content);
                    if (!base64Image.isEmpty()) {
                        saveSignatureImage(base64Image, new File(idFolder, recordId + ".jpeg"));
                    }
                    System.out.println("🆕 [ID: " + recordId + "] -> Đã khởi tạo hồ sơ gốc thành công!");
                } else {
                    // Nếu file gốc đã tồn tại, kiểm tra xem bản ghi này đã được xử lý chưa
                    String origContent = readFile(baseTxtFile);
                    if (origContent.contains("Cập nhật hệ thống: " + timestamp)) {
                        continue; // Bỏ qua vì trùng thời gian file gốc
                    }

                    // Quét số thứ tự các file fix đang có trong thư mục để tự động tăng tiến
                    int maxFixNum = 0;
                    File[] files = idFolder.listFiles();
                    if (files != null) {
                        for (File f : files) {
                            String fName = f.getName();
                            if (fName.endsWith(".txt") && fName.contains("fix")) {
                                try {
                                    String numStr = fName.substring(fName.indexOf("fix") + 3, fName.lastIndexOf(".txt"));
                                    int num = Integer.parseInt(numStr);
                                    if (num > maxFixNum) {
                                        maxFixNum = num;
                                    }
                                } catch (Exception e) {}
                            }
                        }
                    }

                    // Kiểm tra xem lịch sử sửa đổi này đã được ghi thành file fix trước đó chưa
                    boolean duplicateFix = false;
                    for (int i = 1; i <= maxFixNum; i++) {
                        File checkFile = new File(idFolder, recordId + " fix" + i + ".txt");
                        if (checkFile.exists() && readFile(checkFile).contains("Cập nhật hệ thống: " + timestamp)) {
                            duplicateFix = true;
                            break;
                        }
                    }
                    if (duplicateFix) {
                        continue;
                    }

                    // Tạo file fix tăng tiến (fix1, fix2, fix3...)
                    int nextFix = maxFixNum + 1;
                    File fixTxtFile = new File(idFolder, recordId + " fix" + nextFix + ".txt");
                    writeFile(fixTxtFile, content);
                    
                    if (!base64Image.isEmpty()) {
                        saveSignatureImage(base64Image, new File(idFolder, recordId + " fix" + nextFix + ".jpeg"));
                    }
                    System.out.println("🔧 [ID: " + recordId + "] -> Phát hiện dữ liệu thay đổi! Đã sinh file bóc tách: " + recordId + " fix" + nextFix + ".txt");
                }
            }

            System.out.println("\n====================================================");
            System.out.println("✅ HOÀN THÀNH QUY TRÌNH PHÂN LOẠI FILE CỤC BỘ!");
            System.out.println("====================================================");

        } catch (Exception e) {
            System.out.println("❌ Lỗi thực thi hệ thống: " + e.getMessage());
            e.printStackTrace();
        }
    }

    // --- CÁC HÀM TRỢ GIÚP TIỆN ÍCH THUẦN JAVA KHÔNG DÙNG THƯ VIỆN NGOÀI ---
    
    private static String safeIdString(String rawId) {
        String val = rawId.trim().split("\\.")[0];
        if (val.isEmpty()) return "";
        return padLeft(val, 4, '0');
    }

    private static String padLeft(String input, int length, char padChar) {
        StringBuilder sb = new StringBuilder(input.trim());
        while (sb.length() < length) {
            sb.insert(0, padChar);
        }
        return sb.toString();
    }

    private static void writeFile(File file, String content) throws Exception {
        try (FileOutputStream fos = new FileOutputStream(file)) {
            fos.write(content.getBytes(StandardCharsets.UTF_8));
        }
    }

    private static String readFile(File file) throws Exception {
        try (BufferedReader br = new BufferedReader(
                new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) {
                sb.append(line).append("\n");
            }
            return sb.toString();
        }
    }

    private static void saveSignatureImage(String base64Str, File destFile) {
        if (!base64Str.startsWith("data:image")) return;
        try {
            String encoded = base64Str.split(",")[1];
            byte[] imgData = Base64.getDecoder().decode(encoded);
            try (FileOutputStream fos = new FileOutputStream(destFile)) {
                fos.write(imgData);
            }
        } catch (Exception e) {
            System.out.println("   ⚠️ Lỗi giải mã chữ ký ảnh: " + e.getMessage());
        }
    }

    private static List<String> parseCSVLine(String line) {
        List<String> result = new ArrayList<>();
        StringBuilder curVal = new StringBuilder();
        boolean inQuotes = false;
        char[] chars = line.toCharArray();
        for (char c : chars) {
            if (inQuotes) {
                if (c == '"') inQuotes = false;
                else curVal.append(c);
            } else {
                if (c == '"') inQuotes = true;
                else if (c == ',') {
                    result.add(curVal.toString());
                    curVal.setLength(0);
                } else curVal.append(c);
            }
        }
        result.add(curVal.toString());
        return result;
    }
}