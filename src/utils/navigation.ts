import type { EventType, TabName, ViewMode } from '../types';

export interface NavigationSnapshot {
  viewMode: ViewMode;
  activeCompetitionId: string | null;
  activeLogisticsEventId: string | null;
  activeLogisticsEventItem: string | null;
  activeTrainingEventId: string | null;
  activeLogisticsRosterSourceId: string | null;
  selectedEventType: EventType | null;
  activeTab: TabName;
}

export function parseNavigationHash(hash: string, views: readonly ViewMode[], events: readonly EventType[], fallback: ViewMode): NavigationSnapshot {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const view = params.get('view') as ViewMode | null;
  const event = params.get('event') as EventType | null;
  const tab = params.get('tab');
  return {
    viewMode: view && views.includes(view) ? view : fallback,
    activeCompetitionId: params.get('competition'),
    activeLogisticsEventId: params.get('logisticsEvent'),
    activeLogisticsEventItem: params.get('logisticsItem'),
    activeTrainingEventId: params.get('trainingEvent'),
    activeLogisticsRosterSourceId: params.get('rosterSource'),
    selectedEventType: event && events.includes(event) ? event : null,
    activeTab: tab === 'playoff' || tab === 'focusSchedule' ? tab : 'ranking',
  };
}

export function navigationHash(snapshot: NavigationSnapshot): string {
  const params = new URLSearchParams();
  params.set('view', snapshot.viewMode);
  if (snapshot.activeCompetitionId) params.set('competition', snapshot.activeCompetitionId);
  if (snapshot.activeLogisticsEventId) params.set('logisticsEvent', snapshot.activeLogisticsEventId);
  if (snapshot.activeLogisticsEventItem) params.set('logisticsItem', snapshot.activeLogisticsEventItem);
  if (snapshot.activeTrainingEventId) params.set('trainingEvent', snapshot.activeTrainingEventId);
  if (snapshot.activeLogisticsRosterSourceId) params.set('rosterSource', snapshot.activeLogisticsRosterSourceId);
  if (snapshot.selectedEventType) params.set('event', snapshot.selectedEventType);
  if (snapshot.activeTab !== 'ranking') params.set('tab', snapshot.activeTab);
  return `#${params.toString()}`;
}

export function listenForNavigation(target: Pick<Window, 'addEventListener' | 'removeEventListener'>, onNavigate: () => void): () => void {
  target.addEventListener('hashchange', onNavigate);
  target.addEventListener('popstate', onNavigate);
  return () => {
    target.removeEventListener('hashchange', onNavigate);
    target.removeEventListener('popstate', onNavigate);
  };
}
