import requests
import json
import time
import re
from config import Config
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

class LLMClient:
    def __init__(self, db=None):
        self.db = db
        self.api_key = Config.LLM_API_KEY
        self.model_name = Config.LLM_MODEL_NAME
        self.api_base_url = Config.LLM_API_BASE_URL
        self.max_tokens = Config.LLM_MAX_TOKENS
        self.session = self._create_session()
        
        if self.db:
            config = self.db.get_llm_config()
            if config:
                if config.get('api_key'):
                    self.api_key = config['api_key']
                if config.get('model_name'):
                    self.model_name = config['model_name']
                if config.get('api_base_url'):
                    self.api_base_url = config['api_base_url']
                if config.get('max_tokens'):
                    self.max_tokens = config['max_tokens']
    
    def _create_session(self):
        session = requests.Session()
        retry_strategy = Retry(
            total=2,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["POST"]
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("https://", adapter)
        session.mount("http://", adapter)
        session.timeout = (10, 180)
        return session
    
    def _get_config(self, config_id=None):
        if not self.db:
            return {
                'api_key': self.api_key,
                'model_name': self.model_name,
                'api_base_url': self.api_base_url,
                'max_tokens': self.max_tokens
            }
        
        if config_id:
            config = self.db.get_llm_config(config_id)
        else:
            config = self.db.get_llm_config()
        
        if config:
            return {
                'api_key': config.get('api_key', self.api_key),
                'model_name': config.get('model_name', self.model_name),
                'api_base_url': config.get('api_base_url', self.api_base_url),
                'max_tokens': config.get('max_tokens', self.max_tokens)
            }
        return {
            'api_key': self.api_key,
            'model_name': self.model_name,
            'api_base_url': self.api_base_url,
            'max_tokens': self.max_tokens
        }
    
    def _search_aliases(self, query):
        """搜索别名"""
        if not self.db:
            return []
        
        aliases = self.db.get_all_aliases()
        results = []
        query_lower = query.lower()
        
        for alias in aliases:
            alias_name = alias['alias_name']
            alias_name_no_suffix = alias_name[:-1] if alias_name.endswith('_') else alias_name
            description = alias.get('description', '')
            columns = []
            try:
                if alias.get('columns'):
                    columns = json.loads(alias['columns'])
            except:
                pass
            
            if (query_lower in alias_name.lower() or 
                query_lower in alias_name_no_suffix.lower() or
                query_lower in description.lower()):
                results.append({
                    'name': alias_name,
                    'description': description,
                    'columns': columns,
                    'table_dependencies': json.loads(alias.get('table_dependencies', '[]')) if alias.get('table_dependencies') else []
                })
        
        return results[:10]
    
    def _get_alias_definition(self, alias_name):
        """获取别名定义"""
        if not self.db:
            return None
        
        aliases = self.db.get_all_aliases()
        for alias in aliases:
            if alias['alias_name'] == alias_name or alias['alias_name'].rstrip('_') == alias_name:
                columns = []
                table_dependencies = []
                try:
                    if alias.get('columns'):
                        columns = json.loads(alias['columns'])
                    if alias.get('table_dependencies'):
                        table_dependencies = json.loads(alias['table_dependencies'])
                except:
                    pass
                return {
                    'name': alias['alias_name'],
                    'description': alias.get('description', ''),
                    'sql_text': alias.get('sql_content', ''),
                    'columns': columns,
                    'table_dependencies': table_dependencies
                }
        return None
    
    def _search_tables(self, query):
        """搜索表"""
        if not self.db:
            return []
        
        tables = self.db.get_all_tables()
        results = []
        query_lower = query.lower()
        
        for table in tables:
            table_name = table['table_name']
            description = table.get('description', '')
            columns = []
            try:
                if table.get('columns'):
                    columns = json.loads(table['columns'])
            except:
                pass
            
            if (query_lower in table_name.lower() or
                query_lower in description.lower()):
                results.append({
                    'name': table_name,
                    'description': description,
                    'columns': columns,
                    'primary_key': table.get('primary_key'),
                    'partition_info': table.get('partition_info')
                })
        
        return results[:10]
    
    def _get_table_columns(self, table_name):
        """获取表的列信息"""
        if not self.db:
            return []
        
        tables = self.db.get_all_tables()
        for table in tables:
            if table['table_name'] == table_name:
                try:
                    if table.get('columns'):
                        return json.loads(table['columns'])
                except:
                    pass
                break
        
        return []
    
    def _extract_aliases_and_tables(self, sql):
        """从SQL中提取别名和表引用"""
        aliases = set()
        tables = set()
        
        pattern = r'\b([a-zA-Z_][a-zA-Z0-9_]*)\b'
        words = re.findall(pattern, sql)
        
        all_aliases = self.db.get_all_aliases() if self.db else []
        all_tables = self.db.get_all_tables() if self.db else []
        
        alias_names = {a['alias_name'].rstrip('_') for a in all_aliases}
        table_names = {t['table_name'] for t in all_tables}
        
        for word in words:
            if word in alias_names:
                aliases.add(word)
            if word in table_names:
                tables.add(word)
        
        return list(aliases), list(tables)
    
    def _validate_sql_columns(self, sql):
        """验证SQL中的列名是否存在于表或别名中"""
        if not self.db:
            return {'valid': True, 'errors': []}
        
        errors = []
        used_columns = set()
        valid_columns = {}
        columns_with_comments = {}
        
        aliases, tables = self._extract_aliases_and_tables(sql)
        
        for alias_name in aliases:
            alias_def = self._get_alias_definition(alias_name)
            if alias_def:
                alias_cols = []
                alias_cols_with_comments = []
                for col in alias_def.get('columns', []):
                    if isinstance(col, dict):
                        col_name = col.get('name', col.get('column', ''))
                        col_comment = col.get('comment', col.get('description', ''))
                        alias_cols.append(col_name)
                        if col_comment:
                            alias_cols_with_comments.append(f"{col_name} ({col_comment})")
                        else:
                            alias_cols_with_comments.append(col_name)
                    else:
                        alias_cols.append(str(col))
                        alias_cols_with_comments.append(str(col))
                valid_columns[alias_name] = set(alias_cols)
                columns_with_comments[alias_name] = alias_cols_with_comments
        
        for table_name in tables:
            table_cols = self._get_table_columns(table_name)
            cols = []
            cols_with_comments = []
            for col in table_cols:
                if isinstance(col, dict):
                    col_name = col.get('name', col.get('column', ''))
                    col_comment = col.get('comment', col.get('description', ''))
                    cols.append(col_name)
                    if col_comment:
                        cols_with_comments.append(f"{col_name} ({col_comment})")
                    else:
                        cols_with_comments.append(col_name)
                else:
                    cols.append(str(col))
                    cols_with_comments.append(str(col))
            valid_columns[table_name] = set(cols)
            columns_with_comments[table_name] = cols_with_comments
        
        select_pattern = r'SELECT\s+(.+?)(?=\s+FROM)'
        select_match = re.search(select_pattern, sql, re.IGNORECASE | re.DOTALL)
        if select_match:
            select_content = select_match.group(1)
            col_pattern = r'([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)(?=\s*,|\s+AS|\s+FROM|\s+WHERE|$)'
            columns = re.findall(col_pattern, select_content)
            for col in columns:
                if col.upper() not in ['DISTINCT', 'AS']:
                    if '.' in col:
                        parts = col.split('.')
                        used_columns.add(parts[-1])
                    else:
                        used_columns.add(col)
        
        where_pattern = r'WHERE\s+(.+?)(?=\s+GROUP|\s+ORDER|\s+LIMIT|$)'
        where_match = re.search(where_pattern, sql, re.IGNORECASE | re.DOTALL)
        if where_match:
            where_content = where_match.group(1)
            col_pattern = r'([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)\s*[=<>!]'
            columns = re.findall(col_pattern, where_content)
            for col in columns:
                if '.' in col:
                    parts = col.split('.')
                    used_columns.add(parts[-1])
                else:
                    used_columns.add(col)
        
        for col in used_columns:
            found = False
            for table_or_alias, valid_cols in valid_columns.items():
                if col in valid_cols:
                    found = True
                    break
            if not found:
                errors.append(f"列 '{col}' 不存在于任何引用的表或别名中")
        
        return {
            'valid': len(errors) == 0,
            'errors': errors,
            'valid_columns': valid_columns,
            'columns_with_comments': columns_with_comments,
            'used_columns': list(used_columns)
        }
    
    def _validate_and_return_sql(self, sql):
        """验证SQL并返回结果，如果列名不存在则返回错误信息"""
        validation_result = self._validate_sql_columns(sql)
        
        if validation_result['valid']:
            return {'success': True, 'sql': sql}
        else:
            error_msg = "\n".join(validation_result['errors'])
            valid_cols_info = "\n".join([f"  {table}: {list(cols)}" for table, cols in validation_result['valid_columns'].items()])
            return {
                'success': False,
                'error': f"生成的SQL包含无效列名！\n\n错误信息：\n{error_msg}\n\n可用的有效列：\n{valid_cols_info}"
            }
    
    def _generate_sql_react(self, prompt, config):
        """ReAct Loop方式生成SQL"""
        api_key = config['api_key']
        max_iterations = 100
        
        available_tools = """你可用的工具（functions）：

1. search_aliases(query: str) - 搜索视图别名
   - 根据关键词搜索相关的视图别名
   - 返回：别名名称、描述、可用列、依赖表

2. get_alias_definition(alias_name: str) - 获取别名定义
   - 获取指定别名的完整SQL定义和元信息
   - 返回：别名名称、描述、SQL文本、可用列、依赖表

3. search_tables(query: str) - 搜索基础表
   - 根据关键词搜索相关的基础表
   - 返回：表名称、描述、列信息、主键、分区信息

4. get_table_columns(table_name: str) - 获取表的列信息
   - 获取指定表的所有列定义
   - 返回：列名、类型、注释、是否主键

5. validate_and_fix_sql(sql: str, aliases: list, tables: list) - 验证并修复SQL
   - 验证SQL语法是否正确
   - 检查引用的字段是否在别名或表中存在
   - 如有问题，返回修复建议

当确定已生成正确的SQL时，使用最终回复格式返回SQL。"""

        system_prompt = f"""你是一个专业的SQL助手，擅长使用ReAct（Reasoning + Acting）模式生成SQL。

你的工作方式：
1. **Thought（思考）**: 分析用户需求，决定下一步应该采取什么行动
2. **Action（行动）**: 调用合适的工具获取信息或验证SQL
3. **Observation（观察）**: 获取工具返回的结果
4. **Loop（循环）**: 根据观察结果继续思考和行动，直到生成正确的SQL

{available_tools}

数据库环境：Trino (Presto)
日期格式：'YYYYMMDD'，如 '20260610'
T-1天表示前一天：DATE_FORMAT(DATE_SUB(CURRENT_DATE, INTERVAL 1 DAY), '%Y%m%d')

别名命名规则：别名名称以下划线结尾（如 user_kd_jcwg_rel_），使用时请去掉末尾下划线。

**【重要】列名限制规则：**
🚫 **严格禁止凭空生成列名！**
✅ **只能使用工具返回的列名！**
✅ **每次生成SQL前必须先调用 get_table_columns 或 get_alias_definition 获取所有用到的表/别名的列信息！**
✅ **必须使用获取到的真实列名，禁止自己推测或编造列名！**
✅ **生成SQL后必须调用 validate_and_fix_sql 进行验证！**

**生成SQL的要求：**
1. 必须使用已注册的别名或基础表
2. **列名必须严格来自工具返回的列列表，禁止凭空推测**
3. **生成SQL前必须调用 get_table_columns 或 get_alias_definition 获取所有用到的表/别名的列信息**
4. **生成SQL后必须调用 validate_and_fix_sql 进行验证**
5. 使用正确的数据类型进行条件判断
6. 生成的SQL必须可执行，语法正确
7. 优先使用别名，其次使用基础表
8. **如果用户需求中提到的列名在工具返回的列表中不存在，必须告知用户该列不存在，而不是自己编造！**

请开始分析用户需求，通过思考和行动生成正确的SQL。"""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"用户需求：{prompt}\n\n请使用ReAct模式分析需求并生成SQL。"}
        ]
        
        try:
            for iteration in range(max_iterations):
                response = self.session.post(
                    f"{config['api_base_url']}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": config['model_name'],
                        "messages": messages,
                        "max_tokens": 2000
                    }
                )
                
                response.raise_for_status()
                result = response.json()
                
                if not result.get('choices'):
                    return {'success': False, 'error': '未获取到响应'}
                
                assistant_message = result['choices'][0]['message']['content'].strip()
                messages.append({"role": "assistant", "content": assistant_message})
                
                if '```sql' in assistant_message.lower() or 'final sql:' in assistant_message.lower():
                    sql_match = re.search(r'```sql\s*(.*?)\s*```', assistant_message, re.DOTALL | re.IGNORECASE)
                    if sql_match:
                        sql = sql_match.group(1).strip()
                        return self._validate_and_return_sql(sql)
                    
                    final_match = re.search(r'final\s+sql:\s*(.*)', assistant_message, re.DOTALL | re.IGNORECASE)
                    if final_match:
                        sql = final_match.group(1).strip()
                        return self._validate_and_return_sql(sql)
                    
                    if assistant_message.strip().startswith('SELECT') or assistant_message.strip().startswith('WITH'):
                        sql = assistant_message.strip()
                        return self._validate_and_return_sql(sql)
                
                if 'search_aliases(' in assistant_message:
                    match = re.search(r'search_aliases\s*\(\s*["\']([^"\']+)["\']\s*\)', assistant_message)
                    if match:
                        query = match.group(1)
                        results = self._search_aliases(query)
                        observation = f"搜索别名 '{query}' 的结果：\n{json.dumps(results, ensure_ascii=False, indent=2)}"
                        messages.append({"role": "user", "content": f"Observation: {observation}"})
                        continue
                
                if 'get_alias_definition(' in assistant_message:
                    match = re.search(r'get_alias_definition\s*\(\s*["\']([^"\']+)["\']\s*\)', assistant_message)
                    if match:
                        alias_name = match.group(1)
                        result_def = self._get_alias_definition(alias_name)
                        observation = f"别名 '{alias_name}' 的定义：\n{json.dumps(result_def, ensure_ascii=False, indent=2)}" if result_def else f"未找到别名 '{alias_name}'"
                        messages.append({"role": "user", "content": f"Observation: {observation}"})
                        continue
                
                if 'search_tables(' in assistant_message:
                    match = re.search(r'search_tables\s*\(\s*["\']([^"\']+)["\']\s*\)', assistant_message)
                    if match:
                        query = match.group(1)
                        results = self._search_tables(query)
                        observation = f"搜索表 '{query}' 的结果：\n{json.dumps(results, ensure_ascii=False, indent=2)}"
                        messages.append({"role": "user", "content": f"Observation: {observation}"})
                        continue
                
                if 'get_table_columns(' in assistant_message:
                    match = re.search(r'get_table_columns\s*\(\s*["\']([^"\']+)["\']\s*\)', assistant_message)
                    if match:
                        table_name = match.group(1)
                        results = self._get_table_columns(table_name)
                        observation = f"表 '{table_name}' 的列信息：\n{json.dumps(results, ensure_ascii=False, indent=2)}"
                        messages.append({"role": "user", "content": f"Observation: {observation}"})
                        continue
                
                if 'validate_and_fix_sql(' in assistant_message:
                    match = re.search(r'validate_and_fix_sql\s*\(\s*["\']([^"\']+)["\']\s*\)', assistant_message)
                    if match:
                        sql = match.group(1)
                        validation_result = self._validate_sql_columns(sql)
                        if validation_result['valid']:
                            observation = f"✅ SQL验证通过！\n使用的列：{validation_result['used_columns']}"
                            messages.append({"role": "user", "content": f"Observation: {observation}"})
                            messages.append({"role": "user", "content": "SQL验证通过，请输出最终的SQL。"})
                        else:
                            valid_cols_info = "\n".join([f"  {table}: {cols}" for table, cols in validation_result.get('columns_with_comments', validation_result['valid_columns']).items()])
                            error_msg = "\n".join([f"  ❌ {err}" for err in validation_result['errors']])
                            observation = f"""❌ SQL验证失败！必须修复后才能继续！

🚫 **错误信息：**
{error_msg}

📋 **可用的有效列（必须严格使用以下列名）：**
{valid_cols_info}

⚠️ **【强制要求】**
1. 必须使用上面列出的有效列名，禁止编造或推测列名！
2. 必须重新修改SQL，将错误的列名替换为有效列名！
3. 修改后必须再次调用 validate_and_fix_sql 验证！
4. 只有验证通过后才能输出最终SQL！"""
                            messages.append({"role": "user", "content": f"Observation: {observation}"})
                        continue
                
                messages.append({"role": "user", "content": "请继续你的思考和行动，或者生成最终的SQL。"})

            return {'success': False, 'error': '达到最大迭代次数，未能生成SQL'}
        
        except requests.exceptions.ConnectTimeout:
            return {'success': False, 'error': f"连接超时，请检查大模型服务是否运行在 {config['api_base_url']}"}
        except requests.exceptions.ReadTimeout:
            return {'success': False, 'error': '读取超时，大模型响应时间过长，请稍后重试'}
        except requests.exceptions.ConnectionError as e:
            return {'success': False, 'error': f"无法连接到大模型服务: {str(e)}"}
        except requests.exceptions.RequestException as e:
            return {'success': False, 'error': str(e)}
    
    def generate_sql(self, prompt, config_id=None):
        """生成SQL（使用ReAct Loop方式）"""
        config = self._get_config(config_id)
        api_key = config['api_key']
        
        if not api_key:
            return {'success': False, 'error': '未配置大模型API密钥'}
        
        return self._generate_sql_react(prompt, config)
    
    def optimize_sql(self, sql, config_id=None):
        config = self._get_config(config_id)
        api_key = config['api_key']
        
        if not api_key:
            return {'success': False, 'error': '未配置大模型API密钥'}
        
        system_prompt = """
你是一个专业的SQL优化专家。请对用户提供的SQL语句进行优化。

数据库环境：Trino (Presto)

优化要求：
1. 优化查询性能，提升执行效率
2. 简化SQL逻辑，提高可读性
3. 消除冗余操作，减少不必要的计算
4. 优化JOIN顺序和条件
5. 使用合适的索引提示（如适用）
6. 确保优化后的SQL符合Trino语法规范

请输出优化后的SQL语句，并简要说明优化点。
"""
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"请优化以下SQL语句：\n\n{sql}"}
        ]
        
        try:
            response = self.session.post(
                f"{config['api_base_url']}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": config['model_name'],
                    "messages": messages,
                    "max_tokens": config['max_tokens']
                }
            )
            
            response.raise_for_status()
            result = response.json()
            
            if result.get('choices'):
                content = result['choices'][0]['message']['content'].strip()
                return {'success': True, 'result': content}
            else:
                return {'success': False, 'error': '未获取到响应'}
        
        except requests.exceptions.ConnectTimeout:
            return {'success': False, 'error': f"连接超时，请检查大模型服务是否运行在 {config['api_base_url']}"}
        except requests.exceptions.ReadTimeout:
            return {'success': False, 'error': '读取超时，大模型响应时间过长，请稍后重试'}
        except requests.exceptions.ConnectionError as e:
            return {'success': False, 'error': f"无法连接到大模型服务: {str(e)}"}
        except requests.exceptions.RequestException as e:
            return {'success': False, 'error': str(e)}
    
    def test_connection(self, config_id=None):
        config = self._get_config(config_id)
        api_key = config['api_key']
        
        if not api_key:
            return {'success': False, 'error': '未配置API密钥'}
        
        try:
            response = requests.post(
                f"{config['api_base_url']}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": config['model_name'],
                    "messages": [{"role": "user", "content": "Hello"}],
                    "max_tokens": 10
                },
                timeout=15
            )
            
            if response.status_code == 200:
                return {'success': True, 'message': '连接成功'}
            else:
                return {'success': False, 'error': f"HTTP错误: {response.status_code}"}
        
        except requests.exceptions.RequestException as e:
            return {'success': False, 'error': str(e)}
    
    def has_config(self):
        return bool(self.api_key)