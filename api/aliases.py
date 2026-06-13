from flask import Blueprint, request, jsonify, current_app
import json
import re

bp = Blueprint('aliases', __name__, url_prefix='/api/aliases')

def extract_table_dependencies(sql_content, db):
    dependencies = []
    
    all_aliases = db.get_all_alias_names()
    all_tables = {t['table_name'] for t in db.get_all_tables()}
    
    from_pattern = r'\bFROM\s+(.+?)(?=\s+JOIN|\s+WHERE|\s+GROUP|\s+ORDER|\s+LIMIT|$)'
    join_pattern = r'\b(JOIN|INNER JOIN|LEFT JOIN|RIGHT JOIN|OUTER JOIN)\s+(.+?)(?=\s+ON|\s+JOIN|\s+WHERE|\s+GROUP|\s+ORDER|\s+LIMIT|$)'
    
    def check_and_add_table(table_name):
        if table_name.lower() in ('select', 'from', 'where', 'group', 'order', 'having', 'limit', 'offset', 'as', 'on'):
            return
        
        actual_table_name = table_name.split('.')[-1]
        
        if actual_table_name in all_aliases:
            dependencies.append(actual_table_name)
        elif (actual_table_name + '_') in all_aliases:
            dependencies.append(actual_table_name + '_')
        elif actual_table_name in all_tables:
            dependencies.append(table_name)
        else:
            dependencies.append(table_name)
    
    from_match = re.search(from_pattern, sql_content, re.IGNORECASE | re.DOTALL)
    if from_match:
        from_content = from_match.group(1)
        table_items = _parse_table_list(from_content)
        for item in table_items:
            check_and_add_table(item['name'])
    
    join_matches = re.finditer(join_pattern, sql_content, re.IGNORECASE | re.DOTALL)
    for match in join_matches:
        join_content = match.group(2)
        table_items = _parse_table_list(join_content)
        for item in table_items:
            check_and_add_table(item['name'])
    
    return list(set(dependencies))

def _parse_table_list(tables_str):
    result = []
    parts = tables_str.split(',')
    for part in parts:
        part = part.strip()
        if not part:
            continue
        
        as_match = re.match(r'^([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\s+(?:AS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)$', part, re.IGNORECASE)
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

def extract_columns_from_sql(sql_content):
    columns = []
    
    select_pattern = r'SELECT\s+(.+?)(?=\s+FROM)'
    select_match = re.search(select_pattern, sql_content, re.IGNORECASE | re.DOTALL)
    if select_match:
        select_content = select_match.group(1)
        
        col_pattern = r'([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)(?=\s*,|\s+AS|\s+FROM|\s+WHERE|$)'
        raw_columns = re.findall(col_pattern, select_content)
        
        for col in raw_columns:
            if col.upper() not in ['DISTINCT', 'AS']:
                if '.' in col:
                    parts = col.split('.')
                    col_name = parts[-1]
                else:
                    col_name = col
                
                as_pattern = r'\b' + re.escape(col) + r'\s+(?:AS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\b'
                as_match = re.search(as_pattern, select_content, re.IGNORECASE)
                alias = as_match.group(1) if as_match else None
                
                if col_name not in [c['name'] for c in columns]:
                    columns.append({
                        'name': col_name,
                        'alias': alias,
                        'type': '',
                        'comment': ''
                    })
    
    return columns

@bp.route('/', methods=['GET'])
def get_all_aliases():
    db = current_app.config['db']
    aliases = db.get_all_aliases_with_group()
    for alias in aliases:
        if alias.get('columns'):
            try:
                alias['columns'] = json.loads(alias['columns'])
            except:
                alias['columns'] = []
        if alias.get('table_dependencies'):
            try:
                alias['table_dependencies'] = json.loads(alias['table_dependencies'])
            except:
                alias['table_dependencies'] = []
    return jsonify({'success': True, 'data': aliases})

@bp.route('/<int:alias_id>', methods=['GET'])
def get_alias(alias_id):
    db = current_app.config['db']
    alias = db.get_alias_by_id(alias_id)
    if alias:
        if alias.get('columns'):
            try:
                alias['columns'] = json.loads(alias['columns'])
            except:
                alias['columns'] = []
        if alias.get('table_dependencies'):
            try:
                alias['table_dependencies'] = json.loads(alias['table_dependencies'])
            except:
                alias['table_dependencies'] = []
        return jsonify({'success': True, 'data': alias})
    return jsonify({'success': False, 'error': '别名不存在'}), 404

@bp.route('/parse-sql', methods=['POST'])
def parse_sql_for_alias():
    db = current_app.config['db']
    data = request.get_json()
    sql_content = data.get('sql_content')
    
    if not sql_content:
        return jsonify({'success': False, 'error': 'SQL内容不能为空'}), 400
    
    columns = extract_columns_from_sql(sql_content)
    table_dependencies = extract_table_dependencies(sql_content, db)
    
    return jsonify({
        'success': True,
        'columns': columns,
        'table_dependencies': table_dependencies
    })

@bp.route('/', methods=['POST'])
def create_alias():
    db = current_app.config['db']
    data = request.get_json()
    alias_name = data.get('alias_name')
    sql_content = data.get('sql_content')
    description = data.get('description')
    dialect = data.get('dialect', 'mysql')
    group_id = data.get('group_id')
    columns = data.get('columns', [])
    table_dependencies = data.get('table_dependencies', [])
    
    if not alias_name or not sql_content:
        return jsonify({'success': False, 'error': '别名和SQL内容不能为空'}), 400
    
    if not table_dependencies:
        table_dependencies = extract_table_dependencies(sql_content, db)
    
    columns_json = json.dumps(columns) if isinstance(columns, list) else '[]'
    table_deps_json = json.dumps(table_dependencies) if isinstance(table_dependencies, list) else '[]'
    
    result = db.add_alias(alias_name, sql_content, description, dialect, columns_json, table_deps_json)
    if result['status'] == 'success':
        if group_id:
            db.update_alias_group(result['id'], group_id)
        return jsonify({'success': True, 'id': result['id']})
    return jsonify({'success': False, 'error': result['message']}), 400

@bp.route('/<int:alias_id>', methods=['PUT'])
def update_alias(alias_id):
    db = current_app.config['db']
    data = request.get_json()
    alias_name = data.get('alias_name')
    sql_content = data.get('sql_content')
    description = data.get('description')
    dialect = data.get('dialect', 'mysql')
    group_id = data.get('group_id')
    columns = data.get('columns', [])
    table_dependencies = data.get('table_dependencies', [])
    
    if not alias_name or not sql_content:
        return jsonify({'success': False, 'error': '别名和SQL内容不能为空'}), 400
    
    if not table_dependencies:
        table_dependencies = extract_table_dependencies(sql_content, db)
    
    columns_json = json.dumps(columns) if isinstance(columns, list) else '[]'
    table_deps_json = json.dumps(table_dependencies) if isinstance(table_dependencies, list) else '[]'
    
    result = db.update_alias(alias_id, alias_name, sql_content, description, dialect, columns_json, table_deps_json)
    if result['status'] == 'success':
        if result['rows_affected'] > 0:
            if group_id is not None:
                db.update_alias_group(alias_id, group_id)
            return jsonify({'success': True, 'message': '更新成功'})
        return jsonify({'success': False, 'error': '别名不存在'}), 404
    return jsonify({'success': False, 'error': result['message']}), 400

@bp.route('/<int:alias_id>', methods=['DELETE'])
def delete_alias(alias_id):
    db = current_app.config['db']
    result = db.delete_alias(alias_id)
    if result['rows_affected'] > 0:
        return jsonify({'success': True, 'message': '删除成功'})
    return jsonify({'success': False, 'error': '别名不存在'}), 404

@bp.route('/<int:alias_id>/group', methods=['PUT'])
def update_alias_group(alias_id):
    db = current_app.config['db']
    data = request.get_json()
    group_id = data.get('group_id')
    result = db.update_alias_group(alias_id, group_id)
    if result['rows_affected'] > 0:
        return jsonify({'success': True, 'message': '分组更新成功'})
    return jsonify({'success': False, 'error': '别名不存在'}), 404

@bp.route('/groups', methods=['GET'])
def get_all_groups():
    db = current_app.config['db']
    groups = db.get_all_groups()
    result = []
    for group in groups:
        count = db.get_alias_count_by_group(group['id'])
        result.append({
            'id': group['id'],
            'group_name': group['group_name'],
            'description': group['description'],
            'created_at': group['created_at'],
            'alias_count': count
        })
    return jsonify({'success': True, 'data': result})

@bp.route('/groups', methods=['POST'])
def create_group():
    db = current_app.config['db']
    data = request.get_json()
    group_name = data.get('group_name')
    description = data.get('description')
    
    if not group_name:
        return jsonify({'success': False, 'error': '分组名称不能为空'}), 400
    
    result = db.add_group(group_name, description)
    if result['status'] == 'success':
        return jsonify({'success': True, 'id': result['id']})
    return jsonify({'success': False, 'error': result['message']}), 400

@bp.route('/groups/<int:group_id>', methods=['GET'])
def get_group(group_id):
    db = current_app.config['db']
    group = db.get_group_by_id(group_id)
    if group:
        count = db.get_alias_count_by_group(group_id)
        group['alias_count'] = count
        return jsonify({'success': True, 'data': group})
    return jsonify({'success': False, 'error': '分组不存在'}), 404

@bp.route('/groups/<int:group_id>', methods=['PUT'])
def update_group(group_id):
    db = current_app.config['db']
    data = request.get_json()
    group_name = data.get('group_name')
    description = data.get('description')
    
    if not group_name:
        return jsonify({'success': False, 'error': '分组名称不能为空'}), 400
    
    result = db.update_group(group_id, group_name, description)
    if result['status'] == 'success':
        if result['rows_affected'] > 0:
            return jsonify({'success': True, 'message': '更新成功'})
        return jsonify({'success': False, 'error': '分组不存在'}), 404
    return jsonify({'success': False, 'error': result['message']}), 400

@bp.route('/groups/<int:group_id>', methods=['DELETE'])
def delete_group(group_id):
    db = current_app.config['db']
    aliases = db.get_aliases_by_group(group_id)
    result = db.delete_group(group_id)
    if result['rows_affected'] > 0:
        return jsonify({'success': True, 'message': '删除成功', 'deleted_alias_count': len(aliases)})
    return jsonify({'success': False, 'error': '分组不存在'}), 404

@bp.route('/groups/<int:group_id>/aliases', methods=['GET'])
def get_aliases_by_group(group_id):
    db = current_app.config['db']
    aliases = db.get_aliases_by_group(group_id)
    return jsonify({'success': True, 'data': aliases})

@bp.route('/search', methods=['GET'])
def search_aliases():
    """搜索别名"""
    db = current_app.config['db']
    query = request.args.get('q', '')
    
    if not query or len(query.strip()) == 0:
        return jsonify({'success': False, 'error': '请输入搜索关键词'}), 400
    
    query = query.strip()
    
    # 获取所有别名
    all_aliases = db.get_all_aliases()
    
    # 搜索匹配的别名（名称或描述包含关键词）
    results = []
    for alias in all_aliases:
        name = alias.get('alias_name', '')
        desc = alias.get('description', '')
        
        # 检查名称或描述是否包含搜索关键词（不区分大小写）
        if query.lower() in name.lower() or query.lower() in desc.lower():
            results.append({
                'id': alias.get('id'),
                'name': name,
                'description': desc,
                'sql_content': alias.get('sql_content'),
                'columns': alias.get('columns'),
                'table_dependencies': alias.get('table_dependencies'),
                'group_id': alias.get('group_id')
            })
    
    return jsonify({
        'success': True,
        'results': results,
        'count': len(results),
        'query': query
    })