# 三实例 Admin 原地迁移规则

P0-007E 接受后，Info、Knowledge、Research 必须按 `Knowfeed -> Knowbase -> Research`
串行原地替换现有 Admin 前端。每个实例完整继承模板能力后，再恢复本实例领域路由、
DTO 与 API adapter。

禁止：

- 只复制 Shell 或安全头而省略通用能力。
- 创建新的业务仓库绕开原地迁移。
- 把某一实例的领域 DTO、菜单或文案带入模板或其他实例。
- 用 fixture、静态页面或前端按钮替代真实 FastAPI 鉴权、幂等和并发控制。
- 三实例尚未完成模板同步时继续后续业务功能开发。

每个实例必须记录迁移前 tag/gitlink/digest、模板 commit、实例 commit、候选 digest、
严格 TLS、真实配对、负例、滚动/回滚及清理证据。
