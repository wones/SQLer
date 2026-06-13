import sqlite3
import os
import json
from datetime import datetime
from config import Config

class Database:
    def __init__(self, db_path=None):
        # 如果传入了db_path则使用，否则使用Config中的默认路径
        self.db_path = db_path or Config.DATABASE_PATH
        self._init_database()
    
    def _init_database(self):
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS sql_alias (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                alias_name VARCHAR(100) NOT NULL UNIQUE,
                sql_content TEXT NOT NULL,
                description VARCHAR(500),
                dialect VARCHAR(20) NOT NULL DEFAULT 'mysql',
                group_id INTEGER DEFAULT NULL,
                columns TEXT DEFAULT '[]',
                table_dependencies TEXT DEFAULT '[]',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (group_id) REFERENCES alias_group(id) ON DELETE CASCADE
            )
        ''')
        
        cursor.execute('PRAGMA table_info(sql_alias)')
        alias_columns = [col[1] for col in cursor.fetchall()]
        if 'columns' not in alias_columns:
            cursor.execute('ALTER TABLE sql_alias ADD COLUMN columns TEXT DEFAULT \'[]\'')
        if 'table_dependencies' not in alias_columns:
            cursor.execute('ALTER TABLE sql_alias ADD COLUMN table_dependencies TEXT DEFAULT \'[]\'')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS alias_group (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_name VARCHAR(100) NOT NULL UNIQUE,
                description VARCHAR(500),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS table_group (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_name VARCHAR(100) NOT NULL UNIQUE,
                description VARCHAR(500),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS base_table (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                table_name VARCHAR(100) NOT NULL,
                schema_name VARCHAR(100),
                columns TEXT NOT NULL DEFAULT '[]',
                description VARCHAR(500),
                dialect VARCHAR(20) NOT NULL DEFAULT 'mysql',
                primary_key VARCHAR(200),
                partition_info VARCHAR(500),
                group_id INTEGER DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (group_id) REFERENCES table_group(id) ON DELETE CASCADE
            )
        ''')
        
        cursor.execute('PRAGMA table_info(base_table)')
        columns = [col[1] for col in cursor.fetchall()]
        if 'primary_key' not in columns:
            cursor.execute('ALTER TABLE base_table ADD COLUMN primary_key VARCHAR(200)')
        if 'partition_info' not in columns:
            cursor.execute('ALTER TABLE base_table ADD COLUMN partition_info VARCHAR(500)')
        if 'group_id' not in columns:
            cursor.execute('ALTER TABLE base_table ADD COLUMN group_id INTEGER')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS llm_config (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                config_name VARCHAR(100) NOT NULL,
                api_key TEXT NOT NULL,
                model_name VARCHAR(100) DEFAULT 'gpt-4',
                api_base_url VARCHAR(500) DEFAULT 'https://api.openai.com/v1',
                max_tokens INTEGER DEFAULT 4096,
                is_default INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()
    
    def _connect(self):
        return sqlite3.connect(self.db_path)
    
    def _extract_columns_from_sql(self, sql):
        """从SQL语句中提取列名"""
        columns = []
        
        select_pattern = r'SELECT\s+(.+?)\s+FROM'
        match = re.search(select_pattern, sql, re.IGNORECASE | re.DOTALL)
        if match:
            select_content = match.group(1)
            column_strings = [s.strip() for s in select_content.split(',')]
            
            for col in column_strings:
                col = col.strip()
                if not col:
                    continue
                
                name_match = re.search(r'([a-zA-Z_][a-zA-Z0-9_]*)', col)
                if name_match:
                    col_name = name_match.group(1)
                    as_match = re.search(r'\s+AS\s+([a-zA-Z_][a-zA-Z0-9_]*)', col, re.IGNORECASE)
                    if as_match:
                        col_name = as_match.group(1)
                    columns.append({'name': col_name, 'type': 'STRING', 'comment': ''})
        
        return columns

    def _extract_table_dependencies(self, sql):
        """从SQL语句中提取表依赖"""
        tables = set()
        
        from_pattern = r'FROM\s+([a-zA-Z_][a-zA-Z0-9_.]*)\b'
        matches = re.findall(from_pattern, sql, re.IGNORECASE)
        for match in matches:
            table = match.split('.')[-1].strip()
            if table and table.isidentifier():
                tables.add(table)
        
        join_pattern = r'JOIN\s+([a-zA-Z_][a-zA-Z0-9_.]*)\b'
        matches = re.findall(join_pattern, sql, re.IGNORECASE)
        for match in matches:
            table = match.split('.')[-1].strip()
            if table and table.isidentifier():
                tables.add(table)
        
        return list(tables)

    def add_alias(self, alias_name, sql_content, description=None, dialect='mysql', columns=None, table_dependencies=None):
        conn = self._connect()
        cursor = conn.cursor()
        try:
            if columns is None:
                columns = self._extract_columns_from_sql(sql_content)
            if table_dependencies is None:
                table_dependencies = self._extract_table_dependencies(sql_content)
            
            columns_json = json.dumps(columns) if isinstance(columns, list) else '[]'
            table_deps_json = json.dumps(table_dependencies) if isinstance(table_dependencies, list) else '[]'
            
            cursor.execute('''
                INSERT INTO sql_alias (alias_name, sql_content, description, dialect, columns, table_dependencies, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (alias_name, sql_content, description, dialect, columns_json, table_deps_json, datetime.now(), datetime.now()))
            conn.commit()
            return {'status': 'success', 'id': cursor.lastrowid}
        except sqlite3.IntegrityError:
            return {'status': 'error', 'message': '别名已存在'}
        finally:
            conn.close()
    
    def get_all_aliases(self):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('SELECT id, alias_name, description, dialect, columns, table_dependencies, created_at FROM sql_alias ORDER BY created_at DESC')
        result = cursor.fetchall()
        conn.close()
        return [{
            'id': row[0], 
            'alias_name': row[1], 
            'description': row[2], 
            'dialect': row[3],
            'columns': row[4],
            'table_dependencies': row[5],
            'created_at': row[6]
        } for row in result]
    
    def get_alias_by_name(self, alias_name):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM sql_alias WHERE alias_name = ?', (alias_name,))
        result = cursor.fetchone()
        conn.close()
        if result:
            return {
                'id': result[0],
                'alias_name': result[1],
                'sql_content': result[2],
                'description': result[3],
                'dialect': result[4],
                'columns': result[5] if len(result) > 5 else '[]',
                'table_dependencies': result[6] if len(result) > 6 else '[]',
                'created_at': result[7] if len(result) > 7 else result[5],
                'updated_at': result[8] if len(result) > 8 else result[6]
            }
        return None
    
    def get_alias_by_id(self, alias_id):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM sql_alias WHERE id = ?', (alias_id,))
        result = cursor.fetchone()
        conn.close()
        if result:
            return {
                'id': result[0],
                'alias_name': result[1],
                'sql_content': result[2],
                'description': result[3],
                'dialect': result[4],
                'columns': result[5] if len(result) > 5 else '[]',
                'table_dependencies': result[6] if len(result) > 6 else '[]',
                'created_at': result[7] if len(result) > 7 else result[5],
                'updated_at': result[8] if len(result) > 8 else result[6]
            }
        return None
    
    def update_alias(self, alias_id, alias_name, sql_content, description=None, dialect='mysql', columns=None, table_dependencies=None):
        conn = self._connect()
        cursor = conn.cursor()
        try:
            if columns is None:
                columns = self._extract_columns_from_sql(sql_content)
            if table_dependencies is None:
                table_dependencies = self._extract_table_dependencies(sql_content)
            
            columns_json = json.dumps(columns) if isinstance(columns, list) else '[]'
            table_deps_json = json.dumps(table_dependencies) if isinstance(table_dependencies, list) else '[]'
            
            cursor.execute('''
                UPDATE sql_alias SET alias_name = ?, sql_content = ?, description = ?, dialect = ?, columns = ?, table_dependencies = ?, updated_at = ?
                WHERE id = ?
            ''', (alias_name, sql_content, description, dialect, columns_json, table_deps_json, datetime.now(), alias_id))
            conn.commit()
            return {'status': 'success', 'rows_affected': cursor.rowcount}
        except sqlite3.IntegrityError:
            return {'status': 'error', 'message': '别名已存在'}
        finally:
            conn.close()
    
    def delete_alias(self, alias_id):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM sql_alias WHERE id = ?', (alias_id,))
        conn.commit()
        rows_affected = cursor.rowcount
        conn.close()
        return {'status': 'success', 'rows_affected': rows_affected}
    
    def add_table(self, table_name, schema_name=None, columns='[]', description=None, dialect='mysql', primary_key=None, partition_info=None, group_id=None):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO base_table (table_name, schema_name, columns, description, dialect, primary_key, partition_info, group_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (table_name, schema_name, columns, description, dialect, primary_key, partition_info, group_id, datetime.now()))
        conn.commit()
        conn.close()
        return {'status': 'success', 'id': cursor.lastrowid}
    
    def get_all_tables(self):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('SELECT id, table_name, schema_name, columns, description, dialect, primary_key, partition_info, group_id, created_at FROM base_table ORDER BY created_at DESC')
        result = cursor.fetchall()
        conn.close()
        return [{
            'id': row[0], 
            'table_name': row[1], 
            'schema_name': row[2], 
            'columns': row[3],
            'description': row[4], 
            'dialect': row[5],
            'primary_key': row[6],
            'partition_info': row[7],
            'group_id': row[8],
            'created_at': row[9]
        } for row in result]
    
    def get_all_tables_with_group(self):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT bt.id, bt.table_name, bt.schema_name, bt.description, bt.dialect, bt.group_id, tg.group_name, bt.created_at
            FROM base_table bt
            LEFT JOIN table_group tg ON bt.group_id = tg.id
            ORDER BY bt.created_at DESC
        ''')
        result = cursor.fetchall()
        conn.close()
        return [{
            'id': row[0],
            'table_name': row[1],
            'schema_name': row[2],
            'description': row[3],
            'dialect': row[4],
            'group_id': row[5],
            'group_name': row[6],
            'created_at': row[7]
        } for row in result]
    
    def get_table_by_id(self, table_id):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('SELECT id, table_name, schema_name, columns, description, dialect, primary_key, partition_info, group_id, created_at FROM base_table WHERE id = ?', (table_id,))
        result = cursor.fetchone()
        conn.close()
        if result:
            return {
                'id': result[0],
                'table_name': result[1],
                'schema_name': result[2],
                'columns': result[3],
                'description': result[4],
                'dialect': result[5],
                'primary_key': result[6],
                'partition_info': result[7],
                'group_id': result[8],
                'created_at': result[9]
            }
        return None
    
    def get_tables_by_group(self, group_id):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('SELECT id, table_name, schema_name, description, dialect, created_at FROM base_table WHERE group_id = ? ORDER BY created_at DESC', (group_id,))
        result = cursor.fetchall()
        conn.close()
        return [{'id': row[0], 'table_name': row[1], 'schema_name': row[2], 'description': row[3], 'dialect': row[4], 'created_at': row[5]} for row in result]
    
    def get_table_columns(self, table_name):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('SELECT columns FROM base_table WHERE table_name = ?', (table_name,))
        result = cursor.fetchone()
        conn.close()
        if result and result[0]:
            try:
                return json.loads(result[0])
            except:
                return []
        return []
    
    def update_table(self, table_id, table_name, schema_name=None, columns='[]', description=None, dialect='mysql', primary_key=None, partition_info=None, group_id=None):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE base_table SET table_name = ?, schema_name = ?, columns = ?, description = ?, dialect = ?, primary_key = ?, partition_info = ?, group_id = ?
            WHERE id = ?
        ''', (table_name, schema_name, columns, description, dialect, primary_key, partition_info, group_id, table_id))
        conn.commit()
        conn.close()
        return {'status': 'success', 'rows_affected': cursor.rowcount}
    
    def delete_table(self, table_id):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM base_table WHERE id = ?', (table_id,))
        conn.commit()
        rows_affected = cursor.rowcount
        conn.close()
        return {'status': 'success', 'rows_affected': rows_affected}
    
    def add_table_group(self, group_name, description=None):
        conn = self._connect()
        cursor = conn.cursor()
        try:
            cursor.execute('''
                INSERT INTO table_group (group_name, description, created_at)
                VALUES (?, ?, ?)
            ''', (group_name, description, datetime.now()))
            conn.commit()
            return {'status': 'success', 'id': cursor.lastrowid}
        except sqlite3.IntegrityError:
            return {'status': 'error', 'message': '分组名已存在'}
        finally:
            conn.close()
    
    def get_all_table_groups(self):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT tg.id, tg.group_name, tg.description, tg.created_at, COUNT(bt.id) as table_count
            FROM table_group tg
            LEFT JOIN base_table bt ON tg.id = bt.group_id
            GROUP BY tg.id, tg.group_name, tg.description, tg.created_at
            ORDER BY tg.created_at DESC
        ''')
        result = cursor.fetchall()
        conn.close()
        return [{
            'id': row[0],
            'group_name': row[1],
            'description': row[2],
            'created_at': row[3],
            'table_count': row[4]
        } for row in result]
    
    def get_table_group_by_id(self, group_id):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM table_group WHERE id = ?', (group_id,))
        result = cursor.fetchone()
        conn.close()
        if result:
            return {
                'id': result[0],
                'group_name': result[1],
                'description': result[2],
                'created_at': result[3]
            }
        return None
    
    def update_table_group(self, group_id, group_name, description=None):
        conn = self._connect()
        cursor = conn.cursor()
        try:
            cursor.execute('''
                UPDATE table_group SET group_name = ?, description = ?
                WHERE id = ?
            ''', (group_name, description, group_id))
            conn.commit()
            return {'status': 'success', 'rows_affected': cursor.rowcount}
        except sqlite3.IntegrityError:
            return {'status': 'error', 'message': '分组名已存在'}
        finally:
            conn.close()
    
    def delete_table_group(self, group_id):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM table_group WHERE id = ?', (group_id,))
        conn.commit()
        rows_affected = cursor.rowcount
        conn.close()
        return {'status': 'success', 'rows_affected': rows_affected}
    
    def update_table_group_id(self, table_id, group_id):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('UPDATE base_table SET group_id = ? WHERE id = ?', (group_id, table_id))
        conn.commit()
        rows_affected = cursor.rowcount
        conn.close()
        return {'status': 'success', 'rows_affected': rows_affected}
    
    def get_llm_config(self, config_id=None):
        conn = self._connect()
        cursor = conn.cursor()
        if config_id:
            cursor.execute('SELECT * FROM llm_config WHERE id = ?', (config_id,))
        else:
            cursor.execute('SELECT * FROM llm_config WHERE is_default = 1 ORDER BY id DESC LIMIT 1')
        result = cursor.fetchone()
        conn.close()
        if result:
            return {
                'id': result[0],
                'config_name': result[1],
                'api_key': result[2],
                'model_name': result[3],
                'api_base_url': result[4],
                'max_tokens': result[5],
                'is_default': result[6],
                'created_at': result[7],
                'updated_at': result[8]
            }
        return None
    
    def get_all_llm_configs(self):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM llm_config ORDER BY is_default DESC, created_at DESC')
        results = cursor.fetchall()
        conn.close()
        return [{
            'id': row[0],
            'config_name': row[1],
            'api_key': row[2],
            'model_name': row[3],
            'api_base_url': row[4],
            'max_tokens': row[5],
            'is_default': row[6],
            'created_at': row[7],
            'updated_at': row[8]
        } for row in results]
    
    def save_llm_config(self, config_name, api_key, model_name='gpt-4', api_base_url='https://api.openai.com/v1', max_tokens=4096, is_default=False):
        conn = self._connect()
        cursor = conn.cursor()
        try:
            if is_default:
                cursor.execute('UPDATE llm_config SET is_default = 0')
            cursor.execute('''
                INSERT INTO llm_config (config_name, api_key, model_name, api_base_url, max_tokens, is_default, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (config_name, api_key, model_name, api_base_url, max_tokens, 1 if is_default else 0, datetime.now(), datetime.now()))
            conn.commit()
            return {'status': 'success', 'id': cursor.lastrowid}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}
        finally:
            conn.close()
    
    def update_llm_config(self, config_id, config_name, api_key, model_name='gpt-4', api_base_url='https://api.openai.com/v1', max_tokens=4096, is_default=False):
        conn = self._connect()
        cursor = conn.cursor()
        try:
            if is_default:
                cursor.execute('UPDATE llm_config SET is_default = 0')
            cursor.execute('''
                UPDATE llm_config SET config_name = ?, api_key = ?, model_name = ?, api_base_url = ?, max_tokens = ?, is_default = ?, updated_at = ?
                WHERE id = ?
            ''', (config_name, api_key, model_name, api_base_url, max_tokens, 1 if is_default else 0, datetime.now(), config_id))
            conn.commit()
            return {'status': 'success', 'rows_affected': cursor.rowcount}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}
        finally:
            conn.close()
    
    def delete_llm_config(self, config_id):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM llm_config WHERE id = ?', (config_id,))
        conn.commit()
        rows_affected = cursor.rowcount
        conn.close()
        return {'status': 'success', 'rows_affected': rows_affected}
    
    def set_default_llm_config(self, config_id):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('UPDATE llm_config SET is_default = 0')
        cursor.execute('UPDATE llm_config SET is_default = 1 WHERE id = ?', (config_id,))
        conn.commit()
        conn.close()
        return {'status': 'success'}
    
    def get_all_alias_names(self):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('SELECT alias_name FROM sql_alias')
        result = cursor.fetchall()
        conn.close()
        return [row[0] for row in result]
    
    def add_group(self, group_name, description=None):
        conn = self._connect()
        cursor = conn.cursor()
        try:
            cursor.execute('''
                INSERT INTO alias_group (group_name, description, created_at, updated_at)
                VALUES (?, ?, ?, ?)
            ''', (group_name, description, datetime.now(), datetime.now()))
            conn.commit()
            return {'status': 'success', 'id': cursor.lastrowid}
        except sqlite3.IntegrityError:
            return {'status': 'error', 'message': '分组名称已存在'}
        finally:
            conn.close()
    
    def get_all_groups(self):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('SELECT id, group_name, description, created_at FROM alias_group ORDER BY created_at DESC')
        result = cursor.fetchall()
        conn.close()
        return [{'id': row[0], 'group_name': row[1], 'description': row[2], 'created_at': row[3]} for row in result]
    
    def get_group_by_id(self, group_id):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM alias_group WHERE id = ?', (group_id,))
        result = cursor.fetchone()
        conn.close()
        if result:
            return {
                'id': result[0],
                'group_name': result[1],
                'description': result[2],
                'created_at': result[3],
                'updated_at': result[4]
            }
        return None
    
    def update_group(self, group_id, group_name, description=None):
        conn = self._connect()
        cursor = conn.cursor()
        try:
            cursor.execute('''
                UPDATE alias_group SET group_name = ?, description = ?, updated_at = ?
                WHERE id = ?
            ''', (group_name, description, datetime.now(), group_id))
            conn.commit()
            return {'status': 'success', 'rows_affected': cursor.rowcount}
        except sqlite3.IntegrityError:
            return {'status': 'error', 'message': '分组名称已存在'}
        finally:
            conn.close()
    
    def delete_group(self, group_id):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM alias_group WHERE id = ?', (group_id,))
        conn.commit()
        rows_affected = cursor.rowcount
        conn.close()
        return {'status': 'success', 'rows_affected': rows_affected}
    
    def get_aliases_by_group(self, group_id):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('SELECT id, alias_name, description, dialect, created_at FROM sql_alias WHERE group_id = ? ORDER BY created_at DESC', (group_id,))
        result = cursor.fetchall()
        conn.close()
        return [{'id': row[0], 'alias_name': row[1], 'description': row[2], 'dialect': row[3], 'created_at': row[4]} for row in result]
    
    def update_alias_group(self, alias_id, group_id):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE sql_alias SET group_id = ?, updated_at = ?
            WHERE id = ?
        ''', (group_id, datetime.now(), alias_id))
        conn.commit()
        rows_affected = cursor.rowcount
        conn.close()
        return {'status': 'success', 'rows_affected': rows_affected}
    
    def get_all_aliases_with_group(self):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT sa.id, sa.alias_name, sa.description, sa.dialect, sa.group_id, ag.group_name, sa.created_at, sa.columns, sa.table_dependencies
            FROM sql_alias sa
            LEFT JOIN alias_group ag ON sa.group_id = ag.id
            ORDER BY sa.created_at DESC
        ''')
        result = cursor.fetchall()
        conn.close()
        return [{
            'id': row[0],
            'alias_name': row[1],
            'description': row[2],
            'dialect': row[3],
            'group_id': row[4],
            'group_name': row[5],
            'created_at': row[6],
            'columns': row[7] if len(result[0]) > 7 else '[]',
            'table_dependencies': row[8] if len(result[0]) > 8 else '[]'
        } for row in result]
    
    def get_alias_count_by_group(self, group_id):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) FROM sql_alias WHERE group_id = ?', (group_id,))
        result = cursor.fetchone()
        conn.close()
        return result[0] if result else 0