import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import s from "./ScoreCalculator.module.css";

type Side = "red" | "blue";
type Page = "entry" | "score" | "review";
export interface ScoreCalculatorMatchInfo {
  field: string;
  matchNo: string;
  red1: string;
  red2: string;
  blue1: string;
  blue2: string;
}
export interface ScoreCalculatorResult {
  redScore: number;
  blueScore: number;
  redBreakdown?: Record<string, number>;
  blueBreakdown?: Record<string, number>;
  /** Raw scorer control values. Kept separately from scored breakdowns so an
   * existing match can be reopened without trying to infer slider positions. */
  redInputs?: Record<string, number>;
  blueInputs?: Record<string, number>;
}
const tasks = [
  ["flag", "战队旗帜", 30, 2],
  ["cone", "锥桶", 20, 4],
  ["yellowBlock", "黄色方块", 15, 6],
  ["colorBlock", "红/蓝方块", 10, 5],
  ["yellowNet", "黄球（二层铁网20分）", 20, 14],
  ["yellowFrame", "黄球（三层方框40分）", 40, 14],
  ["ball5", "红/蓝球（一层绿地5分区）", 5, 28],
  ["ball10", "红/蓝球（一层绿地10分区）", 10, 28],
  ["ball20", "红/蓝球（一层绿地20分区）", 20, 28],
  ["ballNet", "红/蓝球（二层铁网10分）", 10, 28],
  ["ballFrame", "红/蓝球（三层方框20分）", 20, 28],
] as const;
const penalties = [
  ["violation", "违例", 20],
  ["yellow", "黄牌", 0],
  ["redCard", "红牌", 120],
] as const;
const blank = () =>
  Object.fromEntries([...tasks, ...penalties].map((x) => [x[0], 0])) as Record<
    string,
    number
  >;

type ScoreInputData = Record<Side, Record<string, number>>;
type RestoreSource = "inputs" | "breakdown" | "empty" | "total-only";

const controlDefinitions = new Map<string, { points: number; max: number }>([
  ...tasks.map((task) => [task[0], { points: task[2], max: task[3] }] as const),
  ...penalties.map((penalty) => [penalty[0], { points: penalty[2], max: 99 }] as const),
]);

function sanitizeInputs(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const restored = blank();
  let found = false;
  controlDefinitions.forEach((definition, key) => {
    const numeric = Number(source[key]);
    if (!Number.isFinite(numeric)) return;
    restored[key] = Math.max(0, Math.min(definition.max, Math.round(numeric)));
    found = true;
  });
  return found ? restored : null;
}

function restoreLegacyBreakdown(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const restored = blank();
  let found = false;
  controlDefinitions.forEach((definition, key) => {
    const numeric = Number(source[key]);
    if (!Number.isFinite(numeric)) return;
    // A zero-point yellow card could not be represented by the legacy scored
    // breakdown. Keep it at zero rather than inventing a count.
    if (definition.points === 0) {
      restored[key] = 0;
      found = true;
      return;
    }
    restored[key] = Math.max(
      0,
      Math.min(definition.max, Math.round(Math.abs(numeric) / definition.points)),
    );
    found = true;
  });
  return found ? restored : null;
}

export function restoreScoreCalculatorData(result?: ScoreCalculatorResult): {
  data: ScoreInputData;
  source: RestoreSource;
} {
  if (!result) return { data: { red: blank(), blue: blank() }, source: "empty" };
  const redInputs = sanitizeInputs(result.redInputs);
  const blueInputs = sanitizeInputs(result.blueInputs);
  if (redInputs && blueInputs) {
    return { data: { red: redInputs, blue: blueInputs }, source: "inputs" };
  }
  const redBreakdown = restoreLegacyBreakdown(result.redBreakdown);
  const blueBreakdown = restoreLegacyBreakdown(result.blueBreakdown);
  if (redBreakdown && blueBreakdown) {
    return { data: { red: redBreakdown, blue: blueBreakdown }, source: "breakdown" };
  }
  return { data: { red: blank(), blue: blank() }, source: "total-only" };
}

export function ScoreCalculator({
  onBack,
  onSave,
  matchInfo,
  draftKey,
  initialResult,
}: {
  onBack: () => void;
  onSave?: (result: ScoreCalculatorResult) => void | Promise<void>;
  matchInfo?: ScoreCalculatorMatchInfo;
  draftKey?: string;
  initialResult?: ScoreCalculatorResult;
}) {
  const [side, setSide] = useState<Side>("red"),
    [page, setPage] = useState<Page>("entry"),
    [confirm, setConfirm] = useState(false),
    [saved, setSaved] = useState(false),
    [saving, setSaving] = useState(false),
    [saveError, setSaveError] = useState(""),
    [manualRecoveryAccepted, setManualRecoveryAccepted] = useState(false);
  const draftStorageKey = draftKey ? `makexrank::score-draft::${draftKey}` : "";
  const restoredResult = useMemo(() => restoreScoreCalculatorData(initialResult), [initialResult]);
  const [data, setData] = useState<Record<Side, Record<string, number>>>(() => {
    // A persisted cloud result is authoritative. A stale local zero draft must
    // never hide itemized values already saved by another device.
    if (initialResult) return restoredResult.data;
    if (draftStorageKey) {
      try {
        const draft = JSON.parse(window.localStorage.getItem(draftStorageKey) ?? "null") as Partial<Record<Side, Record<string, number>>> | null;
        if (draft?.red && draft?.blue) return { red: { ...blank(), ...draft.red }, blue: { ...blank(), ...draft.blue } };
      } catch { /* Ignore an invalid draft and start clean. */ }
    }
    return { red: blank(), blue: blank() };
  });
  useEffect(() => {
    if (!draftStorageKey) return;
    try { window.localStorage.setItem(draftStorageKey, JSON.stringify(data)); } catch { /* Storage may be unavailable in private mode. */ }
  }, [data, draftStorageKey]);
  const totalOnlyResult = restoredResult.source === "total-only";
  const total = useMemo(() => {
    const calc = (x: Side) =>
      Math.max(
        0,
        tasks.reduce((n, t) => n + data[x][t[0]] * t[2], 0) -
          penalties.reduce((n, t) => n + data[x][t[0]] * t[2], 0),
      );
    return { red: calc("red"), blue: calc("blue") };
  }, [data]);
  const breakdown = (x: Side) =>
    Object.fromEntries([
      ...tasks.map((t) => [t[0], data[x][t[0]] * t[2]]),
      ...penalties.map((p) => [p[0], -data[x][p[0]] * p[2]]),
    ]);
  const set = (x: Side, id: string, n: number, max = 99) =>
    setData((v) => ({
      ...v,
      [x]: { ...v[x], [id]: Math.max(0, Math.min(max, n)) },
    }));
  const outcome =
    total.red === total.blue
      ? "平局"
      : total.red > total.blue
        ? "红方胜"
        : "蓝方胜";
  const header = (
    <>
      <header className={s.head}>
        <button onClick={onBack}>‹</button>
        <h1>比赛结束-计分时刻计分</h1>
        <span>⚙</span>
      </header>
      <div className={s.progress} />
    </>
  );
  const entry = (
    <main>
      {header}
      <nav className={s.tabs}>
        <button
          className={side === "red" ? s.on : ""}
          onClick={() => setSide("red")}
        >
          红方
        </button>
        <button
          className={side === "blue" ? s.on : ""}
          onClick={() => setSide("blue")}
        >
          蓝方
        </button>
      </nav>
      <section className={s.panel}>
        {restoredResult.source === "breakdown" && (
          <p className={s.restoreNotice}>已从旧版计分明细恢复滑块；旧记录中的零分黄牌次数无法反推。</p>
        )}
        {totalOnlyResult && !manualRecoveryAccepted && (
          <div className={s.restoreWarning}>
            <strong>这场比赛仅保存了最终总分，无法自动反推各计分项目。</strong>
            <span>当前不会用零值覆盖旧成绩。如需补录，请确认后完整填写红蓝双方明细。</span>
            <button type="button" onClick={() => setManualRecoveryAccepted(true)}>开始人工补录</button>
          </div>
        )}
        {tasks.map((t) => {
          const v = data[side][t[0]];
          return (
            <div className={s.item} key={t[0]}>
              <div>
                <span>{t[1]}</span>
                <b>{v * t[2]}分</b>
              </div>
              <section>
                <button onClick={() => set(side, t[0], v - 1, t[3])}>−</button>
                <label>
                  <output>{v}</output>
                  <input
                    type="range"
                    min="0"
                    max={t[3]}
                    value={v}
                    onChange={(e) => set(side, t[0], +e.target.value, t[3])}
                  />
                  <small>
                    <i>0</i>
                    <i>{t[3]}</i>
                  </small>
                </label>
                <button onClick={() => set(side, t[0], v + 1, t[3])}>＋</button>
              </section>
            </div>
          );
        })}
        <div className={s.penalties}>
          {penalties.map((p) => {
            const v = data[side][p[0]];
            return (
              <div key={p[0]}>
                <span>{p[1]}</span>
                <b>{v}次</b>
                <button onClick={() => set(side, p[0], v - 1)}>−</button>
                <button onClick={() => set(side, p[0], v + 1)}>＋</button>
                <strong>{v * p[2]}分</strong>
              </div>
            );
          })}
        </div>
      </section>
      <footer className={s.foot}>
        <div>
          <span>红方</span>
          <b>{total.red}</b>
        </div>
        <div>
          <span>蓝方</span>
          <b>{total.blue}</b>
        </div>
        <button disabled={totalOnlyResult && !manualRecoveryAccepted} onClick={() => setPage("score")}>完成</button>
      </footer>
    </main>
  );
  const score = (
    <main className={s.score}>
      <div className={s.progress} />
      <section>
        <h1>比赛结束-计分时刻得分</h1>
        <div>
          <b>{total.red}</b>
          <span>:</span>
          <strong>{total.blue}</strong>
        </div>
      </section>
      <button onClick={() => setPage("review")}>下一步</button>
    </main>
  );
  const review = (
    <main className={s.review}>
      <header>
        <button onClick={onBack}>‹</button>
        <h1>MakeX Explorer 博弈前线</h1>
        <span>
          中<br />A
        </span>
      </header>
      <p className={s.meta}>
        {matchInfo?.field ?? "1场地"} - 第{matchInfo?.matchNo ?? "1"}场 - 第1局
        <br />
        <small>◷ 比赛结束计分</small>
      </p>
      <section className={s.teams}>
        <div>
          <b>红方</b>
          <strong>
            {outcome === "红方胜" ? "胜" : outcome === "蓝方胜" ? "负" : "平局"}
          </strong>
          <p>{matchInfo?.red1 ?? "X10001"}</p>
          <p>{matchInfo?.red2 ?? "X10002"}</p>
        </div>
        <i />
        <div>
          <b>蓝方</b>
          <strong>
            {outcome === "蓝方胜" ? "胜" : outcome === "红方胜" ? "负" : "平局"}
          </strong>
          <p>{matchInfo?.blue1 ?? "X10003"}</p>
          <p>{matchInfo?.blue2 ?? "X10004"}</p>
        </div>
      </section>
      <div className={s.totals}>
        <b>{total.red}</b>
        <span>总分</span>
        <b>{total.blue}</b>
      </div>
      <section className={s.card}>
        <h2>
          {total.red}
          <span>比赛结束-计分时刻</span>
          {total.blue}
        </h2>
        <div className={s.table}>
          {tasks.map((t) => (
            <div key={t[0]}>
              <b>{data.red[t[0]] * t[2]}</b>
              <span>{t[1]}</span>
              <b>{data.blue[t[0]] * t[2]}</b>
            </div>
          ))}
        </div>
      </section>
      <section className={s.card}>
        <h3>判罚扣分</h3>
        {penalties.map((p) => (
          <div className={s.row} key={p[0]}>
            <b>{data.red[p[0]] * p[2]}</b>
            <span>{p[1]}</span>
            <b>{data.blue[p[0]] * p[2]}</b>
          </div>
        ))}
      </section>
      <p className={s.help}>ⓘ 对计分有疑问?</p>
      <footer className={s.reviewFoot}>
        <button onClick={() => setPage("entry")}>调整分数</button>
        <button onClick={() => setConfirm(true)}>确认比赛结果</button>
      </footer>
      {confirm && (
        <div className={s.shade}>
          <div className={s.modal}>
            <h2>当前结果</h2>
            <p>{outcome}</p>
            <section>
              <button onClick={() => setConfirm(false)}>取消</button>
              <button
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  setSaveError("");
                  try {
                    await onSave?.({
                      redScore: total.red,
                      blueScore: total.blue,
                      redBreakdown: breakdown('red'),
                      blueBreakdown: breakdown('blue'),
                      redInputs: { ...data.red },
                      blueInputs: { ...data.blue },
                    });
                    if (draftStorageKey) window.localStorage.removeItem(draftStorageKey);
                    setConfirm(false);
                    setSaved(true);
                    if (onSave) onBack();
                  } catch (error) {
                    setSaveError(error instanceof Error ? error.message : "保存失败，请检查网络后重试。");
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? "正在保存…" : "确认"}
              </button>
            </section>
            {saveError && <p>{saveError}</p>}
          </div>
        </div>
      )}
      {saved && <div className={s.toast}>比赛结果已确认</div>}
    </main>
  );
  return createPortal(
    <div className={s.overlay}>
      <div className={s.phone}>
        {page === "entry" ? entry : page === "score" ? score : review}
      </div>
    </div>,
    document.body,
  );
}
