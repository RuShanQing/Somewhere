import type {
  PenpalCounterpart,
  PenpalOverview,
} from '../../shared/api/client';

/** 城市只作为公开上下文；没有城市时不拼接空分隔符。 */
export function penpalCityLabel(counterpart: PenpalCounterpart): string {
  return counterpart.city ? ` · ${counterpart.city.name}` : '';
}

export function hasPenpalActivity(overview: PenpalOverview): boolean {
  return (
    overview.active.length > 0 ||
    overview.incoming.length > 0 ||
    overview.outgoing.length > 0
  );
}

export function penpalEmptyDescription(): string {
  return '还没有信友。完成一段共途后，可以在共途详情中请求成为信友；双方分别同意后才会生效。';
}
