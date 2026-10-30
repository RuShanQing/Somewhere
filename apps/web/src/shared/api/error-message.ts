import { ApiError } from './client';

const FIELD_LABELS: Record<string, string> = {
  email: '邮箱',
  password: '密码（至少 12 个字符）',
  nickname: '昵称（1–32 个字符）',
  adultConfirmed: '成年人声明',
  cityId: '城市',
  receptionMode: '接信状态',
  body: '提交内容',
  recipientId: '收件人',
  recipient: '收件人',
  senderCity: '你的城市',
  idempotencyKey: '请求标识',
  title: '标题',
  topicTags: '主题标签',
  cursor: '翻页位置',
};

function describeValidationDetails(details: string[] | undefined): string | null {
  if (!details || details.length === 0) {
    return null;
  }
  const fields = Array.from(new Set(details.map((item) => item.split(':')[0] ?? item)))
    .map((field) => FIELD_LABELS[field] ?? field)
    .filter((label) => label.length > 0);
  if (fields.length === 0) {
    return null;
  }
  return `请检查：${fields.join('、')}`;
}

/** 把 API 错误转换成对用户安全、可行动的提示；不回显输入值。 */
export function toFriendlyAuthMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'AUTH_INVALID_CREDENTIALS':
        return '邮箱或密码不正确。';
      case 'REGISTRATION_CONFLICT':
        return '无法完成注册，请检查填写内容或直接登录。';
      case 'VALIDATION_ERROR':
        return describeValidationDetails(error.details) ?? '请检查填写内容后重试。';
      case 'RATE_LIMITED':
        return '尝试次数过多，请稍后再试。';
      case 'ORIGIN_NOT_ALLOWED':
        return '当前页面来源不被允许，请从 Somewhere 页面重试。';
      case 'CONTACT_BLOCKED':
        return '当前无法与这位用户联系。若你曾封锁对方，可在设置中解除。';
      case 'SERVICE_UNAVAILABLE':
        return '服务暂时不可用，请稍后再试。';
      default:
        return error.message;
    }
  }
  return '网络暂时不可用，请稍后再试。';
}
