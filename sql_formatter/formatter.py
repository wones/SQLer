import sqlparse
from sqlparse.sql import IdentifierList, Identifier, Parenthesis
from sqlparse.tokens import Keyword, DML, Punctuation

class SQLFormatter:
    def format(self, sql, indent=4, keyword_case='upper'):
        formatted = sqlparse.format(
            sql,
            reindent=True,
            keyword_case=keyword_case,
            indent_width=indent,
            strip_comments=True
        )
        return formatted
    
    def format_with_style(self, sql, style='standard'):
        if style == 'compact':
            return self._format_compact(sql)
        elif style == 'expanded':
            return self._format_expanded(sql)
        else:
            return self.format(sql)
    
    def _format_compact(self, sql):
        formatted = sqlparse.format(sql, reindent=False, keyword_case='upper', strip_comments=True)
        formatted = ' '.join(formatted.split())
        return formatted
    
    def _format_expanded(self, sql):
        parsed = sqlparse.parse(sql)
        if not parsed:
            return sql
        
        return self._format_statement(parsed[0], 0)
    
    def _format_statement(self, stmt, indent_level):
        result = []
        indent = '    ' * indent_level
        prev_token_was_keyword = False
        
        for token in stmt.tokens:
            token_str = str(token).strip()
            if not token_str:
                continue
            
            if token.ttype in (Keyword, DML):
                if prev_token_was_keyword:
                    result.append('\n' + indent + token_str.upper())
                else:
                    result.append('\n' + indent + token_str.upper())
                prev_token_was_keyword = True
                
                if token_str.upper() in ('SELECT', 'FROM', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY'):
                    indent_level += 1
                    indent = '    ' * indent_level
            
            elif isinstance(token, IdentifierList):
                result.append('\n' + indent)
                identifiers = list(token.get_identifiers())
                for i, identifier in enumerate(identifiers):
                    if i > 0:
                        result.append(',\n' + indent)
                    result.append(str(identifier))
                prev_token_was_keyword = False
            
            elif isinstance(token, Identifier):
                result.append(token_str)
                prev_token_was_keyword = False
            
            elif isinstance(token, Parenthesis):
                result.append(' (')
                result.append(self._format_statement(token, indent_level))
                result.append(')')
                prev_token_was_keyword = False
            
            elif token_str == ',':
                result.append(',\n' + indent)
                prev_token_was_keyword = False
            
            else:
                result.append(token_str)
                prev_token_was_keyword = False
        
        return ''.join(result).strip()