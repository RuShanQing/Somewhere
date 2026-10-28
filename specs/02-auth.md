# AUTH · 注册、登录和会话

**优先级：P0** · 归属：AuthModule / Web Auth 页面  
首个实现任务：`tasks/current.md` 的 TASK-001。

> 实现状态（2026-10-28）：TASK-001 完成注册/登录/会话/退出；TASK-002 完成响应字段收敛与单活动会话。邮箱验证、找回密码、设备会话管理、账号删除仍未实现（见 AUTH-07）。

## AUTH-01 业务目标

允许成年人创建账号、登录、刷新页面保留会话、主动退出；用户能安全访问自己的私人邮局。注册登录是基础设施，不与任何共途或信友关系绑定。

## AUTH-02 输入、字段与基础规则

- 注册：`email`（正规化并唯一）、`password`（最少 12 字符，支持较长密码）、`nickname`（1–32 可显示字符）、`adultConfirmed=true`。
- 登录：`email + password`；失败提示不得区分“账户不存在”和“密码错误”。
- 邮箱不是公开昵称，不返回给其他用户。
- `users.password_hash` 采用 Argon2id；任何日志、审计或异常不得包含明文密码。
- 首阶段保留 `email_verified_at` 字段；邮箱验证可在公开投递前单独完成。TASK-001 不依赖真实发件服务。
- 不提供手机号、人脸、身份证或第三方 OAuth 作为首阶段必需条件。
- 公开上线前应完善邮件验证和找回密码机制；没有这些能力的演示版本不得宣称适合直接对公众部署。

## AUTH-03 API

| Method | URL | 说明 |
|---|---|---|
| POST | `/api/v1/auth/register` | 创建账户；重复提交不会创建第二个账户 |
| POST | `/api/v1/auth/login` | 创建服务器会话并设置 Cookie |
| POST | `/api/v1/auth/logout` | 撤销当前会话并清理 Cookie |
| GET | `/api/v1/auth/me` | 返回当前用户的最小个人资料或 401 |

成功响应：注册与登录返回 `{ id, nickname, cityId?, emailVerified }`，**不返回 email**；`GET /auth/me` 额外返回本人 `email`（未来的本人设置接口同理）。邮箱不返回给其他用户。所有请求参数经 DTO 验证。

错误示例：
- `VALIDATION_ERROR`（422）；`REGISTRATION_CONFLICT`（409，文案不明确指明邮箱存在）。
- `AUTH_INVALID_CREDENTIALS`（401，统一错误）。
- `AUTH_REQUIRED`（401）；`RATE_LIMITED`（429）。

## AUTH-04 Session 与安全

- 服务端生成密码学安全随机 Session Token，仅通过 `HttpOnly` Cookie 交给浏览器；数据库只存 Token 哈希。
- 生产必须 `Secure` + HTTPS，`SameSite=Lax`，明确过期与登出吊销；本机纯 HTTP 可有受控的开发专用配置。
- 写请求具备 CSRF 保护或严格 Origin 校验；不在 localStorage/sessionStorage 放 Session Token。
- 登录成功应旋转会话标识；主动退出使服务端会话无法再次使用。
- 采用**单活动会话**策略：登录成功后创建新会话并撤销该用户其他活动会话，旧设备再访问受保护接口即返回 401。同一账号多设备同时在线不在本阶段范围内。
- 会话使用固定有效期（当前 7 天），不做滑动续期；过期后回到匿名状态。
- 对注册/登录 IP + 邮箱维度实施合理限流；不要无界地保存失败密码或个人信息。当前限流为单实例内存实现，部署在反向代理后必须先配置可信代理，避免所有请求共享代理 IP。

## AUTH-05 状态

`ANONYMOUS → AUTHENTICATED → REVOKED/EXPIRED`。刷新页面不得产生新的隐式登录；Session 过期后应回到匿名状态。`emailVerified` 是账户属性，不是新的会话状态。

## AUTH-06 验收（TDD + 独立旁路）

- 新用户注册只生成一条数据库记录、密码存哈希。
- 相同邮箱的不同大小写与空格写法不会创建重复账号。
- 注册与登录响应不包含 email、密码哈希或会话 Token；只有 `/auth/me` 返回本人 email。
- 正确密码登录，刷新后 `/auth/me` 仍为本人；错误密码拒绝。
- 同一账号再次登录成功后，旧会话 Cookie 立即无法访问 `/auth/me`，数据库中该用户只保留一个活动会话。
- 退出后旧会话失效；直接访问私人 API 返回 401。
- 未携带有效凭据的用户无法进入私人业务页面。
- 注册输入、错误次数、邮箱与密码长度符合约定。
- 在前端本地存储、浏览器 URL、后端日志中找不到会话明文或密码。

## AUTH-07 后续、不在 TASK-001 / TASK-002

邮箱验证、密码重置、设备会话管理和更完善的账号删除属于后续单独任务；需要相应 Spec 更新后才实施。首阶段不可伪造这些能力已经存在。
