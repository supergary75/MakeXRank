import { useEffect, useMemo, useState } from 'react';
import type { Alliance, EventType, NotificationType, PlayoffMatch, PlayoffPrediction, TeamRaw } from '../../types';
import { calculateRanking, sortTeams } from '../../utils/rankingAlgorithm';
import {
  buildAlliancesFromDrafts,
  createEmptyAllianceDrafts,
  createSuggestedAllianceDrafts,
  generatePlayoffPrediction,
  parseAllianceData,
} from '../../utils/playoffGenerator';
import styles from './PlayoffView.module.css';

interface Props {
  eventType: EventType;
  teamsData: TeamRaw[];
  showNotification: (msg: string, type: NotificationType) => void;
}

interface AllianceDraftState {
  number: number;
  team1: string;
  team2: string;
}

const DEFAULT_ADVANCING_TEAM_COUNT = 8;
const ADVANCING_TEAM_OPTIONS = [8, 16, 32, 64];

function getRankedTeams(teamsData: TeamRaw[], eventType: EventType) {
  return sortTeams(
    calculateRanking(teamsData, eventType),
    'totalWinLossScore',
    'desc',
    eventType,
  );
}

function normalizeAdvancingTeamCount(value: number, rankedTeamCount: number): number {
  const availableOptions = ADVANCING_TEAM_OPTIONS.filter((option) => option <= rankedTeamCount);
  if (availableOptions.length === 0) {
    return 0;
  }

  return availableOptions.includes(value)
    ? value
    : availableOptions[availableOptions.length - 1];
}

function buildDraftMap(drafts: AllianceDraftState[]) {
  return new Map(drafts.map((draft) => [draft.number, draft]));
}

function getAllianceTeams(alliance: Alliance): string {
  return `${alliance.team1} + ${alliance.team2}`;
}

function renderBracketAlliance(
  alliance: Alliance,
  match: PlayoffMatch,
  sideClassName: string,
) {
  const isWinner = match.winner.number === alliance.number;

  return (
    <div className={`${styles.bracketAlliance} ${sideClassName} ${isWinner ? styles.bracketWinner : ''}`}>
      <div>
        <span>{alliance.name}</span>
        <strong>{getAllianceTeams(alliance)}</strong>
      </div>
      <em>{alliance.number === match.alliance1.number ? match.alliance1WinRate : match.alliance2WinRate}%</em>
    </div>
  );
}

export function PlayoffView({ eventType, teamsData, showNotification }: Props) {
  const [clipboardInput, setClipboardInput] = useState('');
  const [advancingTeamCount, setAdvancingTeamCount] = useState(DEFAULT_ADVANCING_TEAM_COUNT);
  const [drafts, setDrafts] = useState<AllianceDraftState[]>(createEmptyAllianceDrafts(4));
  const [prediction, setPrediction] = useState<PlayoffPrediction | null>(null);

  const rankedTeams = useMemo(
    () => getRankedTeams(teamsData, eventType),
    [eventType, teamsData],
  );

  const effectiveAdvancingTeamCount = useMemo(
    () => normalizeAdvancingTeamCount(advancingTeamCount, rankedTeams.length),
    [advancingTeamCount, rankedTeams.length],
  );
  const allianceCount = Math.max(1, Math.floor(effectiveAdvancingTeamCount / 2));
  const availableAdvancingOptions = useMemo(
    () => ADVANCING_TEAM_OPTIONS.filter((option) => option <= rankedTeams.length),
    [rankedTeams.length],
  );
  const eligibleTeams = useMemo(
    () => rankedTeams.slice(0, effectiveAdvancingTeamCount),
    [effectiveAdvancingTeamCount, rankedTeams],
  );

  useEffect(() => {
    if (eligibleTeams.length < 8) {
      setDrafts(createEmptyAllianceDrafts(1));
      setPrediction(null);
      return;
    }

    setDrafts(createSuggestedAllianceDrafts(eligibleTeams, allianceCount));
    setPrediction(null);
  }, [allianceCount, eligibleTeams]);

  const currentAlliances = useMemo(() => {
    try {
      return buildAlliancesFromDrafts(drafts, eligibleTeams);
    } catch {
      return [];
    }
  }, [drafts, eligibleTeams]);

  const handleAdvancingTeamCountChange = (value: string) => {
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue)) {
      return;
    }

    setAdvancingTeamCount(nextValue);
  };

  const handleDraftChange = (number: number, field: 'team1' | 'team2', value: string) => {
    setDrafts((previous) =>
      previous.map((draft) => (draft.number === number ? { ...draft, [field]: value } : draft)),
    );
    setPrediction(null);
  };

  const handleFillSuggested = () => {
    if (eligibleTeams.length < 8) {
      showNotification('当前比赛可用队伍不足，暂时无法自动预填联盟。', 'error');
      return;
    }

    setDrafts(createSuggestedAllianceDrafts(eligibleTeams, allianceCount));
    setPrediction(null);
    showNotification(`已按前 ${effectiveAdvancingTeamCount} 名生成默认联盟预览。`, 'success');
  };

  const handleClearDrafts = () => {
    setDrafts(createEmptyAllianceDrafts(allianceCount));
    setPrediction(null);
    showNotification('已清空当前联盟预览。', 'info');
  };

  const handleLoadClipboard = () => {
    if (!clipboardInput.trim()) {
      showNotification('请先粘贴联盟选择表，再导入。', 'error');
      return;
    }

    if (eligibleTeams.length < 8) {
      showNotification('请先确认当前比赛已经有足够的晋级队伍数据。', 'error');
      return;
    }

    try {
      const alliances = parseAllianceData(clipboardInput, eligibleTeams);
      if (alliances.length < 2) {
        showNotification('没有识别到完整联盟，请检查粘贴内容或晋级队伍数量。', 'error');
        return;
      }

      const draftMap = buildDraftMap(drafts);
      const importedDrafts = createEmptyAllianceDrafts(allianceCount).map((emptyDraft) => {
        const importedAlliance = alliances.find((alliance) => alliance.number === emptyDraft.number);
        const existingDraft = draftMap.get(emptyDraft.number);

        return importedAlliance
          ? {
              number: importedAlliance.number,
              team1: importedAlliance.team1,
              team2: importedAlliance.team2,
            }
          : existingDraft ?? emptyDraft;
      });

      setDrafts(importedDrafts);
      setPrediction(generatePlayoffPrediction(alliances.slice(0, allianceCount)));
      showNotification('已从联盟选择表导入，并生成淘汰赛预测。', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      showNotification(`联盟导入失败：${message}`, 'error');
    }
  };

  const handleGeneratePrediction = () => {
    if (eligibleTeams.length < 8) {
      showNotification('当前比赛还没有足够的晋级队伍，暂时无法预测淘汰赛。', 'error');
      return;
    }

    const selectedTeams = drafts.flatMap((draft) => [draft.team1, draft.team2]).filter(Boolean);
    if (selectedTeams.length !== allianceCount * 2) {
      showNotification(`请先为 ${allianceCount} 个联盟都选择两支队伍。`, 'error');
      return;
    }

    if (new Set(selectedTeams).size !== selectedTeams.length) {
      showNotification('联盟中存在重复队伍，请调整后再生成预测。', 'error');
      return;
    }

    try {
      const alliances = buildAlliancesFromDrafts(drafts, eligibleTeams);
      if (alliances.length < 2) {
        showNotification('联盟信息不完整，请补齐后再生成预测。', 'error');
        return;
      }

      setPrediction(generatePlayoffPrediction(alliances));
      showNotification('本地淘汰赛预测已生成。', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      showNotification(`生成预测失败：${message}`, 'error');
    }
  };

  return (
    <div className={styles.container}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Playoff Preview</p>
          <h2>淘汰赛预测预览</h2>
          <p className={styles.description}>
            先输入本场比赛的晋级队伍数量，再用资格赛排名和联盟选择结果做本地预测。
            预测主要参考联盟总 EPA，再综合总分、净胜分和种子质量判断淘汰路径。
          </p>
        </div>
        <div className={styles.heroBadges}>
          <span>EPA 主导</span>
          <span>固定淘汰签位</span>
          <span>8 / 16 / 32 / 64 晋级</span>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h3>晋级队伍设置</h3>
            <p>
              每场比赛的晋级数量可能不同，这里决定下方联盟选择池包含资格赛前多少名。
              当前按前 {effectiveAdvancingTeamCount} 名生成 {allianceCount} 个联盟。
            </p>
          </div>
          <label className={styles.numberControl}>
            <span>晋级队伍数</span>
            <select
              value={advancingTeamCount}
              onChange={(event) => handleAdvancingTeamCountChange(event.target.value)}
            >
              {availableAdvancingOptions.map((option) => (
                <option key={option} value={option}>
                  {option} 支队伍
                </option>
              ))}
            </select>
          </label>
        </div>
        {advancingTeamCount !== effectiveAdvancingTeamCount && (
          <p className={styles.helperText}>
            淘汰赛只支持 8、16、32、64 支晋级队伍；系统已按当前可用的 {effectiveAdvancingTeamCount} 支队伍计算。
          </p>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h3>资格赛晋级种子</h3>
            <p>
              这里展示当前比赛按设置截取的晋级队伍，联盟预测只在这 {effectiveAdvancingTeamCount} 支队伍中进行。
            </p>
          </div>
          <button className={styles.secondaryButton} onClick={handleFillSuggested}>
            按晋级顺位预填联盟
          </button>
        </div>

        <div className={styles.seedGrid}>
          {eligibleTeams.map((team, index) => (
            <article key={team.team} className={styles.seedCard}>
              <span className={styles.seedNo}>#{index + 1}</span>
              <strong>{team.team}</strong>
              <div className={styles.seedMeta}>
                <span>EPA {team.epa}</span>
                <span>胜负分 {team.totalWinLossScore}</span>
                <span>净胜分 {team.netScore}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h3>联盟搭配预览</h3>
            <p>可以直接手动选择联盟，也可以粘贴联盟选择表自动带入。</p>
          </div>
          <button className={styles.secondaryButton} onClick={handleClearDrafts}>
            清空联盟
          </button>
        </div>

        <div className={styles.allianceGrid}>
          {drafts.map((draft) => {
            const currentAlliance = currentAlliances.find((alliance) => alliance.number === draft.number);

            return (
              <article key={draft.number} className={styles.allianceCard}>
                <div className={styles.allianceHeader}>
                  <strong>联盟 {draft.number}</strong>
                  <span>{currentAlliance?.outlook ?? '等待选择'}</span>
                </div>

                <label className={styles.selectBlock}>
                  <span>战队 1</span>
                  <select
                    value={draft.team1}
                    onChange={(event) => handleDraftChange(draft.number, 'team1', event.target.value)}
                  >
                    <option value="">请选择队伍</option>
                    {eligibleTeams.map((team) => (
                      <option key={`${draft.number}-a-${team.team}`} value={team.team}>
                        {team.team}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.selectBlock}>
                  <span>战队 2</span>
                  <select
                    value={draft.team2}
                    onChange={(event) => handleDraftChange(draft.number, 'team2', event.target.value)}
                  >
                    <option value="">请选择队伍</option>
                    {eligibleTeams.map((team) => (
                      <option key={`${draft.number}-b-${team.team}`} value={team.team}>
                        {team.team}
                      </option>
                    ))}
                  </select>
                </label>

                {currentAlliance && (
                  <div className={styles.allianceStats}>
                    <span>联盟总 EPA {currentAlliance.totalEPA}</span>
                    <span>预测强度 {currentAlliance.powerScore}</span>
                  </div>
                )}
              </article>
            );
          })}
        </div>

        <div className={styles.importPanel}>
          <div className={styles.importHeader}>
            <strong>粘贴联盟选择表</strong>
            <span>如果你已经复制了联盟选择结果，可以直接粘贴到这里。</span>
          </div>
          <textarea
            className={styles.textarea}
            value={clipboardInput}
            onChange={(event) => setClipboardInput(event.target.value)}
            placeholder="粘贴联盟选择表，系统会自动识别联盟编号、战队名称并生成预测。"
          />
          <div className={styles.actionRow}>
            <button className={styles.secondaryButton} onClick={handleLoadClipboard}>
              从联盟表导入
            </button>
            <button className={styles.primaryButton} onClick={handleGeneratePrediction}>
              生成淘汰赛预测
            </button>
          </div>
        </div>
      </section>

      {prediction && (
        <>
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h3>联盟强度总览</h3>
                <p>当前预测主要参考联盟总 EPA，再叠加排位赛总分、净胜分与种子顺位。</p>
              </div>
            </div>

            <div className={styles.powerGrid}>
              {currentAlliances
                .sort((left, right) => right.powerScore - left.powerScore)
                .map((alliance) => (
                  <article key={alliance.number} className={styles.powerCard}>
                    <div className={styles.powerTitle}>
                      <strong>{alliance.name}</strong>
                      <span>{alliance.outlook}</span>
                    </div>
                    <div className={styles.powerMeta}>
                      <span>{alliance.team1}</span>
                      <span>{alliance.team2}</span>
                    </div>
                    <div className={styles.metricGrid}>
                      <div>
                        <span>联盟总 EPA</span>
                        <strong>{alliance.totalEPA}</strong>
                      </div>
                      <div>
                        <span>预测强度</span>
                        <strong>{alliance.powerScore}</strong>
                      </div>
                      <div>
                        <span>总分</span>
                        <strong>{alliance.totalScore}</strong>
                      </div>
                      <div>
                        <span>净胜分</span>
                        <strong>{alliance.totalNetScore}</strong>
                      </div>
                    </div>
                  </article>
                ))}
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h3>对阵预测</h3>
                <p>按官方固定签位从上到下推演：首轮、四强赛、决赛和最终前三名。</p>
              </div>
            </div>

            <div className={styles.bracketScroller}>
              <div className={styles.bracketBoard}>
                {prediction.rounds.map((round) => (
                  <section key={round.name} className={styles.bracketColumn}>
                    <div className={styles.bracketColumnTitle}>
                      <strong>{round.name}</strong>
                      <span>{round.matches.length} 场</span>
                    </div>
                    <div className={styles.bracketMatchList}>
                      {round.matches.map((match) => (
                        <article key={match.roundName} className={styles.bracketMatch}>
                          <div className={styles.bracketMatchHeader}>
                            <strong>{match.roundName}</strong>
                            <span>强度差 {match.strengthDiff.toFixed(1)}</span>
                          </div>
                          {renderBracketAlliance(match.alliance1, match, styles.redBracketAlliance)}
                          {renderBracketAlliance(match.alliance2, match, styles.blueBracketAlliance)}
                          <p>{match.reason}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}

                <section className={`${styles.bracketColumn} ${styles.medalColumn}`}>
                  <div className={styles.bracketColumnTitle}>
                    <strong>最终结果</strong>
                    <span>冠军 / 亚军 / 季军</span>
                  </div>
                  <div className={styles.medalStack}>
                    <article className={`${styles.medalCard} ${styles.goldMedal}`}>
                      <span>冠军</span>
                      <strong>{prediction.champion?.name}</strong>
                      <em>{prediction.champion ? getAllianceTeams(prediction.champion) : '-'}</em>
                    </article>
                    <article className={`${styles.medalCard} ${styles.silverMedal}`}>
                      <span>亚军</span>
                      <strong>{prediction.runnerUp?.name}</strong>
                      <em>{prediction.runnerUp ? getAllianceTeams(prediction.runnerUp) : '-'}</em>
                    </article>
                    <article className={`${styles.medalCard} ${styles.bronzeMedal}`}>
                      <span>季军</span>
                      <strong>{prediction.thirdPlace?.name ?? '仅四强后生成'}</strong>
                      {prediction.thirdPlace && <em>{getAllianceTeams(prediction.thirdPlace)}</em>}
                    </article>
                  </div>
                </section>
              </div>
            </div>

            {prediction.bronze && (
              <article className={styles.bronzePlayoffCard}>
                <div className={styles.matchHeader}>
                  <strong>{prediction.bronze.roundName}</strong>
                  <span>奖牌判断</span>
                </div>
                <div className={styles.matchTeams}>
                  <div className={prediction.bronze.winner.number === prediction.bronze.alliance1.number ? styles.winnerTeam : styles.teamRow}>
                    <span>{prediction.bronze.alliance1.name}</span>
                    <strong>{getAllianceTeams(prediction.bronze.alliance1)}</strong>
                    <em>{prediction.bronze.alliance1WinRate}%</em>
                  </div>
                  <div className={prediction.bronze.winner.number === prediction.bronze.alliance2.number ? styles.winnerTeam : styles.teamRow}>
                    <span>{prediction.bronze.alliance2.name}</span>
                    <strong>{getAllianceTeams(prediction.bronze.alliance2)}</strong>
                    <em>{prediction.bronze.alliance2WinRate}%</em>
                  </div>
                </div>
                <p className={styles.matchReason}>{prediction.bronze.reason}</p>
              </article>
            )}
          </section>
        </>
      )}
    </div>
  );
}
