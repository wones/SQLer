# 个人SQL助手

> 一款基于LLM的智能SQL助手，助力数据分析效率提升

***

## 📋 目录

- [项目简介](#项目简介)
- [功能特性](#功能特性)
- [快速开始](#快速开始)
- [使用指南](#使用指南)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [配置说明](#配置说明)
- [开发指南](#开发指南)
- [贡献说明](#贡献说明)
- [许可证](#许可证)

***

## 🌟 项目简介

个人SQL助手是一款基于大语言模型（LLM）的智能SQL辅助工具，旨在帮助数据分析师、开发人员快速编写、优化和管理SQL查询。

**核心价值**：

- 🚀 **自然语言转SQL**：输入需求描述，AI自动生成SQL
- 📚 **知识沉淀**：将常用查询保存为别名，便于复用
- ⚡ **智能优化**：自动验证列名、优化SQL性能
- 🔍 **快速检索**：强大的搜索功能，快速定位查询

***

## ✨ 功能特性

### 核心功能

| 功能          | 描述                 | 状态 |
| ----------- | ------------------ | -- |
| **LLM智能生成** | 自然语言描述转SQL，上下文自动注入 | ✅  |
| **列名验证**    | 自动验证列名正确性，错误自动修复   | ✅  |
| **别名管理**    | CRUD操作、分组管理、依赖追踪   | ✅  |
| **基础表管理**   | 表结构定义、列定义、主键设置     | ✅  |
| **SQL优化**   | 解析优化、格式化、性能优化      | ✅  |
| **搜索功能**    | 别名搜索、表搜索、关键词高亮     | ✅  |
| **依赖追踪**    | 自动识别依赖表，支持正向追踪     | ✅  |

### 特色功能

1. **智能错误修复**：最多100次迭代修复，确保SQL正确
2. **自动识别列名**：编辑别名时自动解析SQL提取列名
3. **智能合并更新**：保留用户修改，更新未修改内容
4. **分层查询体系**：支持L1基础层、L2聚合层、L3报表层
5. **团队协作**：知识沉淀与共享，支持多人协作

***

## 🚀 快速开始

### 环境要求

- Python 3.10+
- Node.js（可选，用于开发）

### 安装与运行

#### 方式一：直接运行可执行文件

```bash
# 下载并运行
./dist/SQL助手.exe
```

#### 方式二：源码运行

```bash
# 克隆项目
git clone <repository-url>
cd 个人SQL助手

# 安装依赖
pip install -r requirements.txt

# 运行应用
python app.py
```

#### 方式三：开发模式

```bash
# 安装依赖
pip install -r requirements.txt

# 启动开发服务器
python app.py

# 访问 http://localhost:5000
```

***

## 📖 使用指南

### 基础使用流程

```
┌─────────────────────────────────────────────────────────────┐
│  Step 1: 输入需求                                          │
│  在SQLer模块输入自然语言描述                                  │
│  例如："查询最近30天的活跃用户"                               │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 2: 生成SQL                                           │
│  点击「🤖 生成SQL」按钮                                      │
│  系统自动生成SQL并验证列名                                   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 3: 优化SQL                                           │
│  点击「⚡ 解析优化」按钮                                      │
│  系统自动优化SQL并格式化                                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 4: 保存别名                                          │
│  点击「💾 保存别名」按钮                                     │
│  自动识别列名和依赖表                                        │
└─────────────────────────────────────────────────────────────┘
```

### 高级使用技巧

#### 1. 构建分层查询体系

```sql
-- L1: 基础层（单表查询）
SELECT user_id, user_name FROM sys_user  -- 保存为 user_base

-- L2: 聚合层（复用L1）
SELECT u.user_id, COUNT(o.order_id) AS order_count
FROM user_base u
JOIN order_base o ON u.user_id = o.user_id  -- 保存为 user_order_summary

-- L3: 报表层（复用L2）
SELECT *, CASE WHEN total_amount > 10000 THEN 'VIP' ELSE '普通' END AS level
FROM user_order_summary  -- 保存为 user_value_report
```

#### 2. 使用搜索功能

```
在左侧栏搜索框输入关键词：
🔍 [用户订单] [🔍]

搜索结果：
• user_order_summary - 用户订单汇总
• user_order_report - 用户订单报表
```

#### 3. 智能错误修复示例

```
输入："查询用户姓名和订单数量"

第一次生成（有错误）：
SELECT user_nam, order_cnt FROM user_base

错误提示：
❌ 列 'user_nam' 不存在
❌ 列 'order_cnt' 不存在

自动修复后：
SELECT user_name, COUNT(order_id) AS order_count
FROM user_base u
JOIN order_base o ON u.user_id = o.user_id
```

***

## 🛠️ 技术栈

### 后端

| 技术       | 版本    | 用途     |
| -------- | ----- | ------ |
| Python   | 3.10+ | 主语言    |
| Flask    | 2.0+  | Web框架  |
| SQLite   | 3.0+  | 数据库    |
| Requests | 2.0+  | HTTP请求 |
| SQLGlot  | 18.0+ | SQL解析  |

### 前端

| 技术         | 版本   | 用途   |
| ---------- | ---- | ---- |
| HTML5      | -    | 页面结构 |
| CSS3       | -    | 样式设计 |
| JavaScript | ES6+ | 交互逻辑 |

### AI集成

| 服务         | 用途     |
| ---------- | ------ |
| OpenAI API | LLM生成  |
| 自定义模型      | 支持多种模型 |

***

## 📁 项目结构

```
个人SQL助手/
├── app.py                    # 主应用入口
├── sql_assistant.spec        # PyInstaller配置
├── requirements.txt          # 依赖列表
├── api/                      # REST API
│   ├── aliases.py            # 别名API
│   ├── tables.py             # 表API
│   ├── sql.py                # SQL处理API
│   └── llm.py                # LLM API
├── llm_integration/          # LLM集成
│   └── client.py             # LLM客户端
├── sql_parser/               # SQL解析器
│   └── resolver.py           # SQL解析逻辑
├── storage/                  # 数据存储
│   └── database.py           # 数据库操作
├── static/                   # 静态资源
│   ├── css/                  # 样式文件
│   ├── js/                   # JavaScript
│   └── index.html            # 主页面
└── docs/                     # 文档
    ├── 最佳实践指南.md
    ├── 功能组合深度分析.md
```

***

## ⚙️ 配置说明

### LLM配置

首次运行时需要配置LLM服务：

1. 点击右上角「⚙️ 配置」按钮
2. 输入API密钥和API地址
3. 选择模型（支持Openai协议：gpt-4、gpt-3.5等）
4. 点击「保存配置」

<br />

***

## 🔧 开发指南

### 开发环境搭建

```bash
# 克隆项目
git clone <repository-url>
cd 个人SQL助手

# 创建虚拟环境
python -m venv venv
venv\Scripts\activate  # Windows

# 安装依赖
pip install -r requirements.txt

# 启动开发服务器
python app.py
```

### 代码规范

- Python：遵循PEP8规范
- JavaScript：使用ES6+语法
- CSS：使用BEM命名规范

### 打包发布

```bash
# 安装PyInstaller
pip install pyinstaller

# 打包
pyinstaller sql_assistant.spec --clean

# 输出位置：dist/SQL助手.exe
```

***

## 🤝 贡献说明

欢迎贡献代码！请遵循以下流程：

1. Fork项目
2. 创建功能分支：`git checkout -b feature/xxx`
3. 提交代码：`git commit -m "添加xxx功能"`
4. 推送分支：`git push origin feature/xxx`
5. 创建Pull Request

### 贡献规范

- 代码风格：遵循项目现有风格
- 提交信息：清晰描述变更内容
- 测试：确保代码通过测试

***

## 📄 许可证

本项目采用 MIT 许可证，详见 [LICENSE](LICENSE) 文件。

***

## 📞 联系方式

如有问题或建议，请通过以下方式联系：

- 项目地址：<repository-url>
- 提交Issue：<issues-url>

***

*项目版本：v1.0*
*最后更新：2026年6月*
*作者：wones*

***

**感谢使用个人SQL智能助手！🚀**
