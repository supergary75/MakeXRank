import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './SimulationSystem.module.css';

type Screen = 'setup' | 'checkin' | 'match';
type Alliance = 'red' | 'blue';
type Penalty = 'foul' | 'yellow' | 'red';
type MatchPhase = 'opening' | 'transition' | 'auto' | 'manual-wait' | 'manual' | 'finished';

interface TeamState {
  id: string;
  alliance: Alliance;
  number: string;
  name: string;
  penalties: Record<Penalty, number>;
}

export interface SimulationSourceEvent {
  id: string;
  name: string;
  participants: Array<{
    id: string;
    name: string;
    role: string;
    eventItem: string;
    teamNo: string;
    teamName: string;
  }>;
}

interface SourceTeam {
  key: string;
  number: string;
  name: string;
  eventItem: string;
}

interface SimulationSystemProps {
  sourceEvents: SimulationSourceEvent[];
}

const EVENT_OPTIONS = [
  'MakeX Inspire 智慧物流',
  'MakeX Challenge 乘胜追机',
  'MakeX Explorer 数智先锋',
];

const INITIAL_TEAMS: TeamState[] = [
  { id: 'red-1', alliance: 'red', number: 'X10001', name: '红方战队1', penalties: { foul: 0, yellow: 0, red: 0 } },
  { id: 'red-2', alliance: 'red', number: 'X10002', name: '红方战队2', penalties: { foul: 0, yellow: 0, red: 0 } },
  { id: 'blue-1', alliance: 'blue', number: 'X10003', name: '蓝方战队1', penalties: { foul: 0, yellow: 0, red: 0 } },
  { id: 'blue-2', alliance: 'blue', number: 'X10004', name: '蓝方战队2', penalties: { foul: 0, yellow: 0, red: 0 } },
];

const OPENING_STAGE_SECONDS = 20;
const TRANSITION_SECONDS = 1;
const AUTO_STAGE_SECONDS = 30;
const MANUAL_STAGE_SECONDS = 3 * 60 + 30;
const TOTAL_SECONDS = OPENING_STAGE_SECONDS + AUTO_STAGE_SECONDS + MANUAL_STAGE_SECONDS;

function formatClock(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

export function SimulationSystem({ sourceEvents }: SimulationSystemProps) {
  const [screen, setScreen] = useState<Screen>('setup');
  const [eventName, setEventName] = useState(EVENT_OPTIONS[2]);
  const [matchType, setMatchType] = useState('资格赛 / 淘汰赛');
  const [sourceEventId, setSourceEventId] = useState('');
  const [teams, setTeams] = useState<TeamState[]>(INITIAL_TEAMS);
  const [remaining, setRemaining] = useState(TOTAL_SECONDS);
  const [phase, setPhase] = useState<MatchPhase>('opening');
  const [phaseRemaining, setPhaseRemaining] = useState(OPENING_STAGE_SECONDS);
  const [running, setRunning] = useState(false);
  const [preStartCountdown, setPreStartCountdown] = useState<number | null>(null);
  const [manualPreStartCountdown, setManualPreStartCountdown] = useState<number | null>(null);
  const lastCountdownSpoken = useRef<string | null>(null);

  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const chineseVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith('zh'));
    const preferredMaleVoice = chineseVoices.find((voice) =>
      /yunxi|yunjian|yunyang|kangkang|male|男声|男/i.test(voice.name),
    );
    const fallbackChineseVoice = chineseVoices.find((voice) => voice.lang.toLowerCase() === 'zh-cn')
      ?? chineseVoices[0];
    utterance.voice = preferredMaleVoice ?? fallbackChineseVoice ?? null;
    utterance.lang = 'zh-CN';
    utterance.rate = 0.82;
    utterance.pitch = preferredMaleVoice ? 0.92 : 0.78;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (preStartCountdown === null) return;
    if (preStartCountdown === 0) {
      speak('比赛开始，按键启动加抽签阶段开始');
      setPreStartCountdown(null);
      setRunning(true);
      return;
    }
    speak(String(preStartCountdown));
    const timer = window.setTimeout(() => setPreStartCountdown((value) => value === null ? null : value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [preStartCountdown]);

  useEffect(() => {
    if (manualPreStartCountdown === null) return;
    if (manualPreStartCountdown === 0) {
      speak('手动控制阶段开始');
      setManualPreStartCountdown(null);
      setPhase('manual');
      setRunning(true);
      return;
    }
    speak(String(manualPreStartCountdown));
    const timer = window.setTimeout(() => setManualPreStartCountdown((value) => value === null ? null : value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [manualPreStartCountdown]);

  useEffect(() => {
    if (!running || phase === 'manual-wait' || phase === 'finished') return;
    const timer = window.setTimeout(() => {
      if (phase !== 'transition') setRemaining((value) => Math.max(0, value - 1));
      setPhaseRemaining((value) => {
        if (value > 1) return value - 1;
        lastCountdownSpoken.current = null;
        if (phase === 'opening') {
          setPhase('transition');
          return TRANSITION_SECONDS;
        }
        if (phase === 'transition') {
          speak('自动阶段开始');
          setPhase('auto');
          return AUTO_STAGE_SECONDS;
        }
        if (phase === 'auto') {
          speak('自动阶段结束，请裁判启动手动控制阶段');
          setPhase('manual-wait');
          setRunning(false);
          return MANUAL_STAGE_SECONDS;
        }
        setPhase('finished');
        setRunning(false);
        return 0;
      });
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [phase, phaseRemaining, running]);

  const elapsed = TOTAL_SECONDS - remaining;
  const stage = phase === 'opening' ? '按键启动 + 抽签阶段'
    : phase === 'transition' ? '阶段切换'
      : phase === 'auto' ? '自动阶段'
        : phase === 'manual-wait' ? '手动控制阶段 · 等待裁判启动'
          : phase === 'manual' ? '手动控制阶段' : '比赛结束';
  const stageRemaining = phaseRemaining;
  const progress = Math.min(100, (elapsed / TOTAL_SECONDS) * 100);
  const allianceSummary = useMemo(() => `${teams.length} 支战队`, [teams.length]);
  const sourceTeams = useMemo(() => {
    const source = sourceEvents.find((event) => event.id === sourceEventId);
    if (!source) return [];
    const unique = new Map<string, SourceTeam>();
    source.participants.filter((participant) => participant.role === '队员').forEach((participant) => {
      const number = participant.teamNo.trim();
      const name = participant.teamName.trim();
      if (!number && !name) return;
      const key = `${participant.eventItem}::${number}::${name}`;
      if (!unique.has(key)) unique.set(key, { key, number, name: name || number, eventItem: participant.eventItem });
    });
    const selectedSeries = eventName.includes('Explorer') ? 'Explorer' : eventName.includes('Inspire') ? 'Inspire' : 'Challenge';
    const matching = Array.from(unique.values()).filter((team) => !team.eventItem || team.eventItem.includes(selectedSeries));
    return matching.length > 0 ? matching : Array.from(unique.values());
  }, [eventName, sourceEventId, sourceEvents]);

  useEffect(() => {
    if (!running) return;
    if ((phase === 'opening' || phase === 'auto' || phase === 'manual') && phaseRemaining >= 1 && phaseRemaining <= 5) {
      const countdownKey = `${phase}-${phaseRemaining}`;
      if (lastCountdownSpoken.current !== countdownKey) {
        lastCountdownSpoken.current = countdownKey;
        speak(String(phaseRemaining));
      }
    }
  }, [phase, phaseRemaining, running]);

  const updateTeam = (id: string, patch: Partial<TeamState>) => {
    setTeams((current) => current.map((team) => (team.id === id ? { ...team, ...patch } : team)));
  };

  const selectSourceTeam = (slotId: string, sourceKey: string) => {
    const selected = sourceTeams.find((team) => team.key === sourceKey);
    if (!selected) return;
    updateTeam(slotId, { number: selected.number, name: selected.name });
  };

  const addPenalty = (id: string, penalty: Penalty) => {
    setTeams((current) => current.map((team) => team.id === id
      ? { ...team, penalties: { ...team.penalties, [penalty]: team.penalties[penalty] + 1 } }
      : team));
  };

  const resetMatch = () => {
    setRunning(false);
    setPreStartCountdown(null);
    setManualPreStartCountdown(null);
    setRemaining(TOTAL_SECONDS);
    setPhase('opening');
    setPhaseRemaining(OPENING_STAGE_SECONDS);
    lastCountdownSpoken.current = null;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setTeams((current) => current.map((team) => ({ ...team, penalties: { foul: 0, yellow: 0, red: 0 } })));
  };

  const handlePlayToggle = () => {
    if (running) {
      setRunning(false);
      return;
    }
    if (phase === 'opening' && remaining === TOTAL_SECONDS) {
      lastCountdownSpoken.current = null;
      setPreStartCountdown(5);
      return;
    }
    if (phase === 'manual-wait') {
      lastCountdownSpoken.current = null;
      setManualPreStartCountdown(5);
      return;
    }
    setRunning(true);
  };

  return (
    <div className={styles.shell}>
      {preStartCountdown !== null && createPortal(
        <div className={styles.preStartOverlay} role="status" aria-live="assertive">
          <span>比赛即将开始</span>
          <strong>{preStartCountdown || 'GO'}</strong>
          <small>准备进入按键启动 + 抽签阶段</small>
        </div>,
        document.body,
      )}
      {manualPreStartCountdown !== null && createPortal(
        <div className={styles.preStartOverlay} role="status" aria-live="assertive">
          <span>手动控制阶段即将开始</span>
          <strong>{manualPreStartCountdown || 'GO'}</strong>
          <small>裁判启动倒计时</small>
        </div>,
        document.body,
      )}
      <nav className={styles.steps} aria-label="模拟赛事流程">
        {[
          ['setup', '1', '赛事设置'],
          ['checkin', '2', '战队签到'],
          ['match', '3', '比赛控制'],
        ].map(([key, order, label]) => (
          <button
            key={key}
            className={`${styles.step} ${screen === key ? styles.stepActive : ''}`}
            onClick={() => setScreen(key as Screen)}
            type="button"
          >
            <span>{order}</span>{label}
          </button>
        ))}
      </nav>

      {screen === 'setup' && (
        <section className={styles.panel}>
          <div className={styles.sectionHeading}>
            <div><small>Competition Setup</small><h2>选择赛事模式</h2></div>
            <span className={styles.statusDot}>本地模拟</span>
          </div>
          <div className={styles.modeGrid}>
            <div className={styles.setupForm}>
              <label><span>比赛类型</span><input value={matchType} onChange={(event) => setMatchType(event.target.value)} /></label>
              <label>
                <span>调用后勤赛事赛队</span>
                <select value={sourceEventId} onChange={(event) => setSourceEventId(event.target.value)}>
                  <option value="">不调用，手动填写战队</option>
                  {sourceEvents.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
                </select>
              </label>
              {sourceEventId && <small className={styles.sourceHint}>已读取 {sourceTeams.length} 支可用战队，下一步可在红蓝方位置直接选择。</small>}
              <div className={styles.eventList}>
                {EVENT_OPTIONS.map((option) => {
                  const isAvailable = option.includes('Explorer');
                  return (
                    <button
                      key={option}
                      type="button"
                      className={`${eventName === option ? styles.eventActive : ''} ${!isAvailable ? styles.eventDisabled : ''}`}
                      onClick={() => setEventName(option)}
                      disabled={!isAvailable}
                    >
                      <span>{option}{!isAvailable ? '（待开发中…）' : ''}</span><i />
                    </button>
                  );
                })}
              </div>
              <button className={styles.primaryButton} type="button" onClick={() => setScreen('checkin')}>确认并进入战队签到</button>
            </div>
          </div>
        </section>
      )}

      {screen === 'checkin' && (
        <section className={styles.panel}>
          <div className={styles.sectionHeading}>
            <div><small>Team Check-in</small><h2>战队签到</h2></div>
            <span className={styles.statusDot}>{allianceSummary}</span>
          </div>
          <div className={styles.teamGrid}>
            {teams.map((team) => (
              <article key={team.id} className={`${styles.teamCard} ${team.alliance === 'red' ? styles.redCard : styles.blueCard}`}>
                <div className={styles.allianceLabel}>{team.alliance === 'red' ? '红方' : '蓝方'}</div>
                {sourceEventId && (
                  <label><span>从赛事赛队中选择</span><select value="" onChange={(event) => selectSourceTeam(team.id, event.target.value)}><option value="">请选择战队</option>{sourceTeams.map((sourceTeam) => <option key={sourceTeam.key} value={sourceTeam.key}>{sourceTeam.number} · {sourceTeam.name}</option>)}</select></label>
                )}
                <label><span>战队名称</span><input value={team.name} onChange={(event) => updateTeam(team.id, { name: event.target.value })} /></label>
                <label><span>战队编号</span><input value={team.number} onChange={(event) => updateTeam(team.id, { number: event.target.value })} /></label>
              </article>
            ))}
          </div>
          <div className={styles.bottomBar}>
            <div><span>当前赛项</span><strong>{eventName}</strong><small>{matchType}</small></div>
            <button className={styles.primaryButton} type="button" onClick={() => setScreen('match')}>进入比赛控制</button>
          </div>
        </section>
      )}

      {screen === 'match' && (
        <section className={styles.panel}>
          <div className={styles.matchHeader}>
            <div><span>累计时长</span><strong>{formatClock(elapsed)}</strong></div>
            <div><span>总时长</span><strong>{formatClock(TOTAL_SECONDS)}</strong></div>
            <button type="button" onClick={resetMatch}>重置比赛</button>
          </div>
          <div className={styles.progress}><i style={{ width: `${progress}%` }} /></div>
          <div className={styles.matchBoard}>
            <div className={styles.allianceColumns}>
              {(['red', 'blue'] as Alliance[]).map((alliance) => (
                <section key={alliance} className={styles.allianceColumn}>
                  <h3 className={alliance === 'red' ? styles.redHeading : styles.blueHeading}>{alliance === 'red' ? '红方' : '蓝方'}</h3>
                  {teams.filter((team) => team.alliance === alliance).map((team) => (
                    <article key={team.id} className={styles.matchTeam}>
                      <div><strong>{team.number}</strong><span>{team.name}</span></div>
                      <div className={styles.penaltyCounts}>
                        <span>违例 {team.penalties.foul}</span><span>黄牌 {team.penalties.yellow}</span><span>红牌 {team.penalties.red}</span>
                      </div>
                      <div className={styles.penaltyButtons}>
                        <button type="button" onClick={() => addPenalty(team.id, 'foul')}>违例</button>
                        <button type="button" onClick={() => addPenalty(team.id, 'yellow')}>黄牌</button>
                        <button type="button" onClick={() => addPenalty(team.id, 'red')}>红牌</button>
                      </div>
                    </article>
                  ))}
                </section>
              ))}
            </div>
            <div className={styles.timerBlock}>
              <span>{stage}</span>
              <strong>{formatClock(stageRemaining)}</strong>
              <small>{eventName}</small>
            </div>
          </div>
          <div className={styles.matchControls}>
            <button className={styles.secondaryButton} type="button" onClick={resetMatch}>重新开始</button>
            <button className={styles.playButton} type="button" onClick={handlePlayToggle} disabled={phase === 'finished' || preStartCountdown !== null || manualPreStartCountdown !== null}>{running ? '暂停' : phase === 'opening' && remaining === TOTAL_SECONDS ? '开始比赛' : phase === 'manual-wait' ? '裁判启动手动阶段' : '继续比赛'}</button>
          </div>
        </section>
      )}
    </div>
  );
}
