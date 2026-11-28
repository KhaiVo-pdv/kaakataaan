# Kaakataaan — E&P kịch bản 2: Pirate Lairs — thiết kế

Ngày 2026-11-28. Trạng thái: **Khai đã duyệt (2026-11-28). Bước 1 đã xong.** Bản này có cả trong Project (`claude/pirate-lairs-design.md`) và trong repo (`docs/superpowers/specs/2026-11-28-pirate-lairs-design.md`).

## Bước 1 (dữ liệu bàn cờ + lobby): đã làm
- `scenarios.js`: `pirateLairs` đã chọn được (`ready: true`), với các cờ `startGold: 2`, `crews: true`, `lairs: true`; `landHo` có `startGold: 0`. Hàm `epFlag(s, name)` cho biết kịch bản đang chơi có cờ đó không.
- `maps.js`: `EP_MAPS.pirateLairs` dùng lại đảo xuất phát, số và ghế của Land Ho!. Bản đồ rộng 15 cột (mỗi bên thêm 1 cột biển), để tâm bàn cờ không bị lệch và các vị trí xuất phát vẫn đúng chỗ. Mỗi vùng có 12 ô: 7 đất, 3 mỏ vàng, 2 biển.
- `lairs.js`: `addLair`, `lairBlocks(s, 'vertex'|'edge'|'tile', id)`. Hang chưa bị chiếm thì chặn làm đường, xây nhà và lập nhà bằng người khai hoang, và ô đó không sản xuất.
- `explore.js`: lật trúng mỏ vàng thì nhận 2 vàng và đặt hang; số của ô vẫn bị che. Đầu ván mỗi người có 2 vàng; `p.crewsLeft = 9`.
- Kiểm tra: rules 201, sim 540/540 (Pirate Lairs 30/30 ván kết thúc, trung bình khoảng 50 lượt); dấu vân tay Base + Seafarers + Land Ho! giống hệt.
- Giới hạn còn lại: chưa chiếm được hang, chưa có tàu cướp biển, chưa đóng crew, màn hình luật chưa có mục Pirate Lairs, chưa vẽ hang (ô vàng hiện như một ô đất bình thường, số bị che).

## 1. Mục đích
Kịch bản 2 trong 5 kịch bản E&P (thắng ở 12 điểm). Kịch bản này đưa vào phần 2 của luật cơ bản E&P: **crew, tàu cướp biển, chở crew đi đánh hang**. Kịch bản 5 cũng dùng lại phần này, nên phải viết thành module dùng chung. Mục tiêu dài hạn vẫn như cũ: làm xong các bản mở rộng, rồi đổi tên game và đưa lên Steam.

## 2. Mục tiêu / Không làm / Thất bại nếu
- **Mục tiêu:** đủ luật theo sách (trừ những chỗ ghi "Claude quyết" ở mục 8); bot chơi được và ván nào cũng kết thúc; có 2D, 3D, HUD và luật có hình; chơi được 2–4 người.
- **Không làm:** 5–6 người; vòng tự đặt nhà đầu ván; chép bản đồ gốc; kết hợp với bản mở rộng khác.
- **Thất bại nếu:** Base, Seafarers hoặc **Land Ho!** chạy khác đi (kiểm bằng dấu vân tay); bot bị kẹt; tàu cướp biển làm ván dài quá mức (trung bình > 20 vòng).

## 3. Quyết định của Khai
- Xuất phát **cố định** như Land Ho! (A), dùng lại `placeStarts`.
- **Cách 1:** tách module dùng chung `crews.js`, `pirateShip.js`, `missions.js`; `lairs.js` chỉ chứa luật hang.
- Bản đồ do Claude thiết kế và cân bằng bằng bot (quyết định chung của E&P).

## 4. Các cách đã cân nhắc
1. **Tách module dùng chung (đã chọn).** Kịch bản 3–5 chỉ cần thêm file nhiệm vụ. Phải sửa thêm phần khoang tàu và ô chứa của Land Ho! cho chung một cách tính.
2. Gộp hết vào `lairs.js`: nhanh hơn bây giờ, nhưng tới kịch bản 3 hoặc 5 phải tách lại, dễ gây lỗi.
3. Dùng lại tàu cướp biển của Seafarers: loại, vì luật khác hẳn (Seafarers cản đóng tàu và cướp của nhà; E&P cống nạp vàng và chỉ cướp của chủ tàu).

## 5. Luật (theo sách)
**Quân mỗi người:** 5 nhà, 15 đường, 4 nhà cảng, 3 tàu, 2 người khai hoang, 9 crew, 1 tàu cướp biển, 1 dấu nhiệm vụ, **2 vàng đầu ván** (Land Ho! là 0).

**Crew (`crews.js`)**
- Giá 1 quặng + 1 len. Đặt vào ô chứa còn trống ở nhà cảng của mình, hoặc lên tàu của mình đang đậu sát nhà cảng.
- Lên/xuống tàu không làm tàu dừng. Crew chỉ đi bằng tàu của chính mình, không đi trên đất.
- Chuyển hàng: tàu ↔ nhà cảng của mình khi một đầu tàu chạm nhà cảng. Không chuyển trực tiếp giữa 2 tàu; muốn chuyển thì cho cả 2 tàu cùng chạm một nhà cảng.

**Tàu cướp biển (`pirateShip.js`)**
- Mỗi người 1 chiếc; trên bàn chỉ có 1 chiếc tại một thời điểm. Trong kịch bản này, ra 7 thì không có kẻ cướp, chỉ có tàu cướp biển.
- Ra 7: ai quá 7 lá thì bỏ một nửa (như hiện nay). Người đổ đặt hoặc dời tàu cướp biển của mình. Nếu tàu của người khác đang trên bàn thì trả về chủ, rồi đặt tàu mình (được đặt cùng ô).
- Ô được đặt: ô biển, không sát đảo xuất phát, không nằm ở viền ngoài.
- Cướp: lấy ngẫu nhiên 1 lá của một đối thủ có tàu trên cạnh của ô đó. Đối thủ không có bài thì lấy 1 vàng. Không cướp của nhà.
- Cống nạp: tàu đi vào, đi dọc hoặc rời cạnh của ô cướp biển thì trả 1 vàng cho mỗi tàu (vào ngân hàng). Trả rồi thì đi tự do trong lượt đó. Chủ tàu cướp biển không phải trả. Đóng tàu sát ô cướp biển thì miễn phí, nhưng đi thì phải trả.
- Đuổi cướp biển: mỗi tàu sẵn sàng chiến đấu (chưa đi trong lượt, có một đầu chạm 1 trong 6 góc của ô) được đổ 1 xúc xắc. Ra 6: trả tàu cướp biển về chủ, đặt tàu cướp biển của mình rồi cướp 1 lá. Thất bại thì phải cống nạp hoặc đi đường khác. Tàu đã đánh vẫn đi được bình thường.

**Hang cướp biển (`lairs.js`)**
- Mỗi vùng úp có 3 ô mỏ vàng (tổng 6 hang). Lật trúng mỏ vàng: nhận 2 vàng, đặt hang (úp số) lên ô. Không làm đường hay xây nhà chạm ô này cho tới khi chiếm được.
- Tàu chở 1–2 crew, có một đầu chỉ vào góc của ô hang còn hoạt động, thì được đặt crew lên hang. Mỗi hang tối đa 3 crew.
- Crew thứ 3 (của ai cũng được) là chiếm được hang; giải quyết **sau pha đi tàu**. Mỗi người góp crew nhận 2 vàng và tiến 1 ô trên thanh nhiệm vụ (bắt đầu từ người đang đi, rồi theo chiều kim đồng hồ). Mỗi người đổ 1 xúc xắc + số crew của mình; cao nhất là anh hùng, tiến thêm 1 ô. Hòa thì ai nhiều crew hơn thắng, vẫn hòa thì đổ lại. Mỗi người góp crew mất 1 crew; đánh một mình thì tiến 1 ô và mất 1 crew.
- Sau khi chiếm: lật số lên, crew còn lại để cạnh hang, tàu ghé lấy lại được. Ô vàng xây được bình thường; ra số thì mỗi nhà (thường hoặc cảng) sát ô nhận 2 vàng.

**Thanh nhiệm vụ (`missions.js`, dùng chung cho kịch bản 3–5)**
- `s.explorers.missions[id][pid] = vị trí`. Điểm theo vị trí tra trong bảng. Người đi xa nhất có lá thưởng +1 điểm; trùng ô thì ai tới trước giữ lá.
- Thắng khi đạt 12 điểm trong lượt của mình.

## 6. Bản đồ
- `EP_MAPS.pirateLairs`: đảo xuất phát cố định (dùng lại cách xếp ghế của Land Ho!: 6 ghế, 2 người dùng ghế riêng). Mỗi vùng Bắc/Nam có 12 ô úp (3 mỏ vàng, 7 đất, 2 biển) và chồng số riêng. Sẽ cân bằng lại bằng bot ở bước 4.
- Mỏ vàng là loại ô `gold` (sau khi chiếm thì sản xuất 2 vàng). Hang lưu ở `s.explorers.lairs[hexId] = { crews: [pid…], captured }`.

## 7. Các bước (mỗi bước: đề xuất → Khai OK → code → test → reviewer → commit + push)
1. **Dữ liệu bàn cờ + lobby:** ✅ đã xong.
2. **Crew:** gộp khoang tàu và ô chứa thành một cách tính (Land Ho! không đổi), đóng/chở/chuyển crew, bot.
3. **Tàu cướp biển:** ra 7, cướp, cống nạp, đuổi; bot.
4. **Hang + thanh nhiệm vụ + điểm:** đặt crew, chiếm hang, anh hùng, vàng từ ô vàng; bot và cân bằng bằng mô phỏng.
5. **2D/3D:** crew, tàu cướp biển, hang, ô vàng.
6. **HUD + luật có hình:** nút, thanh nhiệm vụ, mục mới trong `SECTIONS` của `explorersHelp.js`.

## 8. Claude tự quyết (Khai có thể sửa)
- **Khoang:** tàu có 2 chỗ, xếp gì cũng được (người khai hoang, crew). Ô chứa nhà cảng có 2 chỗ; người khai hoang chiếm cả 2 (giữ đúng hành vi "1 người chờ mỗi nhà cảng" của Land Ho!).
- **Điểm trên thanh nhiệm vụ:** cứ 2 ô được 1 điểm (bản đầu). Cân bằng bằng bot sao cho mỗi ván khoảng 12–16 vòng và nhiệm vụ đóng góp khoảng 3–5 điểm cho người thắng.
- Tàu cướp biển chỉ được đặt trên ô biển **đã lật**.
- Không đủ vàng thì không được đi vào ô cướp biển (không cho nợ).
- Đuổi cướp biển là một hành động trong pha `epMove`, làm trước khi tàu đó đi.
- 2 người: không đặt nhà trung lập, dùng ghế riêng như Land Ho!.
- Ở chế độ sương mù, hang và tàu cướp biển ai cũng thấy.
- Online: đồng bộ hang, crew và tàu cướp biển qua state như tàu hiện nay.
- (Bước 1) Hang cũng chặn lập nhà bằng người khai hoang, không chỉ chặn xây nhà bằng đường.

## 9. Để builder tự quyết
- Tên hàm và cách chia nhỏ trong từng file; hiệu ứng và vị trí nút trong HUD; thứ tự ưu tiên của bot (miễn là ván nào cũng kết thúc).

## 10. Kiểm thử
- Dấu vân tay Base + Seafarers + **ván Land Ho!** trước và sau mỗi bước (tạo lại `before.txt` từ commit trước khi sửa). Script: `/home/claude/scripts/fingerprint.mjs` (40 base + 10 Seafarers + 20 Land Ho!, so cả hash state cuối của Land Ho!). Script này mất khi môi trường đóng.
- `tests/rules.mjs`: crew, cống nạp, đuổi cướp biển, chiếm hang (một mình / nhiều người / hòa).
- `tests/sim.mjs`: ván Pirate Lairs 2–4 người (đã có, xen kẽ với Land Ho!). Bất biến: mỗi hang ≤ 3 crew, khoang hợp lệ, tối đa 1 tàu cướp biển trên bàn, vàng không âm, không có nhà sát hang chưa bị chiếm, ván phải kết thúc.
