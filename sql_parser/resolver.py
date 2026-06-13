import re

class SQLResolver:
    def __init__(self, db=None):
        self.db = db
        self.alias_cache = {}
    
    def _get_alias_sql(self, alias_name):
        if alias_name in self.alias_cache:
            return self.alias_cache[alias_name]
        
        alias = self.db.get_alias_by_name(alias_name)
        if alias:
            self.alias_cache[alias_name] = alias['sql_content']
            return alias['sql_content']
        
        alias_with_suffix = alias_name + '_'
        if alias_with_suffix in self.alias_cache:
            return self.alias_cache[alias_with_suffix]
        
        alias = self.db.get_alias_by_name(alias_with_suffix)
        if alias:
            self.alias_cache[alias_with_suffix] = alias['sql_content']
            return alias['sql_content']
        
        return None
    
    def resolve_aliases(self, sql):
        self.alias_cache = {}
        sql = sql.strip()
        
        if sql.endswith(';'):
            sql = sql[:-1].strip()
        
        alias_names = self.db.get_all_alias_names()
        for alias_name in alias_names:
            if sql == alias_name or sql == alias_name + ';':
                alias_sql = self._get_alias_sql(alias_name)
                if alias_sql:
                    return alias_sql
        
        resolved = self._resolve_recursive(sql, set())
        
        resolved = self._replace_remaining_aliases(resolved)
        
        return self._remove_alias_suffix(resolved)
    
    def _replace_remaining_aliases(self, sql):
        result = sql
        alias_names = self.db.get_all_alias_names()
        
        for alias_name in alias_names:
            if not alias_name.endswith('_'):
                continue
            
            alias_sql = self._get_alias_sql(alias_name)
            if not alias_sql:
                continue
            
            actual_name = alias_name[:-1]
            
            pattern = re.compile(r'(?<!\.)\b' + re.escape(alias_name) + r'\s+(AS\s+)([a-zA-Z_][a-zA-Z0-9_]*)', re.IGNORECASE)
            result = pattern.sub(f'({alias_sql}) \\1\\2', result)
            
            pattern2 = re.compile(r'(?<!\.)(?<![aA][sS])\b' + re.escape(alias_name) + r'\b(?!\.)', re.IGNORECASE)
            result = pattern2.sub(f'({alias_sql}) AS {actual_name}', result)
        
        return result
    
    def _remove_alias_suffix(self, sql):
        alias_names = self.db.get_all_alias_names()
        result = sql
        
        for alias_name in alias_names:
            if alias_name.endswith('_'):
                actual_name = alias_name[:-1]
                as_pattern = re.compile(r'(?i)AS\s+' + re.escape(alias_name))
                placeholder = f'__ALIAS_SUFFIX_PLACEHOLDER_{actual_name}__'
                result = as_pattern.sub(f'AS {placeholder}', result)
        
        for alias_name in alias_names:
            if alias_name.endswith('_'):
                actual_name = alias_name[:-1]
                pattern = re.compile(r'(?<!\.)\b' + re.escape(alias_name) + r'(?!\.)\b', re.IGNORECASE)
                result = pattern.sub(actual_name, result)
        
        for alias_name in alias_names:
            if alias_name.endswith('_'):
                actual_name = alias_name[:-1]
                placeholder = f'__ALIAS_SUFFIX_PLACEHOLDER_{actual_name}__'
                result = result.replace(placeholder, alias_name)
        
        return result
    
    def _resolve_recursive(self, sql, visited_aliases, alias_usage=None):
        if alias_usage is None:
            alias_usage = {}
        
        table_pattern = re.compile(r'\b(FROM|JOIN|INNER JOIN|LEFT JOIN|RIGHT JOIN|OUTER JOIN)\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\s+(?:AS\s+)?[a-zA-Z_][a-zA-Z0-9_]*)?(?:\s*,\s*[a-zA-Z_][a-zA-Z0-9_]*(?:\s+(?:AS\s+)?[a-zA-Z_][a-zA-Z0-9_]*)?)*)', re.IGNORECASE)
        
        matches = list(table_pattern.finditer(sql))
        resolved_sql = sql
        
        for match in reversed(matches):
            keyword = match.group(1)
            tables_part = match.group(2)
            
            table_items = self._parse_table_list(tables_part)
            
            for table_item in table_items:
                table_name = table_item['name']
                user_alias = table_item['alias']
                
                if table_name.lower() in ('select', 'from', 'where', 'group', 'order', 'having', 'limit', 'offset', 'as'):
                    continue
                
                alias_sql = self._get_alias_sql(table_name)
                if alias_sql:
                    actual_name = table_name[:-1] if table_name.endswith('_') else table_name
                    
                    alias_usage[actual_name] = alias_usage.get(actual_name, 0) + 1
                    usage_count = alias_usage[actual_name]
                    
                    if user_alias:
                        current_alias = user_alias
                    elif usage_count > 1:
                        current_alias = f'{actual_name}_{usage_count}'
                    else:
                        current_alias = actual_name
                    
                    new_visited = visited_aliases | {actual_name}
                    resolved_alias_sql = self._resolve_recursive(alias_sql, new_visited, alias_usage)
                    
                    subquery = f'({resolved_alias_sql}) AS {current_alias}'
                    resolved_sql = resolved_sql.replace(f'{table_name}{" AS " + user_alias if user_alias else ""}', subquery, 1)
        
        return resolved_sql
    
    def _parse_table_list(self, tables_str):
        result = []
        parts = tables_str.split(',')
        for part in parts:
            part = part.strip()
            if not part:
                continue
            
            as_match = re.match(r'^([a-zA-Z_][a-zA-Z0-9_]*)\s+(?:AS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)$', part, re.IGNORECASE)
            if as_match:
                result.append({
                    'name': as_match.group(1),
                    'alias': as_match.group(2)
                })
            else:
                result.append({
                    'name': part,
                    'alias': None
                })
        return result
    
    def extract_alias_references(self, sql):
        alias_names = self.db.get_all_alias_names()
        referenced = []
        
        for alias_name in alias_names:
            pattern = re.compile(r'\b(FROM|JOIN|INNER JOIN|LEFT JOIN|RIGHT JOIN|OUTER JOIN)\s+' + re.escape(alias_name) + r'\b', re.IGNORECASE)
            if pattern.search(sql):
                referenced.append(alias_name)
        
        return referenced