# 🔥 Claude Code Top 20 Skills — 每日更新

> 综合 GitHub Stars、Marketplace 安装量、社区共识，每日自动更新的 Claude Code 最受欢迎 Top 20 Skills 排行榜。

**🌐 在线查看：** `https://<你的用户名>.github.io/top20-skills/`

---

## 特性

- 📊 **每日 09:00 CST 自动更新**（GitHub Actions）
- 🏆 综合排名：GitHub Stars + 安装量 + 社区共识
- 📋 每个 Skill 附带详细介绍、优缺点、安装命令
- 🎨 深色主题 + 金银铜高亮 + 8 分类筛选
- 📱 响应式布局

## 本地运行

```bash
npm install
npm run build    # 生成 index.html
npm run dev      # 生成并本地预览
```

## 项目结构

```
top20-skills/
├── .github/workflows/daily-update.yml   # 每日自动更新 + 部署
├── scripts/fetch-and-generate.js        # 数据抓取 + HTML 生成
├── index.html                           # 生成的网页（自动更新）
└── package.json
```

## 如何部署你自己的版本

1. Fork 这个仓库
2. 在 Settings → Pages 中启用 GitHub Pages（Source: GitHub Actions）
3. 等待第一次 Actions 运行完成
4. 访问 `https://<你的用户名>.github.io/top20-skills/`

## 数据来源

- [skills.sh](https://skills.sh/) — 官方 Skill 市场排行榜
- [GitHub](https://github.com/) — Stars & 仓库数据
- [Anthropic Official Marketplace](https://github.com/anthropics/claude-plugins-official)
- 社区精选：Composio / Redwerk / Skillselion

## License

MIT
