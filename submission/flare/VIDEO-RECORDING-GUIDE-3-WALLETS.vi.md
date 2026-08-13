# Hướng dẫn quay FlareQuorum với 3 ví

Tài liệu này chỉ hướng dẫn quay hình. Không cần quay một mạch và chưa cần thu
giọng nói. Mục tiêu là có một bản demo gọn khoảng `6–8 phút`, dùng đúng ba ví
Coston2 và không để lộ bid.

## 1. Ba ví và một tender

Chuẩn bị đúng ba ví testnet:

- **Ví A — Buyer:** tạo và cấp vốn cho tender.
- **Ví B — Vendor 1:** gửi bid kín.
- **Ví C — Vendor 2:** gửi bid kín và có thể là winner.

Cả ba ví cần C2FLR để trả gas. Ví A cần thêm FTestXRP để escrow. Chuyển sẵn cả
ba ví sang Coston2, chain ID `114`.

Luồng quay chính dùng **direct FTestXRP**. Không cần tạo thêm ví XRPL. Phần
XRPL/FDC/Smart Account được trình bày bằng hồ sơ public Gate G đã có và phải nói
rõ đó là lifecycle đã ghi nhận trước, không phải giao dịch vừa tạo trong video.

Tender demo nên có:

- hai approved vendor là ví B và ví C;
- deadline cách thời điểm tạo khoảng `5–10 phút`;
- currency XRP; có thể bật USD nếu muốn quay FTSO snapshot;
- credential requirement để trống;
- budget nhỏ, chỉ dùng tài sản testnet.

## 2. Chuẩn bị quay

- Mở <https://flare-quorum.vercel.app> bằng Chrome profile sạch.
- Quay `1920 × 1080`, `30 fps`, browser zoom `90%` hoặc `100%`.
- Tắt notification, bookmark bar, email, Telegram và clipboard manager.
- Chỉ quay cửa sổ trình duyệt và popup ví, không quay toàn desktop.
- Tạo hai scene OBS:
  - `FULL WEB`: cửa sổ browser bình thường;
  - `PRIVATE MASK`: cùng cửa sổ nhưng có hộp đen che toàn bộ vùng nhập bid.
- Giữ hình đứng yên khoảng hai giây trước và sau mỗi thao tác để dễ dựng.

Ngay trước khi quay, chạy:

```bash
pnpm flare:v2:machines:preflight
pnpm test:flare:production https://flare-quorum.vercel.app
pnpm evidence:validate
pnpm flare:judge:check
```

Chỉ quay khi ba TEE đúng identity/URL, đang `PRODUCTION` và availability còn
fresh. Nếu dependency lỗi, dừng clip và xử lý; không dùng mock hoặc dựng trạng
thái thành công giả.

## 3. Quy tắc không lộ dữ liệu

Không để bất kỳ frame nào chứa:

- seed phrase, private key, XRPL secret hoặc file `.env`;
- raw wallet signature, credential hoặc proxy/API key;
- giá bid, delivery, warranty, salt, plaintext hoặc ciphertext;
- notification, email hoặc dữ liệu cá nhân.

Địa chỉ testnet, tender ID, transaction hash, block, commitment, receipt bitmap,
TEE identity, result digest, winner và winning amount là dữ liệu public có thể
quay.

Khi gửi bid:

1. Quay form trống để người xem thấy loại field và cảnh báo không lưu dữ liệu.
2. Dừng quay và nhập bid test ngoài camera.
3. Bật scene `PRIVATE MASK` trước khi quay lại.
4. Quay nút encrypt/submit và tiến trình nhận đủ ba TEE receipt.
5. Chỉ tắt mask sau khi UI chuyển sang phần public `MY SUBMISSIONS`.

Không dựa vào blur khi dựng; mask ngay lúc capture để không sót một frame.

## 4. Danh sách clip

Quay từng clip riêng theo thứ tự:

```text
01-landing-public.mp4
02-buyer-create.mp4
03-vendor-b-submit.mp4
04-vendor-c-submit.mp4
05-close-and-fcc.mp4
06-award-auditor.mp4
07-xrp-public-evidence.mp4
08-limitations-ending.mp4
```

Nếu quay lỗi, tạo file `-take2`; không ghi đè footage cũ trước khi kiểm tra bản
mới.

## 5. Shot list 6–8 phút

### Clip 01 — Landing và Public (`30–40 giây`)

1. Giữ hero khoảng ba giây.
2. Mở `TENDERS`, vào một dossier V2 đã Awarded.
3. Quay các nhãn Coston2, market V2, `SIMULATED TEE`, rules hash, bid root và
   `2-of-3` result.
4. Chỉ ra rằng winner và winning amount public, còn losing bids không xuất hiện.

### Clip 02 — Ví A tạo tender (`60–90 giây`)

1. Mở `BUYER`, chọn direct `COSTON2 / FTESTXRP`.
2. Kết nối ví A và kiểm tra Coston2.
3. Điền Buyer Brief bằng đúng bộ dữ liệu mẫu bên dưới.
4. Quay phần review public rules và ba TEE identities.
5. Bấm approve rồi create tender; xác nhận đúng từng popup ví.
6. Khi hoàn tất, giữ tender ID và trạng thái `OPEN` khoảng ba giây.

#### Dữ liệu nhập sẵn cho Clip 02

Ví Buyer là ví đang kết nối. Hai địa chỉ dưới đây là hai approved vendor:

```text
Approved vendor 1
0xA2aD117d3A0DA89A94a43f305DF638E2cA36A38e

Approved vendor 2
0x5f04Ec71ef0027D475Ee9dd329437CE90B50fbEA
```

Nhập các field còn lại như sau:

| Field | Giá trị |
|---|---|
| Public title | `FlareQuorum Demo Website` |
| Category | `Software` |
| Escrow ceiling | `1` FTestXRP |
| Bid deadline | `30` phút |
| Public objective | `Build a responsive public website for a Coston2 treasury procurement demo.` |
| Acceptance criteria | `Deliver a working responsive website, source code, setup instructions, and a short handover document.` |
| Optional vendor questions | `What is your delivery plan and what warranty support is included?` |
| Price weight | `60` |
| Delivery weight | `25` |
| Warranty weight | `15` |

Sau khi dán vendor 1, bấm `+ Add vendor` rồi dán vendor 2. Kiểm tra UI hiển thị
`2/8` vendor và `Total weight: 100% ✓` trước khi tiếp tục. Deadline 30 phút vẫn
có thể close sớm ngay khi cả hai approved vendor đã submit thành công.

Nếu ví Buyer có ít hơn `1` FTestXRP, giảm `Escrow ceiling` xuống một số dương
mà ví đủ balance, tối đa sáu chữ số thập phân. Khi đó dùng chính ceiling mới
làm giới hạn cho bid demo; không thay đổi ceiling sau khi tender đã mở.

Nếu UI yêu cầu hai transaction approval/create, giữ cả hai trong footage; không
mô tả thành một transaction.

### Clip 03 — Ví B gửi bid (`45–60 giây`)

1. Đổi sang ví B và mở `PRIVATE BIDS`.
2. Quay eligibility, public Buyer Brief và form trống.
3. Dừng quay, nhập bid test, bật `PRIVATE MASK`, rồi quay tiếp.
4. Submit và giữ tiến trình đủ ba receipt.
5. Tắt mask tại `MY SUBMISSIONS`; quay commitment, bitmap `0x07` và bid ID.

### Clip 04 — Ví C gửi bid (`45–60 giây`)

Lặp lại Clip 03 bằng ví C với một bid test khác. Không để tên profile hoặc ghi
chú bên ngoài tiết lộ giá của hai vendor.

Sau khi submit, quay Public dossier để thấy `2` accepted bids nhưng không có giá
thua cuộc hoặc ciphertext.

### Clip 05 — Close và FCC (`60–90 giây`)

1. Vì hai approved vendor đã submit, mở `ACTIVITY`; không cần chờ hết deadline.
2. Bấm `CLOSE & FREEZE FTSO` và xác nhận giao dịch ví.
3. Khi card chuyển sang `Ready to start FCC`, bấm `START FCC COMPUTE` và xác
   nhận giao dịch thứ hai. Giao dịch này trả public FCC instruction fee.
4. Chờ khoảng `10–30 giây`, rồi bấm `CHECK 2/3 & FINALIZE`.
5. Nếu UI báo quorum chưa sẵn sàng, chờ thêm vài giây rồi bấm lại. Đây là trạng
   thái chờ thật; không dùng sample result.
6. Khi UI báo hai chữ ký FCC khớp nhau, xác nhận giao dịch finalize trong ví.
7. Quay trạng thái `AWARDED`, hai matching TEE signers và result digest.

Browser không tính winner và không giải mã bid. Ingress hiện có chỉ gom hai kết
quả FCC công khai có bytes giống hệt nhau; contract kiểm tra lại toàn bộ domain
và chữ ký trước khi settlement. Luồng này không cần lifecycle relay chạy liên
tục trên Railway.

### Clip 06 — Award và Auditor (`60 giây`)

1. Mở award dossier và quay winner, public payout, buyer remainder và receipt.
2. Mở `AUDITOR` không cần ví.
3. Quay rules hash, root, `0x07` receipt custody, ba frozen machines, hai result
   signers và settlement conservation.
4. Nhắc bằng hình ảnh rằng Auditor không có decrypt, spend hay winner override.

### Clip 07 — XRP interoperability bằng chứng public (`30–45 giây`)

1. Mở hồ sơ public Gate G trong app hoặc submission package.
2. Quay XRPL transaction ID, FDC proof/request, PersonalAccount, Smart Account
   nonce, direct mint và tender funding transaction.
3. Nếu có award phù hợp, mở phần FAssets redemption request.

Đây là **evidence của lifecycle đã chạy trước**. Không nói ba ví hiện tại vừa
thực hiện XRPL funding hoặc XRP redemption. Redemption request cũng không phải
XRP payout tức thời.

### Clip 08 — Giới hạn và ending (`20–30 giây`)

Giữ một frame sạch có các nhãn:

- Coston2 testnet;
- simulated TEE;
- unaudited hackathon software;
- winning amount public;
- losing bids private;
- user validation chưa hoàn tất.

Kết bằng Public hoặc Auditor dossier, không kết ở popup ví hay màn hình pending.

## 6. Checklist sau khi quay

- [ ] Chỉ dùng ba ví A/B/C và không lộ secret.
- [ ] Buyer tạo tender với đúng hai approved vendor.
- [ ] Hai vendor đều nhận đủ ba receipt; bitmap public là `0x07`.
- [ ] Không frame nào chứa bid value, credential, plaintext hoặc ciphertext.
- [ ] Close/FCC/finalize đến từ canonical state, không có mock winner.
- [ ] Đã quay đủ ba thao tác Activity: Close, Start FCC Compute và Finalize.
- [ ] Hai TEE signer khớp cùng result digest.
- [ ] Payout, remainder và award receipt xuất hiện rõ.
- [ ] Gate G được gọi đúng là public evidence đã ghi nhận.
- [ ] Coston2, simulated TEE, testnet và unaudited boundary xuất hiện rõ.
- [ ] Có ít nhất ba giây hình sạch ở đầu và cuối.

Giữ nguyên raw footage. Chỉ dựng trên bản sao; sau khi khóa bản dựng hình mới
viết voiceover và caption theo đúng giao dịch thực tế đã quay.
