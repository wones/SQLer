import re
from sql_optimizer.rules import SQL_KEYWORDS, AGGREGATE_FUNCTIONS, DATE_FUNCTIONS, STRING_FUNCTIONS, NUMERIC_FUNCTIONS, CONDITIONAL_FUNCTIONS

class SQLCompleter:
    def __init__(self, db=None):
        self.db = db
        self.keywords = SQL_KEYWORDS
        self.functions = {
            'aggregate': AGGREGATE_FUNCTIONS,
            'date': DATE_FUNCTIONS,
            'string': STRING_FUNCTIONS,
            'numeric': NUMERIC_FUNCTIONS,
            'conditional': CONDITIONAL_FUNCTIONS
        }
        
        self.type_weights = {
            'keyword': 3,
            'function': 2,
            'alias': 1,
            'table': 1
        }
    
    def get_completions(self, sql, cursor_position):
        completions = []
        prefix = self._extract_prefix(sql, cursor_position)
        
        if not prefix:
            return completions
        
        prefix_upper = prefix.upper()
        prefix_lower = prefix.lower()
        
        for keyword in self.keywords:
            if keyword.startswith(prefix_upper):
                score = self._calculate_score(keyword, prefix_upper, 'keyword')
                completions.append({
                    'type': 'keyword',
                    'value': keyword,
                    'display': keyword,
                    'description': 'SQL关键字',
                    '_score': score
                })
        
        for func_type, funcs in self.functions.items():
            type_desc = self._get_func_type_desc(func_type)
            for func in funcs:
                if func.startswith(prefix_upper):
                    score = self._calculate_score(func, prefix_upper, 'function')
                    completions.append({
                        'type': 'function',
                        'value': func,
                        'display': func + '()',
                        'description': type_desc,
                        '_score': score
                    })
        
        alias_names = self.db.get_all_alias_names()
        for alias in alias_names:
            if alias.lower().startswith(prefix_lower):
                score = self._calculate_score(alias, prefix_lower, 'alias')
                completions.append({
                    'type': 'alias',
                    'value': alias,
                    'display': alias,
                    'description': 'SQL别名视图',
                    '_score': score
                })
        
        tables = self.db.get_all_tables()
        for table in tables:
            table_name = table['table_name']
            schema_name = table.get('schema_name')
            
            full_table_name = f"{schema_name}.{table_name}" if schema_name else table_name
            
            if table_name.lower().startswith(prefix_lower) or full_table_name.lower().startswith(prefix_lower):
                score = self._calculate_score(table_name, prefix_lower, 'table')
                description = f"表: {table.get('description', '')}" if table.get('description') else '数据表'
                completions.append({
                    'type': 'table',
                    'value': full_table_name,
                    'display': full_table_name,
                    'description': description,
                    '_score': score
                })
        
        completions.sort(key=lambda x: (-x['_score'], x['value'].lower()))
        
        return [c for c in completions[:20] if '_score' in c]
    
    def _calculate_score(self, item, prefix, item_type):
        base_score = self.type_weights.get(item_type, 1)
        
        exact_match = item.lower() == prefix.lower()
        if exact_match:
            return base_score * 10
        
        starts_with = item.lower().startswith(prefix.lower())
        if starts_with:
            length_score = min(len(prefix) / len(item), 1)
            return base_score * (1 + length_score)
        
        contains = prefix.lower() in item.lower()
        if contains:
            return base_score * 0.5
        
        return 0
    
    def _get_func_type_desc(self, func_type):
        descriptions = {
            'aggregate': '聚合函数',
            'date': '日期函数',
            'string': '字符串函数',
            'numeric': '数值函数',
            'conditional': '条件函数'
        }
        return descriptions.get(func_type, func_type + '函数')
    
    def _extract_prefix(self, sql, cursor_position):
        before_cursor = sql[:cursor_position]
        words = re.findall(r'[a-zA-Z_][a-zA-Z0-9_]*$', before_cursor)
        return words[0] if words else ''
    
    def get_keywords(self):
        return self.keywords
    
    def get_functions(self):
        return self.functions