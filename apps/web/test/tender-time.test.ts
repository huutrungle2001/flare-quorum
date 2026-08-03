import { describe, expect, it } from "vitest";
import {
  formatLocalDeadline,
  formatUtcDeadline,
  isTenderAcceptingBids,
  remainingTimeLabel,
} from "../src/time/tenderTime";

const timestamp = BigInt(Date.UTC(2026, 6, 28, 19, 0, 0) / 1_000);

describe("tender deadline presentation", () => {
  it("shows an explicit browser timezone while preserving canonical UTC", () => {
    expect(formatLocalDeadline(timestamp, "Asia/Ho_Chi_Minh")).toMatch(
      /29 Jul 2026.*02:00.*GMT\+7/,
    );
    expect(formatUtcDeadline(timestamp)).toMatch(/28 Jul 2026.*19:00/);
  });

  it("provides stable countdown labels", () => {
    const now = Number(timestamp) * 1_000;
    expect(remainingTimeLabel(timestamp + 25n, now)).toBe("25s left");
    expect(remainingTimeLabel(timestamp + 90n, now)).toBe("1m left");
    expect(remainingTimeLabel(timestamp - 1n, now)).toBe("Expired");
  });

  it("only accepts Open tenders before their deadline", () => {
    const now = Number(timestamp) * 1_000;
    expect(
      isTenderAcceptingBids(
        { status: "Open", bidDeadline: timestamp + 1n },
        now,
      ),
    ).toBe(true);
    expect(
      isTenderAcceptingBids(
        { status: "Open", bidDeadline: timestamp },
        now,
      ),
    ).toBe(false);
    expect(
      isTenderAcceptingBids(
        { status: "Closed", bidDeadline: timestamp + 1n },
        now,
      ),
    ).toBe(false);
  });
});
