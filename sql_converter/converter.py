import re
from .dialects import DIALECT_MAP, SUPPORTED_DIALECTS

class SQLConverter:
    def convert(self, sql, from_dialect, to_dialect):
        if from_dialect == to_dialect:
            return sql
        
        if from_dialect not in SUPPORTED_DIALECTS or to_dialect not in SUPPORTED_DIALECTS:
            raise ValueError(f"Unsupported dialect. Supported: {SUPPORTED_DIALECTS}")
        
        key = (from_dialect, to_dialect)
        if key not in DIALECT_MAP:
            raise ValueError(f"No conversion mapping from {from_dialect} to {to_dialect}")
        
        rules = DIALECT_MAP[key]
        converted_sql = sql
        
        for pattern, replacement in rules.items():
            if '%d' in pattern:
                converted_sql = self._convert_limit(converted_sql, from_dialect, to_dialect)
            elif 'EXTRACT' in pattern:
                converted_sql = self._convert_extract(converted_sql, pattern, replacement)
            else:
                converted_sql = re.sub(r'\b' + pattern + r'\b', replacement, converted_sql, flags=re.IGNORECASE)
        
        return converted_sql
    
    def _convert_limit(self, sql, from_dialect, to_dialect):
        if from_dialect == 'mysql' and to_dialect in ('trino',):
            match = re.search(r'LIMIT\s+(\d+)\s*,\s*(\d+)', sql, re.IGNORECASE)
            if match:
                offset = match.group(1)
                rows = match.group(2)
                sql = re.sub(r'LIMIT\s+\d+\s*,\s*\d+', f'OFFSET {offset} LIMIT {rows}', sql, flags=re.IGNORECASE)
        
        elif from_dialect == 'trino' and to_dialect in ('mysql', 'doris'):
            match = re.search(r'OFFSET\s+(\d+)\s+LIMIT\s+(\d+)', sql, re.IGNORECASE)
            if match:
                offset = match.group(1)
                rows = match.group(2)
                sql = re.sub(r'OFFSET\s+\d+\s+LIMIT\s+\d+', f'LIMIT {offset}, {rows}', sql, flags=re.IGNORECASE)
        
        return sql
    
    def _convert_extract(self, sql, pattern, replacement):
        matches = re.findall(pattern, sql, re.IGNORECASE)
        for match in matches:
            old_expr = f"EXTRACT({match.group(0).upper()} FROM {match.group(1)})"
            new_expr = replacement.replace('\\1', match.group(1))
            sql = sql.replace(old_expr, new_expr)
        return sql
    
    def get_supported_dialects(self):
        return SUPPORTED_DIALECTS