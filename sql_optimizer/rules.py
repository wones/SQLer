OPTIMIZATION_RULES = [
    {
        'name': 'remove_comments',
        'description': '移除SQL注释',
        'pattern': r'--.*$|/\*.*?\*/',
        'replacement': '',
        'priority': 1
    },
    {
        'name': 'simplify_where_true',
        'description': '移除WHERE 1=1条件',
        'pattern': r'WHERE\s+1\s*=\s*1\s*(AND\s+)?',
        'replacement': r'WHERE ',
        'priority': 3
    },
    {
        'name': 'simplify_where_false',
        'description': '替换WHERE 1=0为WHERE FALSE',
        'pattern': r'WHERE\s+1\s*=\s*0',
        'replacement': r'WHERE 1=0',
        'priority': 3
    },
    {
        'name': 'remove_duplicate_columns',
        'description': '移除SELECT中的重复列',
        'priority': 4
    },
    {
        'name': 'simplify_limit_zero',
        'description': '简化LIMIT 0',
        'pattern': r'LIMIT\s+0',
        'replacement': r'LIMIT 0',
        'priority': 5
    },
    {
        'name': 'uppercase_keywords',
        'description': '统一大写关键字',
        'pattern': r'\b(SELECT|FROM|WHERE|AND|OR|JOIN|ON|ORDER BY|GROUP BY|HAVING|LIMIT)\b',
        'replacement': lambda m: m.group(1).upper(),
        'priority': 6
    },
    {
        'name': 'remove_extra_spaces',
        'description': '移除多余空格',
        'pattern': r'\s+',
        'replacement': ' ',
        'priority': 7
    }
]

SQL_KEYWORDS = [
    'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'EXISTS',
    'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'CROSS', 'NATURAL', 'ON', 'AS', 'USING',
    'GROUP', 'BY', 'HAVING', 'ORDER', 'ASC', 'DESC',
    'LIMIT', 'OFFSET', 'UNION', 'ALL', 'DISTINCT', 'INTERSECT', 'EXCEPT',
    'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'MERGE',
    'CREATE', 'TABLE', 'DROP', 'ALTER', 'INDEX', 'VIEW', 'DATABASE', 'SCHEMA',
    'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
    'IF', 'ELSEIF', 'ELSE', 'END IF',
    'FUNCTION', 'PROCEDURE', 'TRIGGER', 'EVENT', 'CURSOR',
    'COMMIT', 'ROLLBACK', 'BEGIN', 'START', 'TRANSACTION', 'SAVEPOINT',
    'NULL', 'TRUE', 'FALSE', 'DEFAULT', 'PRIMARY', 'FOREIGN', 'KEY', 'REFERENCES',
    'CHECK', 'UNIQUE', 'INDEX', 'AUTO_INCREMENT', 'PRIMARY KEY', 'FOREIGN KEY'
]

AGGREGATE_FUNCTIONS = [
    'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
    'COUNT_DISTINCT', 'SUM_DISTINCT', 'AVG_DISTINCT'
]

DATE_FUNCTIONS = [
    'NOW', 'CURDATE', 'CURTIME', 'DATE', 'TIME',
    'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND',
    'DATE_ADD', 'DATE_SUB', 'DATEDIFF', 'TIMESTAMPDIFF',
    'STR_TO_DATE', 'DATE_FORMAT', 'ADDDATE', 'SUBDATE',
    'WEEK', 'WEEKDAY', 'DAYOFWEEK', 'DAYOFMONTH', 'DAYOFYEAR',
    'QUARTER', 'MONTHNAME', 'DAYNAME', 'WEEKOFYEAR',
    'TO_DATE', 'TO_TIMESTAMP', 'EXTRACT', 'INTERVAL'
]

STRING_FUNCTIONS = [
    'CONCAT', 'SUBSTRING', 'SUBSTR', 'LENGTH', 'CHAR_LENGTH',
    'UPPER', 'LOWER', 'TRIM', 'LTRIM', 'RTRIM',
    'REPLACE', 'LOCATE', 'INSTR', 'LEFT', 'RIGHT',
    'SPLIT_PART', 'REGEXP_REPLACE', 'REGEXP_EXTRACT',
    'REVERSE', 'LPAD', 'RPAD', 'SPACE', 'CONCAT_WS',
    'ASCII', 'CHAR', 'ORD', 'HEX', 'UNHEX',
    'SOUNDEX', 'SUBSTRING_INDEX'
]

NUMERIC_FUNCTIONS = [
    'ABS', 'CEIL', 'FLOOR', 'ROUND', 'TRUNCATE',
    'MOD', 'POWER', 'SQRT', 'LOG', 'EXP',
    'SIN', 'COS', 'TAN', 'ASIN', 'ACOS', 'ATAN'
]

CONDITIONAL_FUNCTIONS = [
    'IF', 'IFNULL', 'NULLIF', 'COALESCE', 'CASE'
]