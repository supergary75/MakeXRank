import { useEffect, useMemo, useState } from 'react';
import type { EventType, NotificationType, PlayoffPrediction, TeamRaw } from '../../types';
import { calculateRanking, sortTeams } from '../../utils/rankingAlgorithm';
import {
  buildAlliancesFromDrafts,
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

const EMPTY_DRAFTS: AllianceDraftState[] = [
  { number: 1, team1: '', team2: '' },
  { number: 2, team1: '', team2: '' },
  { number: 3, team1: '', team2: '' },
  { number: 4, team1: '', team2: '' },
];

function getTopSeededTeams(teamsData: TeamRaw[], eventType: EventType) {
  return sortTeams(
    calculateRanking(teamsData, eventType),
    'totalWinLossScore',
    'desc',
    eventType,
  ).slice(0, 8);
}

function buildDraftMap(drafts: AllianceDraftState[]) {
  return new Map(drafts.map((draft) => [draft.number, draft]));
}

export function PlayoffView({ eventType, teamsData, showNotification }: Props) {
  const [clipboardInput, setClipboardInput] = useState('');
  const [drafts, setDrafts] = useState<AllianceDraftState[]>(EMPTY_DRAFTS);
  const [prediction, setPrediction] = useState<PlayoffPrediction | null>(null);

  const topSeededTeams = useMemo(
    () => getTopSeededTeams(teamsData, eventType),
    [eventType, teamsData],
  );

  useEffect(() => {
    if (topSeededTeams.length < 8) {
      setDrafts(EMPTY_DRAFTS);
      setPrediction(null);
      return;
    }

    setDrafts(createSuggestedAllianceDrafts(topSeededTeams));
  }, [topSeededTeams]);

  const currentAlliances = useMemo(() => {
    try {
      return buildAlliancesFromDrafts(drafts, topSeededTeams);
    } catch {
      return [];
    }
  }, [drafts, topSeededTeams]);

  const handleDraftChange = (number: number, field: 'team1' | 'team2', value: string) => {
    setDrafts((previous) =>
      previous.map((draft) => (draft.number === number ? { ...draft, [field]: value } : draft)),
    );
  };

  const handleFillSuggested = () => {
    if (topSeededTeams.length < 8) {
      showNotification('当前前八数据不足，暂时无法自动预填联盟。', 'error');
      return;
    }

    setDrafts(createSuggestedAllianceDrafts(topSeededTeams));
    setPrediction(null);
    showNotification('已按前八顺位生成一版默认联盟预览。', 'success');
  };

  const handleClearDrafts = () => {
    setDrafts(EMPTY_DRAFTS);
    setPrediction(null);
    showNotification('已清空当前联盟预览。', 'info');
  };

  const handleLoadClipboard = () => {
    if (!clipboardInput.trim()) {
      showNotification('请先粘贴联盟选择表，再导入。', 'error');
      return;
    }

    if (topSeededTeams.length < 8) {
      showNotification('请先保证当前比赛已经有完整的排位赛前八数据。', 'error');
      return;
    }

    try {
      const alliances = parseAllianceData(clipboardInput, topSeededTeams);
      if (alliances.length < 4) {
        showNotification('没有识别到完整的四个联盟，请检查粘贴内容。', 'error');
        return;
      }

      const draftMap = buildDraftMap(drafts);
      setDrafts(
        alliances.slice(0, 4).map((alliance) => ({
          number: alliance.number,
          team1: alliance.team1,
          team2: alliance.team2,
        })).map((draft) => draftMap.get(draft.number) ? draft : draft),
      );
      setPrediction(generatePlayoffPrediction(alliances.slice(0, 4)));
      showNotification('已从联盟选择表导入，并生成淘汰赛预测。', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      showNotification(`联盟导入失败：${message}`, 'error');
    }
  };

  const handleGeneratePrediction = () => {
    if (topSeededTeams.length < 8) {
      showNotification('当前比赛还没有完整前八队伍，暂时无法预测淘汰赛。', 'error');
      return;
    }

    const selectedTeams = drafts.flatMap((draft) => [draft.team1, draft.team2]).filter(Boolean);
    if (selectedTeams.length !== 8) {
      showNotification('请先为四个联盟都选择两支队伍。', 'error');
      return;
    }

    if (new Set(selectedTeams).size !== selectedTeams.length) {
      showNotification('联盟中存在重复队伍，请调整后再生成预测。', 'error');
      return;
    }

    try {
      const alliances = buildAlliancesFromDrafts(drafts, topSeededTeams);
      if (alliances.length < 4) {
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
            先用排位赛前八和联盟选择结果做一版本地预测。
            当前版本以联盟总 EPA 为主，再综合总分、净胜分和种子质量判断半决赛、决赛与季军战。
          </p>
        </div>
        <div className={styles.heroBadges}>
          <span>EPA 主导</span>
          <span>联盟手动搭配</span>
          <span>本地即时预览</span>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h3>排位赛前八种子</h3>
            <p>这里展示当前比赛的前八队伍，联盟预测默认只在这 8 支队伍中进行。</p>
          </div>
          <button className={styles.secondaryButton} onClick={handleFillSuggested}>
            按前八顺位预填联盟
          </button>
        </div>

        <div className={styles.seedGrid}>
          {topSeededTeams.map((team, index) => (
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
            <p>可以直接手动选择四个联盟，也可以粘贴联盟选择表自动带入。</p>
          </div>
          <button className={styles.secondaryButton} onClick={handleClearDrafts}>
            清空联盟
          </button>
        </div>

        <div className={styles.allianceGrid}>
          {drafts.map((draft) => (
            <article key={draft.number} className={styles.allianceCard}>
              <div className={styles.allianceHeader}>
                <strong>联盟 {draft.number}</strong>
                <span>
                  {currentAlliances.find((alliance) => alliance.number === draft.number)?.outlook ?? '等待选择'}
                </span>
              </div>

              <label className={styles.selectBlock}>
                <span>战队 1</span>
                <select
                  value={draft.team1}
                  onChange={(event) => handleDraftChange(draft.number, 'team1', event.target.value)}
                >
                  <option value="">请选择队伍</option>
                  {topSeededTeams.map((team) => (
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
                  {topSeededTeams.map((team) => (
                    <option key={`${draft.number}-b-${team.team}`} value={team.team}>
                      {team.team}
                    </option>
                  ))}
                </select>
              </label>

              {currentAlliances.find((alliance) => alliance.number === draft.number) && (
                <div className={styles.allianceStats}>
                  <span>
                    联盟总 EPA {currentAlliances.find((alliance) => alliance.number === draft.number)?.totalEPA}
                  </span>
                  <span>
                    预测强度 {currentAlliances.find((alliance) => alliance.number === draft.number)?.powerScore}
                  </span>
                </div>
              )}
            </article>
          ))}
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
                <p>先给出半决赛，再自动推演冠军战和季军战。</p>
              </div>
            </div>

            <div className={styles.matchGrid}>
              {prediction.semifinals.map((match) => (
                <article key={match.roundName} className={styles.matchCard}>
                  <div className={styles.matchHeader}>
                    <strong>{match.roundName}</strong>
                    <span>强度差 {match.strengthDiff.toFixed(1)}</span>
                  </div>
                  <div className={styles.matchTeams}>
                    <div className={match.winner.number === match.alliance1.number ? styles.winnerTeam : styles.teamRow}>
                      <span>{match.alliance1.name}</span>
                      <strong>{match.alliance1.team1} + {match.alliance1.team2}</strong>
                      <em>{match.alliance1WinRate}%</em>
                    </div>
                    <div className={match.winner.number === match.alliance2.number ? styles.winnerTeam : styles.teamRow}>
                      <span>{match.alliance2.name}</span>
                      <strong>{match.alliance2.team1} + {match.alliance2.team2}</strong>
                      <em>{match.alliance2WinRate}%</em>
                    </div>
                  </div>
                  <p className={styles.matchReason}>{match.reason}</p>
                </article>
              ))}

              {prediction.final && (
                <article className={styles.matchCard}>
                  <div className={styles.matchHeader}>
                    <strong>{prediction.final.roundName}</strong>
                    <span>冠军倾向</span>
                  </div>
                  <div className={styles.matchTeams}>
                    <div className={prediction.final.winner.number === prediction.final.alliance1.number ? styles.winnerTeam : styles.teamRow}>
                      <span>{prediction.final.alliance1.name}</span>
                      <strong>{prediction.final.alliance1.team1} + {prediction.final.alliance1.team2}</strong>
                      <em>{prediction.final.alliance1WinRate}%</em>
                    </div>
                    <div className={prediction.final.winner.number === prediction.final.alliance2.number ? styles.winnerTeam : styles.teamRow}>
                      <span>{prediction.final.alliance2.name}</span>
                      <strong>{prediction.final.alliance2.team1} + {prediction.final.alliance2.team2}</strong>
                      <em>{prediction.final.alliance2WinRate}%</em>
                    </div>
                  </div>
                  <p className={styles.matchReason}>{prediction.final.reason}</p>
                </article>
              )}

              {prediction.bronze && (
                <article className={styles.matchCard}>
                  <div className={styles.matchHeader}>
                    <strong>{prediction.bronze.roundName}</strong>
                    <span>奖牌判断</span>
                  </div>
                  <div className={styles.matchTeams}>
                    <div className={prediction.bronze.winner.number === prediction.bronze.alliance1.number ? styles.winnerTeam : styles.teamRow}>
                      <span>{prediction.bronze.alliance1.name}</span>
                      <strong>{prediction.bronze.alliance1.team1} + {prediction.bronze.alliance1.team2}</strong>
                      <em>{prediction.bronze.alliance1WinRate}%</em>
                    </div>
                    <div className={prediction.bronze.winner.number === prediction.bronze.alliance2.number ? styles.winnerTeam : styles.teamRow}>
                      <span>{prediction.bronze.alliance2.name}</span>
                      <strong>{prediction.bronze.alliance2.team1} + {prediction.bronze.alliance2.team2}</strong>
                      <em>{prediction.bronze.alliance2WinRate}%</em>
                    </div>
                  </div>
                  <p className={styles.matchReason}>{prediction.bronze.reason}</p>
                </article>
              )}
            </div>

            <div className={styles.podium}>
              <article className={styles.podiumCard}>
                <span>预测冠军</span>
                <strong>{prediction.champion?.name}</strong>
                <em>{prediction.champion?.team1} + {prediction.champion?.team2}</em>
              </article>
              <article className={styles.podiumCard}>
                <span>预测亚军</span>
                <strong>{prediction.runnerUp?.name}</strong>
                <em>{prediction.runnerUp?.team1} + {prediction.runnerUp?.team2}</em>
              </article>
              <article className={styles.podiumCard}>
                <span>预测季军</span>
                <strong>{prediction.thirdPlace?.name}</strong>
                <em>{prediction.thirdPlace?.team1} + {prediction.thirdPlace?.team2}</em>
              </article>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
