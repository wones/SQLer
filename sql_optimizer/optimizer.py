import re
import sqlparse
from sqlparse.sql import IdentifierList, Identifier
from .rules import OPTIMIZATION_RULES

class SQLOptimizer:
    def optimize(self, sql):
        optimized_sql = sql
        original_sql = sql
        
        for rule in sorted(OPTIMIZATION_RULES, key=lambda x: x['priority']):
            if 'pattern' in rule:
                optimized_sql = self._apply_pattern_rule(optimized_sql, rule)
            else:
                optimized_sql = self._apply_custom_rule(optimized_sql, rule)
        
        optimized_sql = self._remove_duplicate_columns(optimized_sql)
        optimized_sql = self._inline_simple_subqueries(optimized_sql)
        optimized_sql = self._remove_redundant_subqueries(optimized_sql)
        optimized_sql = self._convert_subquery_to_join(optimized_sql)
        optimized_sql = self._simplify_subqueries(optimized_sql)
        optimized_sql = self._remove_redundant_derived_tables(optimized_sql)
        
        optimized_sql = self._remove_trailing_whitespace(optimized_sql)
        optimized_sql = self._normalize_spacing(optimized_sql)
        
        return optimized_sql
    
    def _remove_trailing_whitespace(self, sql):
        lines = sql.split('\n')
        cleaned_lines = [line.rstrip() for line in lines]
        while cleaned_lines and not cleaned_lines[-1]:
            cleaned_lines.pop()
        return '\n'.join(cleaned_lines)
    
    def _normalize_spacing(self, sql):
        sql = re.sub(r'\s+', ' ', sql)
        sql = re.sub(r'\s*,\s*', ', ', sql)
        sql = re.sub(r'\s*\(\s*', ' (', sql)
        sql = re.sub(r'\s*\)\s*', ') ', sql)
        sql = re.sub(r'\s*=\s*', ' = ', sql)
        sql = re.sub(r'\s*!=\s*', ' != ', sql)
        sql = re.sub(r'\s*<>\s*', ' <> ', sql)
        sql = re.sub(r'\s*>\s*', ' > ', sql)
        sql = re.sub(r'\s*<\s*', ' < ', sql)
        sql = re.sub(r'\s*>=\s*', ' >= ', sql)
        sql = re.sub(r'\s*<=\s*', ' <= ', sql)
        sql = re.sub(r'\s+AND\s+', ' AND ', sql)
        sql = re.sub(r'\s+OR\s+', ' OR ', sql)
        
        return sql.strip()
    
    def _apply_pattern_rule(self, sql, rule):
        replacement = rule['replacement']
        if callable(replacement):
            pattern = re.compile(rule['pattern'], re.IGNORECASE | re.MULTILINE | re.DOTALL)
            result = pattern.sub(replacement, sql)
        else:
            pattern = re.compile(rule['pattern'], re.IGNORECASE | re.MULTILINE | re.DOTALL)
            result = pattern.sub(replacement, sql)
        return result
    
    def _apply_custom_rule(self, sql, rule):
        if rule['name'] == 'remove_duplicate_columns':
            return self._remove_duplicate_columns(sql)
        return sql
    
    def _remove_duplicate_columns(self, sql):
        parsed = sqlparse.parse(sql)
        if not parsed:
            return sql
        
        stmt = parsed[0]
        column_set = set()
        result = str(stmt)
        
        select_pattern = r'SELECT\s+([^FROM]+?)\s+FROM'
        match = re.search(select_pattern, result, re.IGNORECASE | re.DOTALL)
        if match:
            columns_str = match.group(1)
            columns = [c.strip() for c in columns_str.split(',')]
            unique_columns = []
            for col in columns:
                col_clean = col.strip()
                if col_clean and col_clean not in column_set:
                    column_set.add(col_clean)
                    unique_columns.append(col_clean)
            
            if len(unique_columns) < len(columns):
                result = re.sub(select_pattern, 'SELECT ' + ', '.join(unique_columns) + ' FROM', result, flags=re.IGNORECASE | re.DOTALL)
        
        return result
    
    def _inline_simple_subqueries(self, sql):
        pattern = r'SELECT\s+(\*|[^FROM]+?)\s+FROM\s+\(\s*SELECT\s+([^FROM]+?)\s+FROM\s+([^\s]+?)\s*\)\s+AS\s+(\w+)'
        
        def inline_match(match):
            outer_select = match.group(1)
            inner_columns = match.group(2)
            inner_table = match.group(3)
            alias = match.group(4)
            
            if outer_select == '*':
                return f'SELECT {alias}.{inner_columns.strip().replace(", ", f", {alias}.")} FROM {inner_table} {alias}'
            else:
                return f'SELECT {outer_select} FROM {inner_table} {alias}'
        
        result = re.sub(pattern, inline_match, sql, flags=re.IGNORECASE | re.DOTALL)
        return result
    
    def _remove_redundant_subqueries(self, sql):
        max_iterations = 10
        for _ in range(max_iterations):
            original = sql
            
            pattern = r'SELECT\s+\*\s+FROM\s+\(\s*SELECT\s+([^FROM]+?)\s+FROM\s+([^\s]+?)(?:\s+(\w+))?\s*\)\s+AS\s+(\w+)'
            
            def remove_redundant(match):
                inner_columns = match.group(1).strip()
                inner_table = match.group(2)
                inner_alias = match.group(3)
                outer_alias = match.group(4)
                
                if inner_alias:
                    cols_list = [c.strip() for c in inner_columns.split(',')]
                    qualified_cols = []
                    for col in cols_list:
                        if col.startswith(inner_alias + '.'):
                            qualified_cols.append(col)
                        elif col == '*':
                            qualified_cols.append(f'{inner_alias}.*')
                        else:
                            qualified_cols.append(f'{inner_alias}.{col}')
                    return f'SELECT {", ".join(qualified_cols)} FROM {inner_table} {inner_alias}'
                else:
                    return f'SELECT {inner_columns} FROM {inner_table}'
            
            sql = re.sub(pattern, remove_redundant, sql, flags=re.IGNORECASE | re.DOTALL)
            
            if sql == original:
                break
        
        return sql
    
    def _convert_subquery_to_join(self, sql):
        pattern = r'SELECT\s+([^FROM]+?)\s+FROM\s+(\w+)\s+(\w+)\s+WHERE\s+(\w+)\s*=\s*(\w+)\s+AND\s+(\w+)\s+IN\s*\(\s*SELECT\s+(\w+)\s+FROM\s+(\w+)\s*\)'
        
        def convert_match(match):
            select_cols = match.group(1)
            table1 = match.group(2)
            alias1 = match.group(3)
            col1 = match.group(4)
            val1 = match.group(5)
            col2 = match.group(6)
            sub_col = match.group(7)
            sub_table = match.group(8)
            
            return f'SELECT {select_cols} FROM {table1} {alias1} INNER JOIN {sub_table} ON {alias1}.{col2} = {sub_table}.{sub_col} WHERE {alias1}.{col1} = {val1}'
        
        result = re.sub(pattern, convert_match, sql, flags=re.IGNORECASE | re.DOTALL)
        
        simple_pattern = r'SELECT\s+(\*|[^FROM]+?)\s+FROM\s+(\w+)\s+(\w+)\s+WHERE\s+(\w+)\s+IN\s*\(\s*SELECT\s+(\w+)\s+FROM\s+(\w+)\s*\)'
        
        def simple_convert(match):
            select_cols = match.group(1)
            table1 = match.group(2)
            alias1 = match.group(3)
            col1 = match.group(4)
            sub_col = match.group(5)
            sub_table = match.group(6)
            
            if select_cols == '*':
                return f'SELECT {alias1}.* FROM {table1} {alias1} INNER JOIN {sub_table} ON {alias1}.{col1} = {sub_table}.{sub_col}'
            else:
                return f'SELECT {select_cols} FROM {table1} {alias1} INNER JOIN {sub_table} ON {alias1}.{col1} = {sub_table}.{sub_col}'
        
        result = re.sub(simple_pattern, simple_convert, result, flags=re.IGNORECASE | re.DOTALL)
        
        derived_pattern = r'SELECT\s+\*\s+FROM\s+\(\s*SELECT\s+([^FROM]+?)\s+FROM\s+(\w+)\s*\)\s+AS\s+(\w+)\s+WHERE\s+(\w+)\s+IN\s*\(\s*SELECT\s+(\w+)\s+FROM\s+(\w+)\s*\)'
        
        def derived_convert(match):
            inner_cols = match.group(1)
            inner_table = match.group(2)
            alias = match.group(3)
            join_col = match.group(4)
            sub_col = match.group(5)
            sub_table = match.group(6)
            
            return f'SELECT {alias}.{inner_cols.strip().replace(", ", f", {alias}.")} FROM {inner_table} {alias} INNER JOIN {sub_table} ON {alias}.{join_col} = {sub_table}.{sub_col}'
        
        result = re.sub(derived_pattern, derived_convert, result, flags=re.IGNORECASE | re.DOTALL)
        
        derived_pattern2 = r'SELECT\s+\*\s+FROM\s+\(\s*SELECT\s+([^FROM]+?)\s+FROM\s+(\w+)\s*\)\s+AS\s+(\w+)\s+WHERE\s+(\w+)\.(\w+)\s+IN\s*\(\s*SELECT\s+(\w+)\s+FROM\s+(\w+)\s*\)'
        
        def derived_convert2(match):
            inner_cols = match.group(1)
            inner_table = match.group(2)
            alias = match.group(3)
            alias_ref = match.group(4)
            join_col = match.group(5)
            sub_col = match.group(6)
            sub_table = match.group(7)
            
            cols_with_prefix = inner_cols.strip().replace(", ", f", {alias}.")
            return f'SELECT {alias}.{cols_with_prefix} FROM {inner_table} {alias} INNER JOIN {sub_table} ON {alias}.{join_col} = {sub_table}.{sub_col}'
        
        result = re.sub(derived_pattern2, derived_convert2, result, flags=re.IGNORECASE | re.DOTALL)
        
        outer_pattern = r'SELECT\s+\*\s+FROM\s+\(\s*SELECT\s+([^)]+?)\s+FROM\s+(\w+)\s*\)\s+AS\s+(\w+)\s+WHERE\s+(\w+)\.(\w+)\s+IN\s*\(\s*SELECT\s+(\w+)\s+FROM\s+(\w+)\s*\)'
        
        def outer_convert(match):
            inner_cols = match.group(1).strip()
            inner_table = match.group(2)
            alias = match.group(3)
            alias_ref = match.group(4)
            join_col = match.group(5)
            sub_col = match.group(6)
            sub_table = match.group(7)
            
            cols_list = [c.strip() for c in inner_cols.split(',')]
            cols_with_prefix = ', '.join([f'{alias}.{c}' for c in cols_list])
            
            return f'SELECT {cols_with_prefix} FROM {inner_table} {alias} INNER JOIN {sub_table} ON {alias}.{join_col} = {sub_table}.{sub_col}'
        
        result = re.sub(outer_pattern, outer_convert, result, flags=re.IGNORECASE | re.DOTALL)
        
        return result
    
    def _remove_redundant_derived_tables(self, sql):
        try:
            parsed = sqlparse.parse(sql)
            if not parsed:
                return sql
            
            sql_lower = sql.lower()
            if 'from (select' not in sql_lower:
                return sql
            
            max_iterations = 10
            for iteration in range(max_iterations):
                original = sql
                changed = False
                
                pattern = r'SELECT\s+(\w+\.\*)\s+FROM\s+\(\s*SELECT\s+\*\s+FROM\s+(\w+)\s*\)\s+AS\s+(\w+)'
                
                def remove_match1(match):
                    select_cols = match.group(1)
                    table = match.group(2)
                    alias = match.group(3)
                    return f'SELECT {select_cols} FROM {table} {alias}'
                
                new_sql = re.sub(pattern, remove_match1, sql, flags=re.IGNORECASE | re.DOTALL)
                if new_sql != sql:
                    sql = new_sql
                    changed = True
                    continue
                
                pattern2 = r'SELECT\s+\*\s+FROM\s+\(\s*SELECT\s+([\w\s,\.*\'\"]+?)\s+FROM\s+([\w\.]+)\s+(\w+)\s+WHERE\s+(.*?)\)\s+AS\s+(\w+)'
                
                def remove_match2(match):
                    inner_cols = match.group(1).strip()
                    table = match.group(2)
                    inner_alias = match.group(3)
                    where_clause = match.group(4).strip()
                    outer_alias = match.group(5)
                    
                    cols_list = [c.strip() for c in inner_cols.split(',')]
                    cols_with_prefix = ', '.join([f'{inner_alias}.{c}' if not c.startswith(inner_alias + '.') else c for c in cols_list])
                    return f'SELECT {cols_with_prefix} FROM {table} {inner_alias} WHERE {where_clause}'
                
                new_sql = re.sub(pattern2, remove_match2, sql, flags=re.IGNORECASE | re.DOTALL)
                if new_sql != sql:
                    sql = new_sql
                    changed = True
                    continue
                
                pattern3 = r'SELECT\s+\*\s+FROM\s+\(\s*SELECT\s+([\w\s,\.*\'\"]+?)\s+FROM\s+([\w\.]+)\s+(\w+)\s+WHERE\s+(.*?)\)\s+AS\s+(\w+)\s*$'
                
                def remove_match3(match):
                    inner_cols = match.group(1).strip()
                    table = match.group(2)
                    inner_alias = match.group(3)
                    where_clause = match.group(4).strip()
                    outer_alias = match.group(5)
                    
                    cols_list = [c.strip() for c in inner_cols.split(',')]
                    cols_with_prefix = ', '.join([f'{inner_alias}.{c}' if not c.startswith(inner_alias + '.') else c for c in cols_list])
                    return f'SELECT {cols_with_prefix} FROM {table} {inner_alias} WHERE {where_clause}'
                
                new_sql = re.sub(pattern3, remove_match3, sql, flags=re.IGNORECASE | re.DOTALL)
                if new_sql != sql:
                    sql = new_sql
                    changed = True
                    continue
                
                if not changed:
                    break
            
            return sql
        except Exception:
            return sql
    
    def _simplify_subqueries(self, sql):
        simplified = sql
        
        simplified = re.sub(
            r'IN\s*\(\s*SELECT\s+DISTINCT\s+([^\s]+)\s+FROM\s+([^\s]+)\s*\)',
            r'IN (SELECT \1 FROM \2)',
            simplified,
            flags=re.IGNORECASE
        )
        
        simplified = re.sub(
            r'WHERE\s+([^\s]+)\s+IN\s*\(\s*SELECT\s+([^\s]+)\s+FROM\s+([^\s]+)\s+WHERE\s+([^\s]+)\s*=\s*([^\s]+)\s*\)',
            r'WHERE EXISTS (SELECT 1 FROM \3 WHERE \4 = \5 AND \1 = \2)',
            simplified,
            flags=re.IGNORECASE
        )
        
        simplified = re.sub(
            r'NOT\s+IN\s*\(\s*SELECT\s+1\s+FROM\s+([^\s]+)\s+WHERE\s+([^\s]+)\s*=\s*0\s*\)',
            r'NOT EXISTS (SELECT 1 FROM \1 WHERE \2 = 0)',
            simplified,
            flags=re.IGNORECASE
        )
        
        simplified = re.sub(
            r'IN\s*\(\s*SELECT\s+1\s+FROM\s+([^\s]+)\s+WHERE\s+([^\s]+)\s*=\s*1\s*\)',
            r'EXISTS (SELECT 1 FROM \1 WHERE \2 = 1)',
            simplified,
            flags=re.IGNORECASE
        )
        
        return simplified
    
    def analyze(self, sql):
        analysis = {
            'tables': [],
            'columns': [],
            'joins': [],
            'subqueries': [],
            'warnings': [],
            'suggestions': []
        }
        
        try:
            parsed = sqlparse.parse(sql)
            if not parsed:
                return analysis
            
            stmt = parsed[0]
            self._analyze_statement(stmt, analysis)
        except Exception as e:
            analysis['warnings'].append(f'解析警告: {str(e)}')
        
        if len(analysis['subqueries']) > 3:
            analysis['warnings'].append('检测到多个子查询，可能影响性能')
            analysis['suggestions'].append('考虑将子查询转换为JOIN操作')
        
        if len(analysis['joins']) > 5:
            analysis['warnings'].append('JOIN表数量较多，建议检查索引')
        
        if '*' in analysis['columns']:
            analysis['suggestions'].append('避免使用SELECT *，明确指定需要的列')
        
        return analysis
    
    def _get_token_name(self, token):
        try:
            if hasattr(token, 'get_real_name'):
                name = token.get_real_name()
                if name:
                    return name
        except:
            pass
        try:
            if hasattr(token, 'get_name'):
                return token.get_name()
        except:
            pass
        return str(token).strip()

    def _analyze_statement(self, stmt, analysis):
        for token in stmt.tokens:
            if isinstance(token, IdentifierList):
                try:
                    for identifier in token.get_identifiers():
                        col = self._get_token_name(identifier)
                        if col and col not in analysis['columns'] and col != ',':
                            analysis['columns'].append(col)
                except Exception as e:
                    analysis['warnings'].append(f'解析列信息时出错: {str(e)}')
            
            elif isinstance(token, Identifier):
                try:
                    table = self._get_token_name(token)
                    if table and table not in analysis['tables']:
                        analysis['tables'].append(table)
                except Exception as e:
                    analysis['warnings'].append(f'解析表信息时出错: {str(e)}')
            
            elif str(token).upper() in ('JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'OUTER JOIN'):
                analysis['joins'].append(str(token).upper())
            
            elif hasattr(token, 'tokens'):
                if str(token).strip().startswith('('):
                    analysis['subqueries'].append(str(token)[:100] + '...' if len(str(token)) > 100 else str(token))
                try:
                    self._analyze_statement(token, analysis)
                except Exception:
                    pass