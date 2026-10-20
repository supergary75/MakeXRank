import { describe, expect, it, vi } from 'vitest';
import type { EventType, ViewMode } from '../types';
import { listenForNavigation, navigationHash, parseNavigationHash } from './navigation';

const views: ViewMode[] = ['work-hub', 'coach-workbench', 'weekly-roll-call', 'attendance-dashboard', 'training-event', 'logistics-event', 'competition'];
const events: EventType[] = ['MakeX Inspire', 'MakeX Explorer', 'MakeX Challenge'];
const read = (hash: string, fallback: ViewMode = 'work-hub') => parseNavigationHash(hash, views, events, fallback);

describe('browser hash navigation', () => {
  it('reads workbench, roll call and attendance summary links after the app is already open', () => {
    for (const view of ['coach-workbench', 'weekly-roll-call', 'attendance-dashboard']) {
      expect(read(`#view=${view}`).viewMode).toBe(view);
    }
  });

  it('round-trips all detail context, including encoded group names and competition tabs', () => {
    const snapshot = read('#view=logistics-event&competition=c-1&logisticsEvent=l-1&logisticsItem=MakeX+Explorer小学组&trainingEvent=t-1&rosterSource=r-1&event=MakeX+Explorer&tab=playoff');
    expect(snapshot).toEqual({viewMode:'logistics-event', activeCompetitionId:'c-1', activeLogisticsEventId:'l-1', activeLogisticsEventItem:'MakeX Explorer小学组', activeTrainingEventId:'t-1', activeLogisticsRosterSourceId:'r-1', selectedEventType:'MakeX Explorer', activeTab:'playoff'});
    expect(read(navigationHash(snapshot))).toEqual(snapshot);
    expect(read('#view=competition&tab=focusSchedule').activeTab).toBe('focusSchedule');
  });

  it('clears stale detail context when a new entry does not contain it', () => {
    const snapshot = read('#view=weekly-roll-call');
    expect(snapshot.activeCompetitionId).toBeNull();
    expect(snapshot.activeTrainingEventId).toBeNull();
    expect(snapshot.activeLogisticsEventId).toBeNull();
    expect(snapshot.activeLogisticsEventItem).toBeNull();
    expect(snapshot.activeLogisticsRosterSourceId).toBeNull();
    expect(snapshot.selectedEventType).toBeNull();
    expect(snapshot.activeTab).toBe('ranking');
    expect(navigationHash(snapshot)).toBe('#view=weekly-roll-call');
  });

  it('rejects unknown views, event types and tabs while retaining the installed-app fallback', () => {
    expect(read('#view=unknown&event=unknown&tab=unknown')).toMatchObject({viewMode:'work-hub',selectedEventType:null,activeTab:'ranking'});
    expect(read('', 'coach-workbench').viewMode).toBe('coach-workbench');
  });

  it('responds to hash changes and browser back/forward, then removes both listeners on unmount', () => {
    const target = new EventTarget();
    let hash = '#view=work-hub';
    const onNavigate = vi.fn(() => read(hash));
    const stop = listenForNavigation(target, onNavigate);
    hash = '#view=weekly-roll-call';
    target.dispatchEvent(new Event('hashchange'));
    expect(onNavigate.mock.results[0].value.viewMode).toBe('weekly-roll-call');
    hash = '#view=attendance-dashboard';
    target.dispatchEvent(new Event('popstate'));
    expect(onNavigate.mock.results[1].value.viewMode).toBe('attendance-dashboard');
    stop();
    target.dispatchEvent(new Event('hashchange'));
    target.dispatchEvent(new Event('popstate'));
    expect(onNavigate).toHaveBeenCalledTimes(2);
  });
});
