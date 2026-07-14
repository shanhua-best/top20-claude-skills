/**
 * fetch-and-generate.js
 * Fetches latest skills data from skills.sh API and generates index.html
 * Runs daily via GitHub Actions. Falls back to bundled data on failure.
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', 'index.html');

// ── API config ──────────────────────────────────────────────
// skills.sh API requires Vercel OIDC token for /api/v1/*
// Public endpoints: /api/search (no auth), /api/skills (may need auth)
const ENDPOINTS = [
  'https://skills.sh/api/v1/skills?per_page=20&sort=installs',   // v1 (needs auth in Vercel env)
  'https://skills.sh/api/search?q=claude',                         // public search
  'https://skills.sh/api/skills?sortBy=installs&sortOrder=desc&pageSize=20',
];

// ── Detailed descriptions (curated, merged with live data) ──
const DETAILS = {
  'superpowers': {
    how: '安装后自动注入 14 个阶段 Skill，Claude 在执行任何任务时都会先规划再编码，写完自动触发审查和验证。',
    pros: ['消灭幻觉——每步有明确产物（plan/impl/review/verify）', '支持 TDD 和系统性调试', '5 人并行 code review + 信心评分'],
    cons: ['简单脚本（5 分钟）会多花 10-20 分钟走流程', 'Plan 修改时整个 plan 会重新生成'],
    install: '/plugin marketplace add obra/superpowers-marketplace && /plugin install superpowers',
    catLabel: '开发流程',
    category: 'workflow'
  },
  'find-skills': {
    how: '安装后，Claude 在遇到"有没有 X 的 skill"时会自动调用 npx skills find 搜索，检查质量指标后给出推荐。',
    pros: ['生态最大入口：索引 6.5 万+ Skill', '内置质量过滤：优先 1000+ 安装量、验证官方源', '安全审计：Socket + Snyk 双重扫描'],
    cons: ['本身只是一个搜索器，不提供功能', '依赖 skills.sh 网络服务'],
    install: 'npx skills add vercel-labs/skills --skill find-skills -g -y',
    catLabel: '元技能',
    category: 'official'
  },
  'frontend-design': {
    how: '在生成任何前端代码前，Claude 会先选择一个视觉方向（如 brutalism/editorial/glitch），然后基于该方向生成 UI，而非默认蓝白 Tailwind 模板。',
    pros: ['50 种风格方向，告别 AI-slop', '与 shadcn/ui 无缝配合', 'Anthropic 官方维护，更新快'],
    cons: ['只管美学，不管架构/状态管理/包大小', '需要设计师审美判断选择哪个方向'],
    install: '/plugin install frontend-design@anthropics/skills',
    catLabel: '前端/设计',
    category: 'frontend'
  },
  'andrej-karpathy-skills': {
    how: '作为一个 CLAUDE.md 文件加载，在每次会话开始时注入 4 条行为规则，从根本上改变 Claude 的工作方式。',
    pros: ['极轻量：仅 70 行，零 token 负担', '解决最痛点：Claude 乱改你没让改的代码', '对所有任务类型都有效'],
    cons: ['不强制执行，只是行为引导', '没有结构化流程，需配合 superpowers'],
    install: 'curl -o ~/.claude/CLAUDE.md https://raw.githubusercontent.com/forrestchang/andrej-karpathy-skills/main/CLAUDE.md',
    catLabel: '行为约束',
    category: 'efficiency'
  },
  'ecc': {
    how: '克隆仓库后按需加载。提供 26 个主题文件夹（deployment/git/security/testing/performance/project-management...），各取所需。',
    pros: ['覆盖面最广：18 个领域 354+ Skill', 'C-suite 角色扮演 Skill 套件（CEO/CTO/CFO）', '活跃维护，社区贡献量大'],
    cons: ['量太大，全装会严重消耗上下文', '建议只挑 3-5 个领域按需加载'],
    install: 'git clone https://github.com/affaan-m/everything-claude-code ~/.claude/skills/ecc --depth 1',
    catLabel: '全能工具包',
    category: 'workflow'
  },
  'vercel-react-best-practices': {
    how: '写 React 代码时自动注入 Vercel 官方最佳实践作为上下文约束，在生成代码时直接遵守。',
    pros: ['React 19 最新规范（RSC/Server Actions）', 'Vercel 官方维护，更新及时', '与 Next.js 项目天然适配'],
    cons: ['仅适用 React 生态', '对非 Vercel 部署场景部分建议不适用'],
    install: 'npx skills add vercel-labs/agent-skills --skill react-best-practices -g -y',
    catLabel: '前端/优化',
    category: 'frontend'
  },
  'agent-browser': {
    how: '安装后 Claude 获得 browser 控制能力，访问网页时返回精简 YAML 摘要而非完整 HTML，复杂交互时降级至 Playwright CLI。',
    pros: ['Token 效率：仅为 Playwright MCP 的 1/10', '支持点击/填表/截图等完整交互', '复杂 DOM 时可降级到 Playwright'],
    cons: ['精简摘要可能丢失细节', '需要 Playwright 已安装作为后盾'],
    install: 'npx skills add vercel-labs/agent-skills --skill agent-browser -g -y',
    catLabel: '浏览器自动化',
    category: 'efficiency'
  },
  'caveman': {
    how: '加载后，Claude 被要求用最简洁、最直白的方式回应，去掉所有礼貌用语、重复确认和冗长解释。',
    pros: ['省 65-75% 输出 Token', '代码依然完整，只砍掉话术', '适合 API 付费/大批量任务'],
    cons: ['不适合需要详细解释的场景', '可能让输出显得过于简洁/冷淡'],
    install: 'npx skills add JuliusBrussee/caveman -g -y',
    catLabel: 'Token优化',
    category: 'efficiency'
  },
  'grill': {
    how: '在做出技术决策时主动扮演"魔鬼代言人"，用 Socratic 追问法层层剥开方案的假设和风险。',
    pros: ['最彻底的方案审查——不留死角', '补足 Claude 天生"太配合"的短板', '适合架构评审和重大决策'],
    cons: ['可能过度审查简单任务', '需要用户愿意花时间讨论'],
    install: 'npx skills add mattpocock/grill -g -y',
    catLabel: '方案审查',
    category: 'quality'
  },
  'web-design-guidelines': {
    how: '写完前端代码后自动运行审计，按 Vercel 设计规范检查 20+ 项指标，给出优先级排序的改进清单。',
    pros: ['Vercel 官方设计规范背书', '20+ 审计指标覆盖全面', '输出结构化报告便于修复'],
    cons: ['仅检查视觉/交互，不检查性能'],
    install: 'npx skills add vercel-labs/agent-skills --skill web-design-guidelines -g -y',
    catLabel: '前端审计',
    category: 'frontend'
  },
  'claude-mem': {
    how: '每次对话的关键决策、用户偏好、项目约定自动写入 SQLite，下次会话通过向量检索注入上下文。',
    pros: ['解决跨会话上下文丢失', '本地存储，隐私友好', '向量检索精准召回相关记忆'],
    cons: ['会记下错误的临时假设（记忆噪声）', '需要定期清理过期记忆'],
    install: 'git clone https://github.com/thedotmack/claude-mem ~/.claude/skills/claude-mem',
    catLabel: '持久记忆',
    category: 'memory'
  },
  'ui-ux-pro-max': {
    how: '在生成 UI 代码时激活，约束 Claude 遵循 8px 网格、60-30-10 配色法则、视觉层级 F-pattern 等设计原则。',
    pros: ['结果是"专业感"而非"更炫"', '零学习成本——写代码自动生效', '与 frontend-design 互补（一个定风格，一个定细节）'],
    cons: ['不适合非设计背景的开发者判断效果'],
    install: 'npx skills add nextlevelbuilder/ui-ux-pro-max-skill -g -y',
    catLabel: '设计品味',
    category: 'frontend'
  },
  'gstack': {
    how: '加载你需要的角色 Skill，Claude 会以该角色视角工作——例如 Designer Skill 会输出 Figma-ready 的设计规范，QA Skill 会生成测试矩阵。',
    pros: ['23 个专业角色覆盖完整产品团队', '每个角色有深度 Prompt 模板', '适合 Solo Founder / 小团队'],
    cons: ['角色间切换需要手动指定', '部分角色 Prompt 需要定制为你的业务'],
    install: 'git clone https://github.com/garrytan/gstack ~/.claude/skills/gstack',
    catLabel: '角色分工',
    category: 'workflow'
  },
  'code-review': {
    how: '运行 /code-review 时触发，5 个独立 Agent 各从不同维度审查同一份 diff，最终汇总去重，附带信心评分。',
    pros: ['5 维度并行审查，覆盖面广', '每个发现带具体的失败场景', '支持 --fix 自动修复'],
    cons: ['复杂审查可能消耗较多 Token', '需要合理的 effort 级别设置'],
    install: '内置命令 /code-review（社区强化版：npx skills add composio/awesome-claude-skills --skill code-review -g -y）',
    catLabel: '代码审查',
    category: 'quality'
  },
  'addyosmani-agent-skills': {
    how: '按任务类型加载对应 Skill：analyze-performance / debug-issue / review-architecture / plan-tests / optimize-build。',
    pros: ['Google 工程实践背书', '覆盖完整 SDLC 各阶段', '每个 Skill 有详尽的 references/ 目录'],
    cons: ['偏大型项目，小项目显得过于正式'],
    install: 'git clone https://github.com/addyosmani/agent-skills ~/.claude/skills/addyosmani',
    catLabel: '工程全流程',
    category: 'workflow'
  },
  'anthropics-skills': {
    how: '安装后按需加载——写 PPT 时触发 pptx skill，生成 PDF 时触发 pdf skill，需要 MCP 服务器时触发 mcp-builder。',
    pros: ['第一方出品，质量最稳定', 'Office 文件生成是真实 .pptx/.docx，不是 Markdown 近似', 'skill-creator 支持 A/B 测试优化激活率'],
    cons: ['部分 Skill 需要额外依赖（如 LibreOffice）'],
    install: 'git clone https://github.com/anthropics/skills ~/.claude/skills/anthropics-official',
    catLabel: '文档/Office',
    category: 'docs'
  },
  'shadcn-ui': {
    how: '在 Claude Code 中说 "add a dialog component" 即可自动执行 npx shadcn add dialog，并生成使用该组件的页面代码。',
    pros: ['shadcn/ui 生态标准接口', '支持 React + Vue', '组件搜索/添加/组合/修复一站式'],
    cons: ['仅限 shadcn/ui 生态', '需要项目已初始化 shadcn/ui'],
    install: 'npx skills add vercel-labs/agent-skills --skill shadcn-ui -g -y',
    catLabel: '组件库',
    category: 'frontend'
  },
  'context7': {
    how: '当你使用某个库时，自动检测版本并从 Context7 拉取该版本的最新文档片段，确保 Claude 不会生成已废弃的 API 调用。',
    pros: ['防幻觉：消灭过时 API 调用', '支持 2000+ 库', '实时更新，无需手动维护'],
    cons: ['依赖 Context7 服务可用性', '文档片段可能不完整'],
    install: 'npx skills add upstash/context7 -g -y',
    catLabel: '实时文档',
    category: 'memory'
  },
  'security-review': {
    how: '运行 /security-review 时触发，扫描 staged 变更中的所有安全风险，按严重程度排序输出报告。',
    pros: ['覆盖 OWASP Top 10 + CWE Top 25', '检测硬编码密钥/Token', '输出 CVE 编号可直接提单'],
    cons: ['内置版本较基础，建议搭配社区强化版'],
    install: '内置命令 /security-review',
    catLabel: '代码质量',
    category: 'quality'
  },
  'graphify': {
    how: '在项目根目录运行 graphify 索引，生成知识图谱后，Claude 可以直接查询项目结构而不需要遍历文件树。',
    pros: ['支持代码/SQL/文档/图片/视频多模态', 'tree-sitter 解析精度高', '自然语言查询知识图谱'],
    cons: ['首次索引大项目较慢', '图谱更新需要手动触发'],
    install: 'npx skills add safishamsi/graphify -g -y',
    catLabel: '知识图谱',
    category: 'memory'
  }
};

// ── Fallback static data (used when API is unavailable) ─────
const FALLBACK = [
  { name:'superpowers', author:'obra (Jesse Vincent)', stars:'241K', installs:'252K', desc:'14 个可组合 Skill 组成的完整软件工程流水线：头脑风暴 → 编写计划 → TDD 执行 → 代码审查 → 完成验证。强制 Agent 遵循严格 SDLC 流程。' },
  { name:'find-skills', author:'Vercel Labs', stars:'24K', installs:'230万+', desc:'「技能的技能」——让 AI 自己去发现和安装能力。搜索 skills.sh 排行榜和生态，按安装量/来源可信度/安全评分筛选后推荐。' },
  { name:'frontend-design', author:'Anthropic (官方)', stars:'157K', installs:'610K', desc:'解决 AI 生成 UI "千篇一律"——提供 50 种视觉风格方向，强迫 Claude 在写代码前先确定美学方向。' },
  { name:'andrej-karpathy-skills', author:'Forrest Chang', stars:'185K', installs:'—', desc:'Andrej Karpathy 的 4 条核心规则（仅 70 行）：先想后写、简单优先、精准修改、目标驱动。社区公认最该装的第一个 Skill。' },
  { name:'ecc', author:'affaan-m', stars:'224K', installs:'—', desc:'一站式 Agent 工具包：119 个 Skill + 28 个 Agent + 记忆系统 + 安全审计 + 研究优先工作流。覆盖 18 个领域。' },
  { name:'vercel-react-best-practices', author:'Vercel', stars:'—', installs:'515K', desc:'自动应用 Vercel 工程团队的 React/Next.js 性能优化规则。涵盖 RSC、图片优化、bundle 分析、流式渲染等 React 19 规范。' },
  { name:'agent-browser', author:'Vercel', stars:'—', installs:'499K', desc:'Token 效率最高的浏览器控制 Skill：仅消耗 200-400 tokens/页（vs Playwright MCP 的 2000-6000），用精简 YAML 摘要代替完整 DOM dump。' },
  { name:'caveman', author:'Julius Brussee', stars:'78K', installs:'343K', desc:'强制 Claude 用「原始人」风格输出——砍掉所有废话、套话、免责声明。实测可节省 65-75% 输出 Token。' },
  { name:'grill', author:'Matt Pocock', stars:'—', installs:'425K', desc:'无情地压力测试你的计划和设计——对每个技术方案提出质疑、挖掘边界情况，直到每个分支都被充分论证。' },
  { name:'web-design-guidelines', author:'Vercel', stars:'—', installs:'428K', desc:'按 Vercel Web Interface Guidelines 自动审计前端代码——检查间距一致性、颜色可访问性、响应式断点、排版层级。' },
  { name:'claude-mem', author:'thedotmack', stars:'85K', installs:'—', desc:'跨会话记忆系统——SQLite + Chroma 向量数据库持久化存储项目上下文。新会话自动加载之前的决策和偏好。' },
  { name:'ui-ux-pro-max', author:'nextlevelbuilder', stars:'98K', installs:'263K', desc:'「品味层」——注入间距、层次、克制感到 AI 输出的 UI 中，让界面看起来像专业设计师手工打磨过的。' },
  { name:'gstack', author:'Garry Tan (YC CEO)', stars:'97K', installs:'—', desc:'Y Combinator CEO 的配置——23 个专业角色 Skill：CEO、工程经理、设计师、Code Reviewer、QA、安全官等。' },
  { name:'code-review', author:'Anthropic (内置) + 社区', stars:'—', installs:'内置', desc:'5-Agent 并行代码审查 + 置信度评分。多维审查：正确性 bug、安全漏洞、简化机会、效率问题、测试覆盖。' },
  { name:'addyosmani-agent-skills', author:'Addy Osmani (Google)', stars:'68K', installs:'—', desc:'Google 工程大佬的完整 SDLC Skill 套件——性能分析、调试排查、架构评审、测试策略、构建优化。工业级标准。' },
  { name:'anthropics-skills', author:'Anthropic (官方)', stars:'157K', installs:'150K+', desc:'17 个第一方 Skill：PDF/DOCX/PPTX/XLSX 生成、MCP-builder、webapp-testing、skill-creator。' },
  { name:'shadcn-ui', author:'shadcn', stars:'—', installs:'214K', desc:'在 Claude Code 中直接添加、组合、搜索、修复 shadcn/ui 组件。不用离开终端就能完成从组件安装到页面搭建。' },
  { name:'context7', author:'Upstash', stars:'58K', installs:'—', desc:'为 LLM 提供最新版本的框架/库文档——防止 LLM 用训练数据中的过时 API 写代码。支持 2000+ 流行库。' },
  { name:'security-review', author:'Anthropic (内置)', stars:'—', installs:'内置', desc:'提交前安全漏洞扫描——审计 OWASP Top 10、CWE Top 25、密钥泄露、依赖漏洞。输出分级报告附带 CVE 编号。' },
  { name:'graphify', author:'safishamsi', stars:'48K', installs:'—', desc:'将任意文件夹（代码/SQL/文档/图片/视频）转为可查询的知识图谱——用 tree-sitter 解析代码结构，构建实体-关系图。' }
];

// ── Fetch live data from skills.sh ──────────────────────────
async function fetchLiveData() {
  console.log('[fetch] Trying skills.sh API...');
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        console.log(`[fetch] Got ${data.length} skills from ${url}`);
        return data;
      }
      if (data.skills && Array.isArray(data.skills) && data.skills.length > 0) {
        console.log(`[fetch] Got ${data.skills.length} skills from ${url}`);
        return data.skills;
      }
    } catch(e) {
      console.warn(`[fetch] Failed: ${url} — ${e.message}`);
    }
  }
  return null;
}

// ── Normalize API data into our format ──────────────────────
function normalize(rawSkills) {
  return rawSkills.slice(0, 20).map((s, i) => {
    const name = (s.name || s.skillId || s.id || '').toLowerCase().replace(/\s+/g, '-');
    const key = name in DETAILS ? name : '';
    const detail = DETAILS[name] || DETAILS[Object.keys(DETAILS).find(k => name.includes(k) || k.includes(name))] || null;

    return {
      name: s.name || s.skillId || s.id || `skill-${i+1}`,
      author: s.author || s.owner || (s.repo ? s.repo.split('/')[0] : 'Community'),
      stars: s.stars || s.githubStars || '—',
      installs: s.installs || s.totalInstalls || '—',
      desc: s.description || s.desc || '',
      detail: detail || { how:'', pros:[], cons:[], install:'' },
      catLabel: detail ? detail.catLabel : '其他',
      category: detail ? detail.category : 'workflow'
    };
  });
}

// ── Generate HTML ───────────────────────────────────────────
function generateHTML(skills, dateStr) {
  const formatStars = (s) => s === '—' ? '—' : (typeof s === 'number' ? (s>=1000 ? Math.floor(s/1000)+'K' : String(s)) : String(s));
  const formatInstalls = (s) => s === '—' || s === '内置' ? s : (typeof s === 'number' ? (s>=1000000 ? Math.floor(s/1000000)+'万+' : (s>=1000 ? Math.floor(s/1000)+'K' : String(s))) : String(s));

  const cardsHTML = skills.map((s, i) => {
    const rank = i + 1;
    const rCls = rank===1?'r1':rank===2?'r2':rank===3?'r3':'rn';
    const cCls = rank===1?'top-1':rank===2?'top-2':rank===3?'top-3':'';
    const d = s.detail || {};
    return `    <div class="card ${cCls}" data-category="${s.category||'workflow'}">
      <div class="rank ${rCls}">${rank}</div>
      <div class="card-body">
        <div class="card-name">${s.name} <span class="author">by ${s.author}</span></div>
        <p class="desc">${s.desc}</p>
        <div class="tags">
          <span class="tag ${s.category==='official'?'purple':s.category==='efficiency'?'amber':''}">${s.catLabel||''}</span>
          ${s.installs==='内置'||s.installs==='内置命令'?'<span class="tag green">内置</span>':''}
          ${String(s.stars).includes('K')||(typeof s.stars==='number'&&s.stars>100)?'<span class="tag">⭐ '+formatStars(s.stars)+'</span>':''}
        </div>
        <button class="detail-toggle" onclick="this.nextElementSibling.classList.toggle('open');this.textContent=this.nextElementSibling.classList.contains('open')?'收起详情 ▲':'展开详情 ▼'">展开详情 ▼</button>
        <div class="detail">
          ${d.how?`<h4>🧠 工作原理</h4><p>${d.how}</p>`:''}
          ${d.pros&&d.pros.length?`<h4 style="margin-top:12px">✅ 优点</h4><ul>${d.pros.map(p=>`<li>${p}</li>`).join('')}</ul>`:''}
          ${d.cons&&d.cons.length?`<h4 style="margin-top:12px">⚠️ 局限</h4><ul>${d.cons.map(c=>`<li>${c}</li>`).join('')}</ul>`:''}
          ${d.install?`<h4 style="margin-top:12px">📦 安装</h4><code>${d.install}</code>`:''}
        </div>
      </div>
      <div class="card-meta">
        <div class="meta-stars ${String(s.stars).includes('K')&&parseInt(s.stars)>100?'gold':''}">${formatStars(s.stars)}</div>
        <div class="meta-installs">🛒 ${formatInstalls(s.installs)}</div>
        <div class="meta-cat">${s.catLabel||''}</div>
      </div>
    </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>🔥 Claude Code 最受欢迎 Top 20 Skills — 每日更新</title>
<meta name="description" content="综合 GitHub Stars、Marketplace 安装量、社区共识，每日更新 Claude Code 最受欢迎 Top 20 Skills 排行榜。涵盖开发、设计、安全、效率全场景。">
<meta property="og:title" content="Claude Code Top 20 Skills 排行榜">
<meta property="og:description" content="每日更新 · 综合 GitHub Stars + Marketplace 安装量 + 社区共识">
<meta property="og:type" content="website">
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{--bg:#0b0f19;--surface:#131a2e;--card:#182032;--border:#1e2d4a;--text:#e2e8f0;--text2:#94a3b8;--accent:#f59e0b;--accent2:#3b82f6;--green:#10b981;--red:#ef4444;--purple:#8b5cf6;--radius:12px;--radius-sm:8px;--font-mono:'SF Mono','Fira Code','Cascadia Code',monospace}
  html{scroll-behavior:smooth}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);line-height:1.6;min-height:100vh}
  body::before{content:'';position:fixed;inset:0;z-index:0;pointer-events:none;background:radial-gradient(ellipse 80% 60% at 50% -10%,rgba(59,130,246,.08),transparent),radial-gradient(ellipse 50% 50% at 85% 50%,rgba(139,92,246,.05),transparent)}
  .container{max-width:1200px;margin:0 auto;padding:0 24px;position:relative;z-index:1}
  header{text-align:center;padding:64px 0 40px;position:relative;z-index:1}
  .badge{display:inline-flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--border);padding:6px 14px;border-radius:99px;font-size:13px;color:var(--text2);margin-bottom:18px}
  .badge .dot{width:8px;height:8px;border-radius:50%;background:var(--green);animation:pulse 2s infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  h1{font-size:clamp(2rem,4vw,3rem);font-weight:800;letter-spacing:-0.02em;margin-bottom:12px}
  h1 .emoji{display:inline-block;animation:bounce 2s infinite}
  @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
  .subtitle{color:var(--text2);font-size:17px;max-width:600px;margin:0 auto}
  .stats-bar{display:flex;justify-content:center;gap:40px;flex-wrap:wrap;padding:24px;margin:0 0 40px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);position:relative;z-index:1}
  .stat{text-align:center}
  .stat-val{font-size:28px;font-weight:700;font-variant-numeric:tabular-nums;font-family:var(--font-mono)}
  .stat-val.gold{color:var(--accent)}
  .stat-lbl{font-size:13px;color:var(--text2);margin-top:2px}
  .filters{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-bottom:32px;position:relative;z-index:1}
  .chip{background:var(--surface);border:1px solid var(--border);color:var(--text2);padding:7px 16px;border-radius:99px;font-size:13px;cursor:pointer;transition:all .2s;user-select:none}
  .chip:hover{color:var(--text);border-color:var(--accent2)}
  .chip.active{background:var(--accent2);border-color:var(--accent2);color:#fff}
  .cards{display:flex;flex-direction:column;gap:16px;position:relative;z-index:1;padding-bottom:64px}
  .card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:24px 28px;transition:all .25s;display:grid;grid-template-columns:56px 1fr auto;gap:20px;align-items:start}
  .card:hover{border-color:var(--accent2);transform:translateX(4px);box-shadow:0 8px 32px rgba(0,0,0,.3)}
  .card.top-1{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent),0 8px 32px rgba(245,158,11,.12)}
  .card.top-2{border-color:#c0c0c0;box-shadow:0 0 0 1px #6b7280}
  .card.top-3{border-color:#cd7f32;box-shadow:0 0 0 1px #9a5c1a}
  .rank{width:48px;height:48px;border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;font-family:var(--font-mono);color:#fff;position:relative}
  .rank.r1{background:linear-gradient(135deg,#f59e0b,#d97706)}
  .rank.r2{background:linear-gradient(135deg,#94a3b8,#6b7280)}
  .rank.r3{background:linear-gradient(135deg,#d97706,#92400e)}
  .rank.rn{background:var(--surface);color:var(--text2);border:2px solid var(--border)}
  .card-body{min-width:0}
  .card-name{font-size:18px;font-weight:700;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .card-name a{color:inherit;text-decoration:none}
  .card-name a:hover{color:var(--accent2)}
  .author{font-size:13px;color:var(--text2);font-weight:400}
  .desc{color:var(--text2);font-size:14px;margin:6px 0 10px;line-height:1.55}
  .tags{display:flex;gap:6px;flex-wrap:wrap}
  .tag{font-size:11px;padding:3px 10px;border-radius:99px;font-weight:600;background:rgba(59,130,246,.12);color:var(--accent2)}
  .tag.green{background:rgba(16,185,129,.12);color:var(--green)}
  .tag.purple{background:rgba(139,92,246,.12);color:var(--purple)}
  .tag.amber{background:rgba(245,158,11,.12);color:var(--accent)}
  .card-meta{text-align:right;white-space:nowrap}
  .meta-stars{font-weight:700;font-size:15px;font-family:var(--font-mono)}
  .meta-stars.gold{color:var(--accent)}
  .meta-installs{font-size:13px;color:var(--text2)}
  .meta-cat{font-size:11px;color:var(--text2);margin-top:2px;text-transform:uppercase;letter-spacing:.05em}
  .detail-toggle{margin-top:10px;font-size:12px;color:var(--accent2);cursor:pointer;background:none;border:none;font-weight:600;padding:0}
  .detail-toggle:hover{text-decoration:underline}
  .detail{display:none;margin-top:14px;padding:18px;background:var(--surface);border-radius:var(--radius-sm);border:1px solid var(--border);font-size:14px;color:var(--text2);line-height:1.7}
  .detail.open{display:block}
  .detail h4{color:var(--text);font-size:14px;margin-bottom:6px}
  .detail code{background:rgba(139,92,246,.15);color:#c4b5fd;padding:2px 7px;border-radius:4px;font-family:var(--font-mono);font-size:13px}
  .detail ul{margin:6px 0 0 18px;list-style-type:'▸ '}
  .detail li{margin-bottom:4px}
  footer{text-align:center;padding:32px 0;color:var(--text2);font-size:13px;border-top:1px solid var(--border);position:relative;z-index:1}
  .update-note{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 16px;margin-bottom:20px;text-align:center;font-size:13px;color:var(--text2)}
  .update-note .api-badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-left:6px}
  .api-badge.live{background:rgba(16,185,129,.15);color:var(--green)}
  .api-badge.cached{background:rgba(245,158,11,.15);color:var(--accent)}
  @media(max-width:768px){
    .card{grid-template-columns:40px 1fr;gap:12px;padding:18px}
    .card-meta{grid-column:1/-1;text-align:left;display:flex;gap:16px;flex-wrap:wrap}
    .stats-bar{gap:20px}
  }
</style>
</head>
<body>
<header>
  <div class="badge"><span class="dot"></span> 数据更新于 <span id="update-date">${dateStr}</span></div>
  <h1><span class="emoji">🔥</span> Claude Code 最受欢迎 Top 20 Skills</h1>
  <p class="subtitle">综合 GitHub Stars · Marketplace 安装量 · 社区共识 · 每日 09:00 CST 自动更新</p>
</header>
<div class="container">
  <div class="stats-bar">
    <div class="stat"><div class="stat-val gold">65,863+</div><div class="stat-lbl">生态 Skills 总数</div></div>
    <div class="stat"><div class="stat-val">2,300万+</div><div class="stat-lbl">头号 Skill 安装量</div></div>
    <div class="stat"><div class="stat-val">12,100+</div><div class="stat-lbl">Plugin 市场</div></div>
    <div class="stat"><div class="stat-val">Top 3%</div><div class="stat-lbl">精选率（1400+ → 20）</div></div>
  </div>
  <div class="update-note" id="update-note">
    数据来源：skills.sh API + GitHub + 社区共识 <span class="api-badge live" id="api-badge">LIVE API</span>
  </div>
  <div class="filters">
    <button class="chip active" data-filter="all">全部 ⭐</button>
    <button class="chip" data-filter="workflow">开发流程</button>
    <button class="chip" data-filter="frontend">前端/设计</button>
    <button class="chip" data-filter="quality">代码质量</button>
    <button class="chip" data-filter="memory">记忆/上下文</button>
    <button class="chip" data-filter="efficiency">Token优化</button>
    <button class="chip" data-filter="official">官方出品</button>
    <button class="chip" data-filter="docs">文档/Office</button>
  </div>
  <div class="cards" id="cards-container">
${cardsHTML}
  </div>
</div>
<footer>
  <p>数据来源：skills.sh · GitHub · Anthropic 官方 Marketplace · Composio · Redwerk · Skillselion</p>
  <p style="margin-top:4px">最后编译：<span id="compile-time"></span> · 下次更新：每日 09:00 CST（GitHub Actions 自动触发）</p>
</footer>
<script>
document.querySelectorAll('.chip').forEach(chip=>{chip.addEventListener('click',function(){document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));this.classList.add('active');const f=this.dataset.filter;document.querySelectorAll('.card').forEach(c=>{c.style.display=(f==='all'||c.dataset.category===f)?'':'none'})})});
(function(){const n=new Date();document.getElementById('compile-time').textContent=n.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+' CST';const nx=new Date(n);nx.setDate(nx.getDate()+1);nx.setHours(9,0,0,0);const d=Math.floor((nx-n)/1000),h=Math.floor(d/3600),m=Math.floor((d%3600)/60);document.getElementById('compile-time').textContent+=' · 距下次更新 '+h+'h '+m+'m'})();
</script>
</body>
</html>`;
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];

  // Try to fetch live data
  let skills = null;
  let source = 'cached';
  try {
    const raw = await fetchLiveData();
    if (raw) {
      skills = normalize(raw);
      source = 'live';
      console.log(`[build] Using LIVE data — ${skills.length} skills`);
    }
  } catch(e) {
    console.warn('[build] API fetch error, using fallback:', e.message);
  }

  // Fallback
  if (!skills || skills.length < 10) {
    skills = FALLBACK.map((s, i) => ({
      ...s,
      rank: i + 1,
      detail: DETAILS[s.name] || { how:'', pros:[], cons:[], install:'' },
      catLabel: DETAILS[s.name]?.catLabel || '其他',
      category: DETAILS[s.name]?.category || 'workflow'
    }));
    source = 'cached';
    console.log(`[build] Using FALLBACK data — ${skills.length} skills`);
  }

  // Generate HTML
  const html = generateHTML(skills, dateStr);

  // Update badge based on data source
  const finalHTML = html.replace(
    '<span class="api-badge live" id="api-badge">LIVE API</span>',
    source === 'live'
      ? '<span class="api-badge live" id="api-badge">LIVE API</span>'
      : '<span class="api-badge cached" id="api-badge">CACHED</span>'
  ).replace(
    '数据来源：skills.sh API + GitHub + 社区共识',
    source === 'live'
      ? '数据来源：skills.sh API + GitHub + 社区共识（实时数据）'
      : '数据来源：GitHub + 社区共识（API 暂不可用，使用缓存数据）'
  );

  writeFileSync(OUT, finalHTML, 'utf-8');
  console.log(`[build] ✅ Written to ${OUT} (${source})`);
}

main().catch(e => { console.error(e); process.exit(1); });
