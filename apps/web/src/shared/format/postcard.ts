/** 与服务端一致的 Unicode 码点计数，用于写信页提示，不参与权限或送达判断。 */
export function countPostcardCharacters(value: string): number {
  return Array.from(value).length;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return '尚未确定';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '时间不可用';
  }
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function postcardStatusLabel(status: string): string {
  switch (status) {
    case 'IN_TRANSIT':
      return '正在路上';
    case 'DELIVERED':
      return '已抵达';
    case 'RESTRICTED':
      return '暂时受限';
    default:
      return '未知状态';
  }
}
