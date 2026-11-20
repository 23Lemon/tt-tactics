# 乒乓球发接发技战术分析平台

这个工具帮助球友拆解发球与第三板、接发与第四板，把打得出来的线路存成可回看、可分享的套路。推荐服务于实战预判和训练选择。规则排序是教学判断，尚无实战频率或得分率标定。

新对话接手时，从本文件了解产品和代码入口，再读 [AGENTS.md](AGENTS.md) 的开发规则。涉及模型依据时查 [docs/model-and-design.md](docs/model-and-design.md)，涉及实际行为时以当前源码和对应入口为准。

## 产品流程

- **我发球（`serve`）**。我发球 → 对手接发 → 我的第三板。对手接发建议用于提前预判。
- **我接发（`receive`）**。对手发球 → 我接发 → 对手第三板 → 我的第四板。
- 「对手常用解法」用于「我发球」模式的第二板自动建议。选项按对手正反手的实际胶面显示，默认全选。可取消对方不用的技术。
- 新草稿默认空白，双方默认右手，可独立切换左右手。我方始终在左，对手始终在右，正反手区和侧旋随持拍手换向。
- 「双方设置」可分别配置双方正反手胶皮，默认双反。推荐和球路计算使用本板实际击球面，直拍反手推挡使用正手胶面。
- 发球按手法、旋转、落点渐进选择。顺旋、逆旋、勾手、反手按目录提供合法组合。右手顺旋为左侧旋系，逆旋、勾手、反手的侧旋分支为右侧旋系，左手镜像。「转不转」可选下旋和不转，「奔球」可选上旋和不转。反手也可选纯下旋。
- 每半台有正手、中间、反手与长、短组成的六个落点区，可在区内连续点选和用方向键微调。长短落点区描述首落点，二跳另判。半出台暂未单列为落点区。
- 「发球设置」在折叠时注明横向站位、触球点距离和球速，展开可调整这三项和旋转强度。侧身位到靠反手侧约四分之一台为止，往中间调整最远约到四分之三台。触球点水平距离从球心量到端线，界面默认端线后 10 cm，可调 5–25 cm。拖动站位或距离时，同一行的次要选项虚化，完整球台显示触球点及已有轨迹，滑条保持可用，松手恢复逐板视图。
- 每次只展开当前板。优先展示至多三个建议，更多建议和自选技术按需展开。建议保留借力、发力或控制等信息，「优先预判／优先考虑」是附加标签。自选技术可查询适用性、原因和填写个人叫法。
- 「球路详情」可看完整线路、二跳位置及出边方向，并对比默认「正确处理」与「未补侧旋／当不转接」的轨迹。「找新套路」从实际可行的发球与后续回合生成线路，并避开已有组合。
- 套路库按开局分组，支持分类、模式筛选、想练／在用、笔记、打开编辑和单条 JSON 分享。打开笔记本中的套路时各板默认折叠，点任一可编辑的板次展开。成功保存后回当前模式第一板。改动前一板的技术、站位或落点后，用更新后的来球重新选后续板。

## 仓库与线上版本

| 版本 | 用户入口与数据 | 真正使用的代码入口 |
| --- | --- | --- |
| GitHub Pages | [静态版](https://23lemon.github.io/tt-tactics/)。无需账号。套路存 IndexedDB，按站点路径命名；对手偏好存 localStorage。跨浏览器或设备搬迁套路可导出、导入 JSON。 | [pages/main.jsx](pages/main.jsx) → [pages/rally-workbench.jsx](pages/rally-workbench.jsx)。GitHub `main /docs` 发布。 |
| ChatGPT Site | [账号同步版](https://tt-serve-receive-lab.lemonade23.chatgpt.site)。匿名可分析；登录后套路和对手偏好按账号进 D1。匿名偏好可暂存在本机。 | 现有 **Sites 托管源仓库**的 `app/page.tsx` → `app/rally/rally-workbench.jsx`，通过 `app/rally/storage.mjs` 调用账号 API。项目 ID 为 `appgprj_6af9845eedd481918309c9918898a5e9`。 |

[23Lemon/tt-tactics](https://github.com/23Lemon/tt-tactics) 的 `main` 维护共享核心、Pages 源码和 D1 API 等代码。GitHub 上的 [app/page.tsx](app/page.tsx) 仍调用旧 [app/workbench.jsx](app/workbench.jsx)。线上 Site 逐板界面及其同步适配位于现有托管源仓库。接手 Site 时通过 Sites 工具按项目 ID 获取现有源码。同步两端时核对对应文件差异，保留 Site 的登录、存储、Worker 和托管配置。仓库现有 README 的部分入口说明是历史版本。

## 文件地图

| 位置 | 职责 |
| --- | --- |
| [lib/table-tennis/catalog.mjs](lib/table-tennis/catalog.mjs) | 发球族、技术 ID、分区、左右手坐标、旧记录兼容、步骤校验、开局和套路去重键。 |
| [lib/table-tennis/rubbers.mjs](lib/table-tennis/rubbers.mjs) | 胶面选项、默认值、击球参数及胶面字段校验。 |
| [lib/table-tennis/physics.mjs](lib/table-tennis/physics.mjs) | 三维飞行、球台及胶面碰撞、轨迹逆解、球速旋转和可用触球窗口、二跳和出边。 |
| [lib/table-tennis/tactics.mjs](lib/table-tennis/tactics.mjs) | `readIncoming` 提取来球状态，`assessStroke` 判断适用性，`optionsFor` 检查可行线路并排序，`findIdeas` 推演未保存的套路。 |
| [lib/table-tennis/repertoire.mjs](lib/table-tennis/repertoire.mjs) · [preferences.mjs](lib/table-tennis/preferences.mjs) | 偏好组 ID 和技术映射，浏览器偏好及账号同步协议。 |
| [lib/table-tennis/sharing.mjs](lib/table-tennis/sharing.mjs) | 单条分享及套路库备份的 JSON 导入、导出与校验。 |
| [pages/rally-domain.mjs](pages/rally-domain.mjs) | 草稿状态、逐板推进、回退、落点镜像、连续坐标、上游修改的后续失效、分析结果缓存。Site 有相应的 `app/rally/rally-domain.mjs`。 |
| [pages/rally-workbench.jsx](pages/rally-workbench.jsx) · [pages/rally.css](pages/rally.css) · [app/court.jsx](app/court.jsx) | 逐板视图、半台交互和实时站位预览，完整球台由两版共用。 |
| [pages/routine-manager.jsx](pages/routine-manager.jsx) · [pages/storage.mjs](pages/storage.mjs) · [pages/routine-store.mjs](pages/routine-store.mjs) | Pages 套路库界面、存储适配层和 IndexedDB 事务。 |
| [app/api/routines/route.ts](app/api/routines/route.ts) · [app/api/preferences/route.ts](app/api/preferences/route.ts) · [app/chatgpt-auth.ts](app/chatgpt-auth.ts) | Site 账号写入、读取、冲突检测和 Sign in with ChatGPT。 |
| [db/schema.ts](db/schema.ts) · [drizzle/](drizzle/) · [worker/index.ts](worker/index.ts) | D1 表与迁移、Worker 请求入口。Site 托管源的 `.openai/hosting.json` 声明 `DB` 绑定和项目 ID。 |
| [pages/build.mjs](pages/build.mjs) · [docs/](docs/) | Pages 构建入口、生成后的静态页面和资源，以及手写的模型说明。 |

## 数据与模型约定

**坐标和步骤。** `steps[0]` 保存发球手法、旋转、强度、站位、球速、距离和目标区。后续每板保存技术 ID、目标区和可选个人叫法。任一板可存 `point: { lateral, depth }`，以**接球方**为坐标系，`lateral` 正值朝其正手，`depth` 从网（0）向端线（1）。有连续坐标时按坐标派生分区，旧套路无坐标时使用该区的预设落点。模拟轨迹、点击历史和中间结果由界面和引擎计算，每板只储存最终落点。

**兼容。** `distance` 在旧存储及 v1 JSON 中仍为 25–45，缺省为 30。实际水平触球距离使用 `contactSetbackCm` 换算，界面修改再用 `storedServeDistance` 转回。旧的重叠发球族、缺省球速、站位和我方手别由目录兼容。新站位滑条上限为 `.50`，读取旧记录允许到 `.94`。技术和偏好以稳定 ID 保存，改中文名称可保留原 ID。

非反胶配置随发球步骤的可选 `rubbers` 字段保存。双方各击球面缺省为反胶，双反记录沿用原 v1 字段，账号库继续使用步骤 JSON。

**分享与同步。** JSON 形如 `{ format: "tt-tactics/routine", version: 1, routine: { … } }`，包含名称、模式、双方手别、状态、分类、笔记和完整步骤。默认分享省略笔记内容，用户可主动勾选。导入生成独立套路，分享不携带账号、记录 ID 或 revision。Site 的 D1 套路表和偏好表按服务器确认的 ChatGPT 用户 ID 隔离，写操作用 revision 处理跨设备并发。账号尚未设置偏好时可一次性导入该站点浏览器中的旧偏好。

**全量备份。** Pages 套路库的「导出全部」下载 `{ format: "tt-tactics/routine-library", version: 1, routines: […] }`，包含所有模式、分类和笔记。「导入全部」校验后使用一个 IndexedDB 事务追加新记录。再次导入同一份文件会再次追加。

**推荐链路。** 模型先求实际飞行和落台，区分首落点与二跳留台、侧边出台、底线出台。落台后的球速、上下旋和侧旋、触球高度、引拍空间、来球压力、接球方手别和侧向位移共同决定候选。发球名和目标区只提供输入。候选通过适用性判断后还要模拟回球，核对是否上台、是否落在推荐区、二跳长度和落点误差。常规接法先于高难度的有条件接法。「正确处理」的真实轨迹用于后续板次；误读旋转的对比供分析查看。

**模型边界。** 模型包含重力、阻力、Magnus 项和带摩擦碰撞，为推荐提供球路和触球依据。发球设置与触球点距端线固定时，横移站位沿用同一触球高度和竖直初速，重新求水平初速以保持对方台面上的首落点。胶皮使用按类别设定的有效摩擦、回弹、保留来旋和速度参数。触球时间和技术阈值按教学用途设定。求解器找不到符合条件的线路时，可调整落点或技术。研究出处和参数的适用范围可参见[模型说明](docs/model-and-design.md)。

## 本地开发和发布

Node.js **22.13 或以上**。在 GitHub checkout 运行以下命令，Pages 默认预览地址为 `http://127.0.0.1:18796`，可通过 `npm run dev:pages -- --port 5174` 改端口。

```sh
npm ci
npm run dev:pages
```

按改动范围选择检查：

```sh
node --test lib/table-tennis/*.test.mjs
npm run test:pages
# Pages 用户端改动时生成发布文件
npm run build:pages
# 大幅改变物理或推荐的适用性时可扩大检查
node lib/table-tennis/scenario-audit.mjs
```

- **Pages 发布。** 先改源文件，`npm run build:pages` 更新 `docs/index.html`、`docs/pages-assets/` 等产物。源码与当前构建产物一起提交 `main`。构建采用相对路径，保留项目站点的 `/tt-tactics/` 前缀。发布后打开实际站点确认对应流程。
- **Site 发布。** 打开现有 Site 源码，把共用文件和匹配的逐板 UI 改动同步到其真实入口。用 Sites 的构建及发布流程保存并部署现有项目，核对部署状态。Site checkout 的 `npm run dev` 可预览，`npm run build` 构建 Worker；如需本地 D1，按 [README](README.md) 的 Local D1 migrations 小节在本地应用迁移。需要验证账号同步时用现有 Site 的登录流程。
- **双端范围。** 共享推荐、物理或共用工作台功能改动需要同步两个线上版本。单端改动按涉及范围发布。根目录纯文档更新直接提交 GitHub 即可。发布状态、未核实的环节和已跑的检查分别如实记录。

## 已确立的下一步

- **发球触球高度。** 可考虑在「发球设置」开放球心距台面的高度。触球高度、本方第一跳、过网高度及接球高度各自保留独立含义。推荐依据到达接球方的实际球况。
- **半出台和三维球台。** 两者仍是可讨论的扩展。现有二维落点、二跳出边和连续轨迹是当前工作流。

维护时，如果入口、数据格式、规则或部署方式改变，在同一变更里更新本文件相应小节及 [AGENTS.md](AGENTS.md) 中受影响的规则。
