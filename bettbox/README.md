# MyClash-Local

基于 [AIsouler/MyClash](https://github.com/AIsouler/MyClash)，保留个人分流定制。

## 本次同步

- 合并日期：2026-11-13。
- 上游提交：[`4861619`](https://github.com/AIsouler/MyClash/commit/4861619be366c7bacabfed6d581bb8c450de1ca1)（2026-11-12）。
- 上游原始快照：`upstream/mihomoScript.js`，下次合并可作为三方合并基线。
- 跟进 GitHub 和家宽节点组、极简模式自动选择、节点与 hosts 匹配优化、群晖直连，以及域名规则优先于服务 IP 兜底。
- 规则与图标 CDN 跟进上游切换到 Fastly；Emby 改用 bett-rules，移除旧 emos 规则。Fake-IP 使用 `cn` 集合并保留本地例外；QUIC 使用上游新的 `cn` / `cn_ip` 判断，保留本地默认开启。链式代理功能跟进恢复，默认关闭。
- Bettbox 开关名称跟进上游：`极简国内外分流模式`、`生成高低倍率组`、`屏蔽代理QUIC流量`。使用自定义开关的设备在同步后应核对这些设置。
- 保留 Telegram 进程代理、Minecraft/Xbox/原神直连、Steam 商店代理与游戏直连、国内 DoH、全部订阅 hosts 和国内分流兜底。

## DNS 出口设计

| 用途 | 解析器与出站 |
| --- | --- |
| 默认业务查询 | Cloudflare / Google 的 IP DoH，显式 `#默认代理` |
| 国内规则集、特定游戏域名及直连解析 | AliDNS / DNSPod 的 IP DoH，显式 `#DIRECT` |
| DoH 引导解析、普通节点解析 | 同上，直连 IP DoH，不混用 system、UDP 53 或 DoT |
| 机场私有节点解析 | 保留订阅的节点专用策略；复制进业务 DNS 时收窄为实际节点精确域名 |

使用 IP DoH 可避免解析国外 DoH 主机名所需的额外引导查询。默认国外池不设直连 fallback，代理失效时不会自动改用国内解析。`respect-rules: false` 是有意设置：解析器已用 `#` 显式指定出站，不再按解析器 IP 二次选路。TLS 证书校验保持开启，DoH 不优先使用 HTTP/3。

机场私有 DNS 可能仍需明文协议，这是节点接入的兼容例外，不应用于普通网站。国内/指定直连业务和节点解析按设计仍会使用直连解析器，不能把此方案称为“全部 DNS 经代理”。

TUN 保持 `strict-route: true`，并劫持 UDP/TCP 53。Windows 严格路由用于限制多宿主 DNS 绕过；Bettbox 的后续覆写、应用自己的 DoH/DoT、绕过 TUN 的应用或其他加速器仍可能改变实际行为。系统代理模式也不等于所有应用的 DNS 都被接管。

## 使用与核验

Kryptex 矿池域名 `kryptex.network`（含香港、美国等地区节点）以及 `SRBMiner-MULTI.exe` 进程优先直连。矿池域名排除 Fake-IP，并使用直连国内 DoH 解析；Kryptex 网站和账号域名不受这条域名例外影响。同步脚本并重新应用订阅后，已有矿池连接需重新连接，才能验证新规则。

在 Bettbox 同步 `MyClash-Local` 后重新应用订阅；关闭 DNS 覆写，避免向 nameserver 追加系统 DNS。原有 TUN 访问控制按游戏/加速器需求保留。

同步地址：`https://cdn.jsdelivr.net/gh/Fancie-Personal/-repo@main/bettbox/MyClash-Local.js`。CDN 有缓存时可用 GitHub Raw，或将 `main` 换成所需提交 SHA。

验证须查看最终生效配置，并在应用后做 DNS 泄漏测试或抓包。代码检查不能证明当前运行环境绝无泄漏；测试国内直连域名时看到国内解析器属于上述设计。

## 验证记录

运行 `node bettbox/tests/check.cjs`：17 项定制检查，包括宽泛机场 DNS 策略隔离、游戏分流、GitHub 和家宽分组、QUIC 开关、极简模式及关闭 Telegram 分组后的引用完整性。

另使用该上游提交的测试套件验证：186 项通过（含原版精简脚本的 89 项），包含 ES2026 检查和真实 QuickJS 运行。上游一项 hosts 测试的两条断言按本分支“保留全部订阅 hosts”的既定行为调整，未改变其他测试预期。

历史发布中的模拟订阅配置曾通过官方 Mihomo v1.19.32 的 `-t` 校验。此前发布中核验过该内核发布包的 SHA-256，以及两处国外 IP DoH 经 Bettbox、两处国内 IP DoH 直连的 HTTPS 连通性。这些结果不代替应用更新后的全机泄漏测试。

## 参考

- [wchiway/mihomo-proxy](https://github.com/wchiway/mihomo-proxy)：参考分层 DNS 和显式代理 DoH 的思路，未直接套用其 system DNS 或关闭严格路由设置。
- [LanternCX/mihomo-rules](https://github.com/LanternCX/mihomo-rules)：对照加密节点解析和 Windows TUN 接管设置，未引入其整套规则或 fallback。
- [Mihomo DNS 官方文档](https://wiki.metacubex.one/config/dns/)：DNS 各层用途、显式指定代理、引导解析。
- [Mihomo TUN 官方文档](https://wiki.metacubex.one/config/inbound/tun/)：DNS 劫持与 Windows strict-route 的能力边界。

保留上游 MIT 版权；原始快照版权归 AIsouler/MyClash 作者所有。

## 微信原生上传兼容（2026-11-13）

微信主进程及 `WeChatHelper`、`WeChatAppEx` 以进程名优先直连，并保留整个微信应用包的路径规则（支持系统和用户 Applications 目录）。脚本将 `find-process-mode` 设为 `always`，为没有域名的 IP 连接提供进程匹配；微信规则先于 QUIC 拦截和海外兜底。客户端后续覆写若设为 `off`，进程规则仍会失效，应核对最终生效配置。

现有微信域名直连、国内加密 DNS 和 Fake-IP 排除保留。更改不会让其他进程的全部流量直连；强制进程识别可能增加少量查询开销。同步、重新应用后，由用户重发失败图片验证，不将脚本校验通过等同于实际上传恢复。回退时撤销本次微信进程兼容提交并重新同步，保留之后无关提交。

## 2026-11-13 上游增量合并

- 探测超时从 3000 调整为 5000 ms；600 秒间隔与 lazy 仅下发给自动选择、负载均衡组。地区手动组排列在对应自动组之前。
- 引入上游 `priorityRules`：个人进程/域名和局域网例外 → 广告规则 → 通用国内分流 → QUIC 与服务域名 → 国内/私网 IP → 服务 IP → 原有 GEO 兜底。微信、游戏、挖矿等个人例外继续优先。
- 国内/私网 IP 规则移到服务 IP 规则之前，减少国内 CDN 被服务 IP 集合带去代理。
- 保留国内加密 DNS 及显式 `#DIRECT`；不引入上游的 system 或明文抖音解析。保留微信进程 `always`、Fake-IP 例外、订阅 hosts、节点 DNS 隔离及原有兜底。
- 上游原始快照同步更新；配置检查与业务实测是不同的验证阶段。
