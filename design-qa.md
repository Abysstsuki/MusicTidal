# MusicTidal 第 3 个视觉方向 · 设计验收

final result: passed

## 最新修订：歌词字体

按后续要求，歌词从系统字体回退改为专用的 Noto Sans SC 可变字体。最新目标为保留歌曲封面舞台和三行层级，同时让歌词字形、字重与间距更协调。界面其他文字仍沿用原字体。

- Source visual truth：上一轮 `song-cover-desktop.png` 为修改前的同屏基线；用户本轮明确要求改进歌词字体，不再按原系统字体逐字匹配。
- Implementation screenshot：`C:/Users/Abyss/.codex/visualizations/2026/09/30/01a0f19b-6c2d-7d63-92e0-bbdf9d9ab842/musictidal-afterglow/lyrics-font-desktop.png`（1487 × 1058）与同目录 `lyrics-font-mobile.png`（390 × 844）。截图和 CSS 尺寸为 1:1，无密度缩放。桌面对照歌曲、封面、示例文字、播放暂停状态与聊天展开状态一致。
- Full-view / focused evidence：修改前与修改后的全屏截图、`lyrics-font-before.png` / `lyrics-font-after.png`（均 885 × 280）在同一输入中打开，另查看手机截图。主行字重由 750 改为 600，字距从 .1em 收紧至 .035em；相邻行由 40px 上限降为 32px，使用 400 字重。译文同为 400，行距独立设置。手机保留较紧凑的字号和字距。
- Fonts：`next/font` 生成并由本地 Next 服务托管 Noto Sans SC 字体，使用可变字重和 latin 子集；字体作用于歌词区域，包含中文、英文与译文。浏览器页面资源记录中出现多个本地 Noto Sans SC WOFF2 分片请求，生成 CSS 中包含该字体的 @font-face。实际桌面计算样式为 Noto Sans SC、600 字重、61.7105px 字号、2.15987px 字距，相邻行为 400 字重。
- Layout / tokens / imagery / copy：主副行对比更清楚，桌面与手机均没有文本溢出或遮挡；文字颜色、封面素材与示例文案延续上一版，减弱主行发光。字体调整是本轮有意的视觉变化。截图左下角 Next.js 图标来自用户正在运行的开发服务。
- Verification：本轮 TypeScript、歌词组件 ESLint 与 diff 检查通过；使用用户自行启动的开发服务确认页面编译、字体资源请求与实际显示，未另行启动前端进程，也未在同一个 `.next` 路径并行执行生产构建。预览页面 console error/warn 为空。没有剩余可执行的 P0/P1/P2 问题。

## 上一轮修订：随当前歌曲更新的封面背景

用户后续明确要求背景使用歌曲封面。当前视觉目标为：保留选定方案的布局与歌词层级，背景和播放器缩略图使用同一首歌曲的 `prcUrl`。原天体画面不再作为背景验收目标；下文原版记录仅作为历史。

- Source visual truth：选定方案仍是布局参考；当前画面素材为公开的 Die For You 专辑封面，页面实际显示的素材已通过 pageAssets 保存为 `C:/Users/Abyss/.codex/visualizations/2026/09/30/01a0f19b-6c2d-7d63-92e0-bbdf9d9ab842/musictidal-afterglow/source-song-cover.jpg`（1500 × 1500）。
- Implementation screenshot：同目录 `song-cover-desktop.png`（1487 × 1058）、`song-cover-mobile.png`（390 × 844）、`song-cover.png`（实际默认窗口 755 × 713）。截图与 CSS 视口为 1:1；封面按 object-fit: cover 居中裁切，不要求方形封面与宽屏截图等尺寸。
- State：Die For You、预览队列 6 首、桌面聊天展开，播放器暂停。1100px 以下默认收起浮层。
- Full-view evidence：原布局源图、实际专辑封面、修订后的桌面截图与手机截图在同一比较输入中打开，确认布局延续，背景素材与当前歌曲一致。
- Focused evidence：`song-cover-player.png`（1100 × 125）核对播放器封面与舞台一致；`song-cover-next.png` 为下一首 Lose Yourself 的不同封面，`song-cover-empty.png` 为无封面的夜曲示例。
- Interaction evidence：浏览器检查舞台与播放器图像的 src 一致，二者加载成功；点击下一首先进入无封面示例，舞台图片数量为 0，播放器显示专辑图标；再次点击下一首，两处封面同时变为 Lose Yourself 的地址。页面 console error 为空。
- Fidelity surfaces：字体、控件间距与主副歌词层级沿用原版；背景裁切与深色遮罩让封面可辨、歌词可读；控件保持统一红色强调；封面为真实图片，没有用插画或占位风景替代。文案仍明确标记预览模式。
- Finding / iteration：复查默认 755 × 713 窗口发现原先默认展开的聊天挡住相邻歌词（P2）。默认收起浮层的范围从 640px 扩大至 1100px，重新构建后在相同窗口捕获 song-cover.png，并复查手机截图；歌词与控件均完整可见，无剩余 P0/P1/P2。
- Verification：前端生产构建通过，包含 TypeScript 与 ESLint 检查；仅保留旧 MusicItem.tsx 的图片警告。无封面状态与切歌已实际操作；图片加载失败分支经代码检查，未制造损坏的远程封面请求。真实音频/登录联调缺口仍适用。

## 以下为原第 3 版的历史验收记录

## 对照目标与证据

- Source visual truth path：`C:/Users/Abyss/.codex/generated_images/01a0f19b-6c2d-7d63-92e0-bbdf9d9ab842/exec-094d9ab9-4a2a-499f-881c-d9ae8aa4eca8.png`
- Implementation URL：`http://localhost:3000/?preview=1`
- Implementation screenshot path：`C:/Users/Abyss/.codex/visualizations/2026/09/30/01a0f19b-6c2d-7d63-92e0-bbdf9d9ab842/musictidal-afterglow/desktop.png`
- State：红黑主题，Die For You / Grabbitz，1:50 / 3:32，聊天浮层打开，2 条示例消息，待播 6 首，在线示例听众 12 人。播放器显示暂停按钮。预览明确标记，不模拟真实服务在线。
- Viewport：1487 × 1058 CSS px。源图与实现截图均为 1487 × 1058 像素，截图与 CSS 尺寸为 1:1，无缩放或密度归一化。无浏览器外框。
- Full-view comparison evidence：将源图与最终 desktop.png 在同一工具输入中打开，比较完整构图、歌词层级、背景裁切、头部和底部播放器。
- Focused region comparison evidence：同一证据目录中的 source-lyrics.png / implementation-lyrics.png（885 × 280）、source-player.png / implementation-player.png（1100 × 125）、source-chat.png / implementation-chat.png（457 × 275）。等尺寸裁切用于核对字体、控件、浮层和待播入口；对应图像在同一比较输入中查看。
- Responsive evidence：同一目录 mobile.png（390 × 844）、landscape.png（844 × 390）、preview.png（默认 1280 × 720）。调整结束后重新截图并恢复默认 viewport。
- Other evidence：empty.png 与 login.png 为真实模式空闲页面及登录弹窗；mobile-search.png 为手机点歌浮层。

## Findings 与修复历史

初次验收发现以下 P2 问题，修复前结果为 blocked。每轮修复后重新构建、捕获对应状态并复查。

1. **[P2，已修复] 手机默认聊天遮盖歌词。** 默认桌面聊天浮层在手机也展开，抢占歌曲舞台。640px 以下初始化收起浮层，切换至手机宽度时同步收起。最终 mobile.png 显示歌词、互动入口与全部播放按钮可见。
2. **[P2，已修复] 短横屏隐藏持久播放控件。** 最小页面高度使 844 × 390 视口裁掉底部。移除固定最小高度，为高度 520px 以下增加紧凑排版，将标题与歌词并排，收紧播放器和浮层。最终 landscape.png 显示完整控制栏。
3. **[P2，已修复] 点歌打开后的焦点不在输入框。** 父层自动聚焦关闭按钮覆盖了搜索框焦点。按面板类型聚焦，搜索使用 input。浏览器检查打开点歌后 document.activeElement 的 aria-label 为“搜索歌曲或歌手”，Escape 关闭并返回点歌按钮。
4. **[P2，已修复] 聊天覆盖待播入口。** 桌面对照发现聊天右侧与待播按钮重叠。调整 `.popover-chat` 的右边距最小值为 132px，入口贴近右侧并减小间距。1487 × 1058 的实际 DOM 测量：聊天右缘 1355px，待播按钮左缘 1369.44px，overlap=false。最终 desktop.png 和聊天区域裁切确认分离，待播按钮可直接点击。
5. **[P2，已修复] 桌面中文歌词字距与相邻行节奏偏离源图。** 聚焦裁切发现相邻歌词偏小、离主歌词偏远，主歌词明显偏窄。相邻行最大字号从 32px 调至 40px，桌面行间 gap 从 28px 调至 4px，主歌词字距改为 .1em；手机与短横屏保持各自覆盖规则。再次把源图、最终全屏截图与歌词区域裁切一起查看，字幅、主副层级和三行位置已接近源图。最终 desktop.png、implementation-lyrics.png、mobile.png、landscape.png 为修复后证据。

最终复查没有剩余可执行的 P0/P1/P2 视觉问题。

## 五项 fidelity 检查

- **Fonts / typography：** 英文沿用 Inter，中文在本机回退 Microsoft YaHei。主歌词使用粗体、扩大字距，相邻行使用较轻灰白色；主歌词、副歌词、歌曲标题与小字信息层级明确。桌面单行、手机一行示例歌词及短横屏均可读，歌曲长标题允许换行或在列表中截断。生成图没有可确定的原始字体文件，系统中文字形差异归为 P3。
- **Spacing / layout：** 完整舞台、左上歌曲、顶部轻量导航、居中三行歌词、右下聊天、底部圆角控制栏的布局关系保留。1487 × 1058 对照及 1280 × 720 复查没有隐藏控件。移动端浮层按需显示，横屏收紧布局。
- **Colors / tokens：** 近黑背景、灰白文字、红色主操作与细白描边符合源图方向。播放按钮、进度条、焦点和反馈使用统一红色。低强调内容降低透明度，主歌词始终保持高对比；禁用按钮与真实未就绪状态一致。
- **Image quality：** 1536 × 1024 的 ImageGen 背景仅包含画面，按视口 cover 裁切；主体红色天体、中央人物与水面反射符合选定方向。没有把界面做成整张静态图片。背景细节较源图更明亮，属于同方向素材重生成的可接受差异。全部标准控制图标沿用现有 MUI 图标库。
- **Copy / content：** 歌名、歌手、示例歌词和聊天示例一致。真实模式使用真实 API 数据及明确空闲/错误提示。预览使用“视觉预览”“演示歌曲”标记，不把示例数据表现为实际连接。搜索、队列、登录表单文字为可操作的中文标签。

## 有意适配与约束

- 用户模型没有头像字段，在线用户和聊天使用统一的账号图标，没有编造人物头像。
- 原协议没有消息时间戳或点歌人字段，因此不展示源图中的示例时间和点歌人。
- 原服务没有上一首和随机播放语义，本次使用可接真实功能的下载与重新同步按钮，不添加无效操作。预览没有音频 URL，下载与重新同步显示禁用。
- 手机保留静音与取消静音，隐藏长音量滑条以保留主要播放操作。

## 交互与验证

- 已操作预览搜索、点歌、队列置顶/移除、下一首、聊天发送和关闭后保留记录、在线用户弹窗、账户菜单、播放暂停、静音恢复、歌词切换、Escape 关闭以及搜索自动聚焦。
- 原生登录 dialog 的显示、注册切换、空邮箱必填校验及 Escape 关闭通过。没有提交实际账号或注册数据。
- 前端生产构建、修改文件 ESLint、前后端 TypeScript 检查通过。前端构建仅有原先未使用的 MusicItem.tsx 的 `<img>` 警告。
- 5 项隔离的服务端队列测试通过。预览页面首次独立检查没有 console error；真实模式后端不可达时的 WebSocket 错误属于联调缺口。
- **残余测试缺口：** 真实网易云搜索/歌词/音频、数据库登录、全屏浏览器兼容性、多浏览器播放偏差和真实网络断线恢复，需在后端与网易云服务可用后验证。本报告通过的是视觉与已操作交互，不宣称外部服务联调完成。

## Implementation checklist

- [x] 完整画面与控件区域均在同一输入中与源图比较。
- [x] P2 问题均已修复，并以最终浏览器截图复查。
- [x] 桌面、手机、横屏和默认尺寸已验证。
- [x] 核心按钮、面板、空闲状态、表单与错误反馈已检查。
- [x] 预览与真实服务数据隔离，保留实际接口流程。
- [x] 还原默认 viewport，保留可交互本地预览。

## Follow-up polish

P3：如后续提供品牌指定中文字体，可进一步统一不同操作系统上的歌词字形。若扩充用户头像、消息时间或点歌人数据，应从后端字段接入，替换当前简洁账号图标与提示文案。
