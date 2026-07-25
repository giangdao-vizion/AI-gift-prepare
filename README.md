# AI Luna Advisor

Ứng dụng web thuần **HTML / CSS / Vanilla JS** giúp khám phá nhu cầu cá nhân qua quiz chọn nhanh, rồi gợi ý hành động (1 ngày / 1 tuần / 1 tháng) và ý tưởng quà tặng.

## Chạy nhanh

Không cần build. Mở bằng static server (khuyến nghị vì `fetch` JSON):

```bash
# Python
python3 -m http.server 8080

# hoặc Node
npx --yes serve -l 8080
```

Truy cập `http://localhost:8080`.

Có thể đẩy nguyên thư mục lên Netlify / Cloudflare Pages / GitHub Pages / bất kỳ static hosting nào.

## Cấu trúc

```
index.html
css/styles.css
js/app.js
js/quiz.js
js/storage.js
data/questions.json
assets/
```

## Dữ liệu

- Câu trả lời lưu trong `localStorage` (key `ai-luna-advisor:v1`)
- Nút **Xuất dữ liệu JSON** tải về file phản hồi + tags + gợi ý để phân tích sau
- Bộ câu hỏi / nhánh theo khía cạnh sống nằm trong `data/questions.json` — chỉnh file này để refine quiz mà không đụng code

## Luồng người dùng

1. Chọn các khía cạnh cuộc sống đang quan tâm (multi)
2. Trả lời câu hỏi chi tiết theo từng khía cạnh đã chọn
3. Chọn phong cách nhận quà / ngân sách / mức bất ngờ
4. Xem tổng hợp nhu cầu + kế hoạch + gợi ý quà
