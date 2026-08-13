# Hướng dẫn quay video FlareQuorum V2 — quay hình trước, lồng tiếng sau

Tài liệu này hướng dẫn quay một bản demo dài, bao quát toàn bộ chức năng hiện
có của FlareQuorum V2. Không cần cố quay một lần liên tục. Cách an toàn và dễ
dựng nhất là quay thành các clip ngắn, giữ nguyên một bộ tender/address công
khai xuyên suốt, sau đó mới ghép hình và viết lời thoại theo thời lượng thật.

Mục tiêu đề xuất:

- bản dựng chính dài khoảng `22–30 phút`;
- raw footage khoảng `35–50 phút`;
- `16` chương hình ảnh, chưa có lời thoại;
- một luồng chính: XRP → FDC → Smart Account → tender → 3 vendor → FCC → award
  → redemption;
- một luồng phụ: direct FTestXRP → tạo tender trống → cancel;
- hai hồ sơ có sẵn để giải thích refund và recovery mà không phá luồng chính.

## 1. Quy tắc an toàn bắt buộc

Video cuối là tài liệu công khai. Không để bất kỳ khung hình nào chứa:

- seed, private key, recovery phrase, XRPL secret;
- chữ ký ví dạng raw, signed transaction blob hoặc credential;
- giá, delivery, warranty, credential, salt hoặc ciphertext của bid;
- proxy/indexer/FDC credential, request header hoặc file `.env`;
- log body của private ingress hoặc sealed TEE state;
- thông báo, email, bookmark hoặc lịch sử trình duyệt có dữ liệu cá nhân.

Địa chỉ ví, transaction hash, tender ID, block, commitment, receipt bitmap,
machine identity, result digest, winner và winning amount là dữ liệu công khai
có thể quay.

### Cách quay cảnh submit bid mà không lộ bid

1. Quay form đang trống để thấy loại trường và cảnh báo `NOT SAVED`.
2. Dừng quay.
3. Nhập bid test ở ngoài camera.
4. Bật một privacy mask cố định trong OBS che toàn bộ vùng private values.
5. Quay thao tác `ENCRYPT & SUBMIT BID` và tiến trình nhận ba receipt.
6. Sau confirmation, bỏ mask và quay `MY SUBMISSIONS`, vì phần này chỉ còn dữ
   liệu công khai.

Không dựa vào việc “sẽ blur sau”. Mask ngay lúc capture giúp tránh một frame bị
bỏ sót trong bản dựng.

## 2. Chuẩn bị trước ngày quay

### 2.1. Thiết bị và capture

- Chrome profile sạch, không bookmark bar và không extension không liên quan.
- Độ phân giải `1920×1080`, browser zoom `100%`, quay `30 fps` là đủ.
- Con trỏ chuột bình thường, không hiệu ứng click quá mạnh.
- Tắt notification của hệ điều hành, Telegram, email và clipboard manager.
- OBS có hai scene:
  - `FULL WEB`: toàn bộ cửa sổ browser;
  - `PRIVATE MASK`: cùng browser nhưng có hộp đen che vùng private bid.
- Không thu microphone ở giai đoạn này; chỉ giữ system audio nếu cần tiếng xác
  nhận của ví. Tốt nhất quay im lặng hoàn toàn.

### 2.2. Tài khoản test cần chuẩn bị

- một buyer Coston2 có test C2FLR và FTestXRP;
- ba vendor Coston2 disposable đã được buyer approve;
- winner wallet giữ award để quay Assets/Redemption;
- một XRPL Testnet classic address do buyer kiểm soát;
- GemWallet Testnet nếu muốn quay browser-native XRP Payment;
- executor/funding runner đã cấu hình ở máy vận hành, nhưng không mở `.env` khi
  quay.

Nên dùng ba browser profile hoặc ba cửa sổ profile riêng cho ba vendor. Đặt tên
profile là `VENDOR A`, `VENDOR B`, `VENDOR C`; không đặt tên chứa giá bid.

### 2.3. Hai tender dùng trong video

#### Tender A — flagship XRP, ba vendor

Tender này là câu chuyện chính và cần đi đến `AWARDED`:

- funding: XRPL Payment → FDC proof → Smart Account → FTestXRP escrow;
- ba approved vendor;
- deadline ngắn nhưng hợp lệ, thường `5–10 phút`;
- cả ba vendor submit ngoài phần hình chứa giá;
- Activity đóng tender và freeze FTSO snapshot;
- relay thu kết quả FCC và finalizes bằng `2-of-3` matching result;
- winner mở Assets/Redemption.

#### Tender B — direct FTestXRP, không bid

Tender này chỉ dùng để quay:

- funding method picker;
- public Buyer Brief;
- `APPROVE & OPEN TENDER`;
- transaction confirmation;
- buyer cancel empty tender trong Activity.

Không dùng Tender B để kể câu chuyện winner.

### 2.4. Hồ sơ V2 có sẵn để quay nhánh khó

Không cần cố tình làm hỏng Tender A. Có thể dùng các hồ sơ public đã ghi nhận:

- Tender `2`: refund vì `UndispatchedTimeout`;
- Tender `5`: refund vì `SelectionExpired`;
- Tender `6`: V2 multi-vendor success;
- Tender `7`: một result endpoint unavailable nhưng hai máy còn lại finalize;
- Tender `17`: XRP/FDC/Smart Account funding evidence;
- Tender `22`: independent three-machine ingress benchmark.

Trước khi quay, kiểm tra ID vẫn đọc được từ current V2 market và ghi ID thực tế
vào shot sheet bên dưới. Không dùng tender V1 hoặc Sepolia làm bằng chứng V2.

### 2.5. Preflight ngay trước khi quay

Chạy bằng Node 24 và chỉ quay khi các check cần thiết pass:

```bash
pnpm flare:v2:machines:preflight
pnpm flare:relay:health
pnpm flare:funding:health
pnpm test:flare:production https://flare-quorum.vercel.app
pnpm test:flare:accessibility https://flare-quorum.vercel.app
pnpm test:flare:xrp:draft https://flare-quorum.vercel.app
pnpm test:flare:xrp:checkpoint https://flare-quorum.vercel.app
pnpm evidence:validate
pnpm flare:judge:check
```

Điểm quan trọng nhất là ba machine phải vẫn `PRODUCTION`, đúng identity/URL và
availability dưới 6 giờ. Status `2` một mình chưa đủ. Nếu preflight không pass,
hoãn cảnh live write; không dùng mock hoặc giả trạng thái thành công.

## 3. Quy tắc quay từng clip

Mỗi clip thực hiện giống nhau:

1. Giữ yên màn hình `2 giây` trước thao tác đầu tiên.
2. Di chuyển chuột có chủ đích; chỉ click một mục tại một thời điểm.
3. Sau mỗi transaction hoặc state change, giữ yên `4–6 giây`.
4. Scroll vừa phải; dừng `2–3 giây` tại tiêu đề và bằng chứng quan trọng.
5. Nếu phải chờ blockchain, kết thúc clip. Quay clip mới sau khi state đã đổi.
6. Không refresh liên tục trước camera.
7. Không mở DevTools, terminal chứa environment hoặc private network payload.

Tên file đề xuất:

```text
00-title.mp4
01-landing.mp4
02-public-list.mp4
03-public-dossier.mp4
04-buyer-direct-create.mp4
05-buyer-direct-cancel.mp4
06-xrp-payment-draft.mp4
07-xrp-funding-result.mp4
08-vendor-eligibility.mp4
09-vendor-submit-masked.mp4
10-my-submissions.mp4
11-activity-close.mp4
12-award-public.mp4
13-auditor.mp4
14-redemption.mp4
15-recovery-docs-close.mp4
```

## 4. Storyboard quay hình đầy đủ

Thời lượng dưới đây là gợi ý cho bản dựng, không phải giới hạn.

### Chương 00 — Title card và vấn đề (`0:00–0:20`)

Quay:

- landing hero `Private bids. Public awards.`;
- giữ khung hình đủ lâu để sau này đặt title/subtitle;
- không di chuột trong 5 giây đầu.

Phải thấy:

- `CONFIDENTIAL PROCUREMENT / FLARE COSTON2`;
- `V2 · COSTON2 TESTNET · 3 SIMULATED TEES · 2-OF-3 RESULT · UNAUDITED`.

### Chương 01 — Landing và toàn bộ value proposition (`0:20–1:50`)

Quay một lượt scroll chậm qua:

1. hero và hai CTA `EXPLORE LIVE TENDERS`, `VIEW LIVE EVIDENCE`;
2. lifecycle marquee: XRP/FDC, escrow, FCC bids, FTSO, award;
3. năm checkpoint;
4. verified V2 release facts và link market;
5. năm workspace;
6. Public / Private / Never Collected;
7. mở lần lượt 2–3 FAQ quan trọng;
8. CTA cuối và footer.

Không cần mở cả sáu FAQ trong bản dựng; các câu còn lại có thể xuất hiện ở một
wide shot.

### Chương 02 — App shell và Public tender list (`1:50–3:20`)

Từ landing, click `EXPLORE LIVE TENDERS`.

Quay:

- header Coston2 và `CONNECT FOR ACTIONS`;
- năm workspace: Public, Buyer, Private Bids, Activity, Auditor;
- sidebar ở trạng thái `Wallet optional`;
- search tender;
- filter status;
- sort;
- pagination nếu danh sách có nhiều hơn năm tender;
- chọn Tender A hoặc một awarded tender nổi bật.

Phải làm rõ bằng hình rằng Public không yêu cầu wallet và chỉ đọc canonical
Coston2 state.

### Chương 03 — Public dossier đầy đủ (`3:20–5:30`)

Trong tender được chọn, quay từ trên xuống dưới:

1. public Buyer Brief và trạng thái hash verification;
2. buyer, approved vendors, ceiling, deadline, scoring weights và bounds;
3. lifecycle trạng thái Open/Closed/Awarded;
4. `FCC-bound procurement evidence`;
5. public checkpoint/private losing bids panel;
6. expand `Inspect protocol deployment facts`;
7. extension `66142`, code version, selection attempt/request ID;
8. expand fixed TEE policy và ba machine fingerprints;
9. public accepted commitments/receipt bitmaps;
10. nếu awarded: winner, winning FTestXRP amount, payout, remainder và award
    receipt;
11. mở Coston2 Explorer từ award contract hoặc transaction link.

Đừng đọc các hash bằng mắt quá lâu. Chỉ giữ 3–4 giây để người xem nhận ra chúng
có thể copy/verify.

### Chương 04 — Buyer direct FTestXRP (`5:30–8:00`)

Connect buyer disposable wallet trên Coston2, vào `BUYER`.

Quay:

1. funding method picker;
2. chọn `COSTON2 / FTESTXRP`;
3. public fields: title, category, ceiling, deadline, objective, acceptance
   criteria, optional vendor questions;
4. add/remove approved vendor;
5. scoring weights và validation tổng `100%`;
6. currency/delivery/warranty bounds;
7. hover dấu `?` ở một vài nhóm field để cho thấy help exists;
8. wallet checkpoint;
9. click `APPROVE & OPEN TENDER`;
10. wallet approval/transaction confirmation;
11. trạng thái `Tender #… created` và explorer link;
12. mở Public để thấy brief tự động hiển thị và hash đã verify.

Nội dung Buyer Brief là public nên có thể quay. Tuy nhiên vẫn dùng nội dung test
không chứa thông tin doanh nghiệp hoặc cá nhân thật.

### Chương 05 — Cancel empty tender (`8:00–8:50`)

Vào `ACTIVITY`, chọn Tender B vừa tạo và chưa có bid.

Quay:

- action card giải thích ai được hành động;
- `CANCEL EMPTY TENDER`;
- confirmation panel;
- `KEEP TENDER` để chứng minh có đường quay lại, sau đó mở confirmation lần nữa;
- confirm cancel;
- refresh và xem trạng thái terminal trong Public.

Đây là nơi giải thích sau này rằng destructive action không diễn ra bằng một
click mơ hồ.

### Chương 06 — Buyer XRP-native funding (`8:50–12:30`)

Quay từ một public brief mới dành cho Tender A:

1. chọn `XRPL / XRP · ADVANCED`;
2. hero `XRPL → FDC → SMART ACCOUNT`;
3. journey map;
4. điền public tender rules;
5. `Review the XRP payment`;
6. XRPL owner public classic address;
7. wallet ID và official executor fee;
8. click prepare/review để thấy exact destination, amount, fee, PersonalAccount,
   nonce và `0xFE` memo;
9. mở `ADVANCED FUNDING DETAILS`;
10. cho thấy wallet-ready Payment JSON và public executor job JSON nhưng không
    zoom vào raw blob quá lâu;
11. click `COPY EXECUTOR HANDOFF`;
12. nếu dùng GemWallet: mở confirmation, xác nhận `Testnet`, destination và
    amount, rồi submit;
13. quay public XRPL transaction ID sau khi mined;
14. quay trạng thái `Executor handoff ready — tender not opened yet` trước khi
    executor hoàn tất;
15. dừng recording trong khi executor/FDC xử lý;
16. quay clip mới khi direct mint + user operation + `TenderCreated` đã cùng
    được xác nhận;
17. mở Tender A trong Public và đối chiếu buyer/brief/escrow.

Nếu delayed mint xuất hiện, quay đúng pending checkpoint và `RESTORE PAYMENT
HANDOFF`; tuyệt đối không gửi lại XRP payment. Chỉ ghi success sau khi
`TenderCreated` tồn tại.

Nếu không muốn thực hiện một Payment mới trong ngày quay, dùng Tender `17` và
Gate G public evidence để chứng minh lifecycle đã chạy thật. Phải nói rõ đây là
recorded live evidence, không diễn lại thành một giao dịch mới.

### Chương 07 — Vendor eligibility và public context (`12:30–14:00`)

Mở `PRIVATE BIDS` với một wallet chưa connect trước, sau đó connect Vendor A.

Quay:

1. trạng thái disconnected và lý do cần wallet;
2. danh sách open tender;
3. hệ thống ưu tiên tender mà wallet là approved vendor;
4. một tender `PUBLIC VIEW`/không eligible nếu có;
5. Tender A tự động hiện Buyer Brief đã hash-verify;
6. public ceiling, deadline, weights, delivery/warranty bounds;
7. extension/code và ba machine fingerprints;
8. cảnh báo private fields chỉ tồn tại trong session.

Không nhập giá trong clip này.

### Chương 08 — Submit ba sealed bids (`14:00–16:40`)

Với mỗi vendor, quay riêng. Vendor A là clip chi tiết; B và C chỉ cần đoạn ngắn.

Vendor A:

1. quay form trống;
2. dừng recording và nhập bid ngoài camera;
3. bật scene `PRIVATE MASK`;
4. quay `REVIEW SEALED BID` và `ENCRYPT & SUBMIT BID` với vùng values bị che;
5. giữ cảnh `ENCRYPTING / WAITING…`;
6. cho thấy ba machine receipt/progress nếu UI hiển thị;
7. wallet transaction confirmation chỉ với public market action;
8. quay `Bid receipt quorum committed`.

Vendor B và C:

- không cần quay form;
- chỉ quay trạng thái encrypted ingress/receipt rồi confirmation;
- giữ mỗi clip 10–20 giây.

Sau mỗi submission, kiểm tra video raw ngay để chắc chắn không có một frame lộ
private values hoặc wallet raw signature.

### Chương 09 — My Submissions (`16:40–17:50`)

Vẫn ở Vendor A, click `MY SUBMISSIONS`.

Quay:

- trạng thái `CONFIRMED · FINALITY PENDING` nếu bắt được;
- sau 12-block finality, `Submission accepted`;
- tender ID, bid ID, commitment, receipt bitmap và accepted block;
- expand `PUBLIC RECEIPT DETAILS`;
- `VIEW TRANSACTION`;
- `VIEW PUBLIC DOSSIER`;
- chỉ ra rằng price/delivery/warranty không thể khôi phục từ trang này.

Đổi sang một wallet không có submission để quay empty state trong 5–10 giây.

### Chương 10 — Activity, close và FCC selection (`17:50–20:40`)

Chờ Tender A hết deadline rồi vào `ACTIVITY`.

Quay:

1. action summary;
2. Tender A ở trạng thái `Ready to close`;
3. deadline/bid progress tối thiểu;
4. `VIEW PUBLIC DOSSIER`;
5. click `CLOSE & FREEZE FTSO`;
6. wallet confirmation;
7. refresh canonical state;
8. Public dossier sau close: ordered root, common quorum, close block và FTSO
   XRP/USD snapshot;
9. dừng quay trong khi relay dispatch/collect result;
10. quay clip mới khi Activity/Public tiến sang threshold result/terminal state;
11. cho thấy browser không có nút chọn winner và không có bid-decryption path.

Nếu muốn giải thích resilience bằng hình, mở Tender `7` sau luồng chính: một
result endpoint đã unavailable nhưng hai tender-frozen machines còn lại ký cùng
digest và finalization vẫn pass. Không gọi đây là TEE identity restart recovery.

### Chương 11 — Award và settlement công khai (`20:40–22:20`)

Mở Tender A sau khi awarded.

Quay:

- `AWARDED`;
- winner address và winning amount;
- buyer remainder;
- award receipt;
- signer bitmap/threshold result digest;
- finalization transaction;
- award contract trên Coston2 Explorer;
- public conservation: payout + remainder bằng escrow.

Winning amount được công khai theo thiết kế. Không mở bất kỳ losing bid value
nào để “so sánh”.

### Chương 12 — Auditor (`22:20–24:30`)

Disconnect wallet hoặc mở incognito, sau đó vào `AUDITOR`.

Quay:

1. `Inspect the binding, not the bids`;
2. search theo tender ID/buyer;
3. filter awarded/refunded/active;
4. chọn Tender A;
5. thẻ gộp `TRUST BINDING` + accepted bid receipts;
6. market, extension, code version, rules hash, ordered root;
7. ba machine identities/fingerprints;
8. ba accepted commitments và receipt quorum;
9. result digest, two signers, winner, payout, remainder, receipt;
10. copy một public hash/address;
11. Public/Sealed boundary ở cuối.

Giữ một wide shot cho thấy không có connect requirement, decrypt, reveal hoặc
finalize button trong Auditor.

### Chương 13 — Assets và FAssets redemption (`24:30–26:30`)

Trong `ACTIVITY`, mở tab/anchor `ASSETS`.

Quay hai trạng thái:

1. wallet không phải winner: panel redemption bị lock và giải thích điều kiện;
2. winner wallet: balance, minimum redemption, XRP destination field và exact
   amount approval;
3. submit official amount-based redemption request nếu có một award test phù
   hợp;
4. transaction confirmation;
5. request ID và explorer link.

Giữ rõ boundary: đây là `RedemptionRequested`, tức tạo nghĩa vụ payout cho
FAssets agent; không phải bằng chứng XRP đã về ngay lập tức. Nếu không còn award
đủ điều kiện, dùng `fassets-redemption.release.json` và transaction đã ghi nhận,
không dựng một nút success giả.

### Chương 14 — Refund và fail-closed recovery (`26:30–28:20`)

Quay các hồ sơ thật, không cần tạo outage mới:

- Tender `2`: `UndispatchedTimeout`, full escrow refund, không award receipt;
- Tender `5`: `SelectionExpired`, full escrow refund, không award receipt;
- Tender `7`: one-result-endpoint outage, two matching machines finalize;
- XRP checkpoint: restore/forget public payment handoff;
- wrong/disconnected wallet khiến action disabled;
- unavailable state phải hiển thị lỗi, không chèn mock tender/winner.

Nếu hệ thống đang khỏe, không chủ động tắt ingress/relay chỉ để có màn hình lỗi.
Hồ sơ V2 đã có đủ để giải thích recovery an toàn.

### Chương 15 — Docs, new work, giới hạn và kết (`28:20–30:00`)

Quay:

1. `GUIDE`/Docs và các mục XRP funding, privacy, recovery;
2. GitHub judge package;
3. architecture diagram;
4. `NEW-WORK-LEDGER.md` để phân biệt phần mới trên Flare với baseline cũ;
5. verified market/extension/code version;
6. landing CTA `Inspect the evidence before connecting`.

Kết thúc trên một frame sạch có:

- FlareQuorum;
- live app URL;
- Coston2/test assets;
- simulated TEE;
- unaudited;
- primary bounty: Confidential Compute Apps;
- XRP/FDC/Smart Account/FAssets journey là secondary interoperability fit.

Không đưa Sepolia/Nox lên hình, trừ khi làm một appendix riêng về “historical
baseline vs new Flare work”. Không để người xem hiểu địa chỉ cũ là deployment
Flare.

## 5. Shot sheet phải điền trong lúc quay

Chỉ ghi dữ liệu công khai:

```text
Production commit:
Vercel deployment checked at:
V2 market:
Extension / code version:
TEE availability checked at:

Tender A ID:
Buyer public address:
Vendor A/B/C public addresses:
Winning vendor public address:
XRPL public transaction ID:
FDC request/round:
Smart Account user-op hash:
Tender creation transaction:
Bid commitment transaction(s):
Close transaction:
Selection request ID:
Finalization transaction:
Award receipt ID:
Redemption request transaction:

Tender B ID:
Direct creation transaction:
Cancel transaction:
```

Không ghi bid values hoặc private input vào shot sheet.

## 6. Checklist kiểm tra raw footage

Sau khi quay xong nhưng trước khi viết lời thoại:

- [ ] Có landing, Public, Buyer, Private Bids, My Submissions, Activity,
  Auditor và Assets/Redemption.
- [ ] Có cả direct FTestXRP và XRP/FDC/Smart Account funding.
- [ ] Có một tender ba vendor hoàn tất bằng FCC 2-of-3.
- [ ] Có FTSO snapshot, award receipt, payout và remainder.
- [ ] Có empty-tender cancel và hai refund records.
- [ ] Có one-result-endpoint recovery record.
- [ ] Có wrong/disconnected wallet hoặc disabled action state.
- [ ] Không có bid plaintext/ciphertext, credential, salt hoặc component score.
- [ ] Không có seed/private key/raw wallet signature/secret/log body.
- [ ] Mọi địa chỉ, tender ID và transaction trong cùng câu chuyện khớp nhau.
- [ ] Không có Sepolia/Nox address được mô tả là Flare.
- [ ] Không gọi simulated TEE là hardware attestation.
- [ ] Không gọi redemption request là instant XRP payout.
- [ ] Không gọi Gate H/user validation là complete.
- [ ] Mỗi click quan trọng có 2 giây trước và 4–6 giây sau để lồng tiếng.
- [ ] Có ít nhất 5 giây clean frame ở đầu và cuối video.

## 7. Bước tiếp theo sau khi quay

Khi raw footage hoàn tất:

1. Gửi danh sách clip và duration thực tế.
2. Chọn clip nào giữ, cắt hoặc quay lại.
3. Khóa picture edit trước.
4. Viết voiceover bám theo đúng frame và transaction đã quay.
5. Thu voiceover theo từng chương, không thu một track 30 phút liên tục.
6. Thêm caption từ voiceover cuối cùng.
7. Chạy privacy review frame-by-frame trước khi xuất bản.

Không nên viết lời thoại chi tiết trước khi quay xong, vì thời gian chờ wallet,
FDC, finality và relay sẽ làm nhịp hình khác dự kiến. Storyboard này chỉ định
điều gì phải có trên hình; lời thoại sẽ được viết sau dựa trên footage thật.
