from flask import Blueprint, request, jsonify, current_app
from llm_integration import LLMClient

bp = Blueprint('llm', __name__, url_prefix='/api/llm')

@bp.route('/generate', methods=['POST'])
def generate_sql():
    db = current_app.config['db']
    data = request.get_json()
    prompt = data.get('prompt', '')
    config_id = data.get('config_id')
    
    if not prompt:
        return jsonify({'success': False, 'error': '提示词不能为空'}), 400
    
    client = LLMClient(db)
    result = client.generate_sql(prompt, config_id)
    if result['success']:
        return jsonify({'success': True, 'sql': result['sql']})
    return jsonify({'success': False, 'error': result['error']}), 500

@bp.route('/optimize', methods=['POST'])
def optimize_sql():
    db = current_app.config['db']
    data = request.get_json()
    sql = data.get('sql', '')
    config_id = data.get('config_id')
    
    if not sql:
        return jsonify({'success': False, 'error': 'SQL不能为空'}), 400
    
    client = LLMClient(db)
    result = client.optimize_sql(sql, config_id)
    if result['success']:
        return jsonify({'success': True, 'result': result['result']})
    return jsonify({'success': False, 'error': result['error']}), 500

@bp.route('/configs', methods=['GET'])
def get_all_configs():
    db = current_app.config['db']
    configs = db.get_all_llm_configs()
    for config in configs:
        if config.get('api_key'):
            config['api_key'] = '*' * min(len(config['api_key']), 8)
    return jsonify({'success': True, 'data': configs})

@bp.route('/config', methods=['GET'])
def get_config():
    db = current_app.config['db']
    config = db.get_llm_config()
    if config:
        config['api_key'] = '*' * min(len(config.get('api_key', '')), 8) if config.get('api_key') else ''
        return jsonify({'success': True, 'data': config})
    return jsonify({'success': True, 'data': {}})

@bp.route('/config/<int:config_id>', methods=['GET'])
def get_config_by_id(config_id):
    db = current_app.config['db']
    config = db.get_llm_config(config_id)
    if config:
        config['api_key'] = '*' * min(len(config.get('api_key', '')), 8) if config.get('api_key') else ''
        return jsonify({'success': True, 'data': config})
    return jsonify({'success': False, 'error': '配置不存在'}), 404

@bp.route('/config', methods=['POST'])
def save_config():
    db = current_app.config['db']
    data = request.get_json()
    config_id = data.get('id')
    config_name = data.get('config_name', '默认配置')
    api_key = data.get('api_key', '')
    model_name = data.get('model_name', 'gpt-4')
    api_base_url = data.get('api_base_url', 'https://api.openai.com/v1')
    max_tokens = int(data.get('max_tokens', 4096))
    is_default = data.get('is_default', False)
    
    if config_id:
        result = db.update_llm_config(config_id, config_name, api_key, model_name, api_base_url, max_tokens, is_default)
    else:
        result = db.save_llm_config(config_name, api_key, model_name, api_base_url, max_tokens, is_default)
    
    if result['status'] == 'success':
        return jsonify({'success': True, 'message': '配置保存成功', 'id': result.get('id', config_id)})
    return jsonify({'success': False, 'error': result.get('message', '保存失败')}), 500

@bp.route('/config/<int:config_id>', methods=['DELETE'])
def delete_config(config_id):
    db = current_app.config['db']
    result = db.delete_llm_config(config_id)
    if result['rows_affected'] > 0:
        return jsonify({'success': True, 'message': '删除成功'})
    return jsonify({'success': False, 'error': '配置不存在'}), 404

@bp.route('/config/<int:config_id>/default', methods=['PUT'])
def set_default_config(config_id):
    db = current_app.config['db']
    result = db.set_default_llm_config(config_id)
    return jsonify({'success': True, 'message': '已设为默认'})

@bp.route('/test', methods=['POST'])
def test_connection():
    db = current_app.config['db']
    client = LLMClient(db)
    result = client.test_connection()
    if result['success']:
        return jsonify({'success': True, 'message': result['message']})
    return jsonify({'success': False, 'error': result['error']}), 500