from flask import Blueprint, request, jsonify, current_app
import json

bp = Blueprint('tables', __name__, url_prefix='/api/tables')

@bp.route('/', methods=['GET'])
def get_all_tables():
    db = current_app.config['db']
    tables = db.get_all_tables_with_group()
    for table in tables:
        if table.get('columns'):
            try:
                table['columns'] = json.loads(table['columns'])
            except:
                table['columns'] = []
    return jsonify({'success': True, 'data': tables})

@bp.route('/<int:table_id>', methods=['GET'])
def get_table(table_id):
    db = current_app.config['db']
    table = db.get_table_by_id(table_id)
    if table:
        if table.get('columns'):
            try:
                table['columns'] = json.loads(table['columns'])
            except:
                table['columns'] = []
        return jsonify({'success': True, 'data': table})
    return jsonify({'success': False, 'error': '表不存在'}), 404

@bp.route('/columns/<table_name>', methods=['GET'])
def get_table_columns(table_name):
    db = current_app.config['db']
    columns = db.get_table_columns(table_name)
    return jsonify({'success': True, 'data': columns})

@bp.route('/', methods=['POST'])
def create_table():
    db = current_app.config['db']
    data = request.get_json()
    table_name = data.get('table_name')
    schema_name = data.get('schema_name')
    columns = data.get('columns', [])
    description = data.get('description')
    dialect = data.get('dialect', 'mysql')
    primary_key = data.get('primary_key')
    partition_info = data.get('partition_info')
    group_id = data.get('group_id')
    
    if not table_name:
        return jsonify({'success': False, 'error': '表名不能为空'}), 400
    
    columns_json = json.dumps(columns) if isinstance(columns, list) else '[]'
    
    result = db.add_table(table_name, schema_name, columns_json, description, dialect, primary_key, partition_info, group_id)
    if result['status'] == 'success':
        return jsonify({'success': True, 'id': result['id']})
    return jsonify({'success': False, 'error': '创建失败'}), 400

@bp.route('/<int:table_id>', methods=['PUT'])
def update_table(table_id):
    db = current_app.config['db']
    data = request.get_json()
    table_name = data.get('table_name')
    schema_name = data.get('schema_name')
    columns = data.get('columns', [])
    description = data.get('description')
    dialect = data.get('dialect', 'mysql')
    primary_key = data.get('primary_key')
    partition_info = data.get('partition_info')
    group_id = data.get('group_id')
    
    if not table_name:
        return jsonify({'success': False, 'error': '表名不能为空'}), 400
    
    columns_json = json.dumps(columns) if isinstance(columns, list) else '[]'
    
    result = db.update_table(table_id, table_name, schema_name, columns_json, description, dialect, primary_key, partition_info, group_id)
    if result['rows_affected'] > 0:
        return jsonify({'success': True, 'message': '更新成功'})
    return jsonify({'success': False, 'error': '表不存在'}), 404

@bp.route('/groups', methods=['GET'])
def get_all_groups():
    db = current_app.config['db']
    groups = db.get_all_table_groups()
    return jsonify({'success': True, 'data': groups})

@bp.route('/groups', methods=['POST'])
def create_group():
    db = current_app.config['db']
    data = request.get_json()
    group_name = data.get('group_name')
    description = data.get('description')
    
    if not group_name:
        return jsonify({'success': False, 'error': '分组名不能为空'}), 400
    
    result = db.add_table_group(group_name, description)
    if result['status'] == 'success':
        return jsonify({'success': True, 'id': result['id']})
    return jsonify({'success': False, 'error': result.get('message', '创建失败')}), 400

@bp.route('/groups/<int:group_id>', methods=['PUT'])
def update_group(group_id):
    db = current_app.config['db']
    data = request.get_json()
    group_name = data.get('group_name')
    description = data.get('description')
    
    if not group_name:
        return jsonify({'success': False, 'error': '分组名不能为空'}), 400
    
    result = db.update_table_group(group_id, group_name, description)
    if result['status'] == 'success' and result['rows_affected'] > 0:
        return jsonify({'success': True, 'message': '更新成功'})
    return jsonify({'success': False, 'error': result.get('message', '分组不存在')}), 404

@bp.route('/groups/<int:group_id>', methods=['DELETE'])
def delete_group(group_id):
    db = current_app.config['db']
    tables = db.get_tables_by_group(group_id)
    result = db.delete_table_group(group_id)
    if result['rows_affected'] > 0:
        return jsonify({'success': True, 'message': '删除成功', 'deleted_table_count': len(tables)})
    return jsonify({'success': False, 'error': '分组不存在'}), 404

@bp.route('/<int:table_id>/move', methods=['POST'])
def move_table_to_group(table_id):
    db = current_app.config['db']
    data = request.get_json()
    group_id = data.get('group_id')
    
    result = db.update_table_group_id(table_id, group_id)
    if result['rows_affected'] > 0:
        return jsonify({'success': True, 'message': '移动成功'})
    return jsonify({'success': False, 'error': '表不存在'}), 404

@bp.route('/<int:table_id>', methods=['DELETE'])
def delete_table(table_id):
    db = current_app.config['db']
    result = db.delete_table(table_id)
    if result['rows_affected'] > 0:
        return jsonify({'success': True, 'message': '删除成功'})
    return jsonify({'success': False, 'error': '表不存在'}), 404

@bp.route('/search', methods=['GET'])
def search_tables():
    """搜索基础表"""
    db = current_app.config['db']
    query = request.args.get('q', '')
    
    if not query or len(query.strip()) == 0:
        return jsonify({'success': False, 'error': '请输入搜索关键词'}), 400
    
    query = query.strip()
    
    # 获取所有表
    all_tables = db.get_all_tables_with_group()
    
    # 搜索匹配的表（名称或描述包含关键词）
    results = []
    for table in all_tables:
        name = table.get('table_name', '')
        desc = table.get('description', '')
        
        # 解析columns
        columns = table.get('columns')
        if columns:
            try:
                columns = json.loads(columns)
            except:
                columns = []
        
        # 检查名称或描述是否包含搜索关键词（不区分大小写）
        if query.lower() in name.lower() or query.lower() in desc.lower():
            results.append({
                'id': table.get('id'),
                'name': name,
                'description': desc,
                'columns': columns,
                'primary_key': table.get('primary_key'),
                'group_id': table.get('group_id')
            })
    
    return jsonify({
        'success': True,
        'results': results,
        'count': len(results),
        'query': query
    })