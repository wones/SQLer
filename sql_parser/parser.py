import sqlparse
from sqlparse.sql import IdentifierList, Identifier
from sqlparse.tokens import Keyword, DML

class SQLParser:
    def parse(self, sql):
        return sqlparse.parse(sql)
    
    def extract_tables(self, sql):
        tables = []
        parsed = sqlparse.parse(sql)
        for stmt in parsed:
            self._extract_tables_from_stmt(stmt, tables)
        return tables
    
    def _extract_tables_from_stmt(self, stmt, tables):
        for token in stmt.tokens:
            if isinstance(token, IdentifierList):
                for identifier in token.get_identifiers():
                    self._process_identifier(identifier, tables)
            elif isinstance(token, Identifier):
                self._process_identifier(token, tables)
            elif hasattr(token, 'tokens'):
                self._extract_tables_from_stmt(token, tables)
    
    def _process_identifier(self, identifier, tables):
        table_name = identifier.get_real_name() or identifier.get_name()
        alias = identifier.get_alias()
        if table_name and table_name not in tables:
            tables.append(table_name)
    
    def extract_columns(self, sql):
        columns = []
        parsed = sqlparse.parse(sql)
        for stmt in parsed:
            self._extract_columns_from_stmt(stmt, columns)
        return columns
    
    def _extract_columns_from_stmt(self, stmt, columns):
        for token in stmt.tokens:
            if token.ttype in (Keyword, DML) and str(token).upper() == 'SELECT':
                idx = stmt.tokens.index(token)
                for next_token in stmt.tokens[idx+1:]:
                    if isinstance(next_token, IdentifierList):
                        for identifier in next_token.get_identifiers():
                            col = identifier.get_real_name() or identifier.get_name()
                            if col and col != '*' and col not in columns:
                                columns.append(col)
                    elif isinstance(next_token, Identifier):
                        col = next_token.get_real_name() or next_token.get_name()
                        if col and col != '*' and col not in columns:
                            columns.append(col)
                    elif next_token.ttype == Keyword and str(next_token).upper() in ('FROM', 'WHERE', 'GROUP', 'ORDER'):
                        break
            elif hasattr(token, 'tokens'):
                self._extract_columns_from_stmt(token, columns)
    
    def get_statement_type(self, sql):
        parsed = sqlparse.parse(sql)
        if parsed:
            for token in parsed[0].tokens:
                if token.ttype == DML:
                    return str(token).upper()
        return None
    
    def format_sql(self, sql):
        return sqlparse.format(sql, reindent=True, keyword_case='upper')