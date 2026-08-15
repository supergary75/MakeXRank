import { describe, expect, it } from "vitest";
import { restoreScoreCalculatorData, type ScoreCalculatorResult } from "./ScoreCalculator";

describe("restoreScoreCalculatorData", () => {
  it("优先使用新版本保存的原始计分输入", () => {
    const result: ScoreCalculatorResult = {
      redScore: 120,
      blueScore: 90,
      redBreakdown: { flag: 60 },
      blueBreakdown: { flag: 30 },
      redInputs: { flag: 1, cone: 3, violation: 2 },
      blueInputs: { flag: 2, cone: 1, violation: 0 },
    };

    const restored = restoreScoreCalculatorData(result);

    expect(restored.source).toBe("inputs");
    expect(restored.data.red.flag).toBe(1);
    expect(restored.data.red.cone).toBe(3);
    expect(restored.data.red.violation).toBe(2);
    expect(restored.data.blue.flag).toBe(2);
  });

  it("兼容旧版按得分保存的分项明细", () => {
    const result: ScoreCalculatorResult = {
      redScore: 80,
      blueScore: 40,
      redBreakdown: { flag: 60, cone: 40, yellowBlock: 45, violation: -40, yellow: 0 },
      blueBreakdown: { flag: 30, cone: 20, yellowBlock: 0, violation: -20, yellow: 0 },
    };

    const restored = restoreScoreCalculatorData(result);

    expect(restored.source).toBe("breakdown");
    expect(restored.data.red.flag).toBe(2);
    expect(restored.data.red.cone).toBe(2);
    expect(restored.data.red.yellowBlock).toBe(3);
    expect(restored.data.red.violation).toBe(2);
    expect(restored.data.red.yellow).toBe(0);
  });

  it("仅有总分时标记为人工补录，避免零值覆盖旧成绩", () => {
    const restored = restoreScoreCalculatorData({ redScore: 300, blueScore: 280 });

    expect(restored.source).toBe("total-only");
    expect(Object.values(restored.data.red).every((value) => value === 0)).toBe(true);
    expect(Object.values(restored.data.blue).every((value) => value === 0)).toBe(true);
  });
});
