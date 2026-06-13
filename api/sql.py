from flask import Blueprint, request, jsonify, current_app
from sql_parser.resolver import SQLResolver
from sql_parser.parser import SQLParser
from sql_optimizer.optimizer import SQLOptimizer
from sql_formatter.formatter import SQLFormatter
from sql_converter.converter import SQLConverter

bp = Blueprint('sql', __name__, url_prefix='/api/sql')

@bp.route('/resolve', methods=['POST'])
def resolve_sql():
    db = current_app.config['db']
    data = request.get_json()
    sql = data.get('sql', '')
    
    if not sql:
        return jsonify({'success': False, 'error': 'SQL不能为空'}), 400
    
    try:
        sql_resolver = SQLResolver(db)
        resolved = sql_resolver.resolve_aliases(sql)
        return jsonify({'success': True, 'sql': resolved})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@bp.route('/optimize', methods=['POST'])
def optimize_sql():
    db = current_app.config['db']
    data = request.get_json()
    sql = data.get('sql', '')
    
    if not sql:
        return jsonify({'success': False, 'error': 'SQL不能为空'}), 400
    
    try:
        sql_resolver = SQLResolver(db)
        resolved = sql_resolver.resolve_aliases(sql)
        sql_optimizer = SQLOptimizer()
        optimized = sql_optimizer.optimize(resolved)
        analysis = sql_optimizer.analyze(optimized)
        
        return jsonify({
            'success': True,
            'original': sql,
            'resolved': resolved,
            'optimized': optimized,
            'analysis': analysis
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@bp.route('/format', methods=['POST'])
def format_sql():
    data = request.get_json()
    sql = data.get('sql', '')
    style = data.get('style', 'standard')
    
    if not sql:
        return jsonify({'success': False, 'error': 'SQL不能为空'}), 400
    
    try:
        sql_formatter = SQLFormatter()
        formatted = sql_formatter.format_with_style(sql, style)
        return jsonify({'success': True, 'sql': formatted})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@bp.route('/convert', methods=['POST'])
def convert_sql():
    data = request.get_json()
    sql = data.get('sql', '')
    from_dialect = data.get('from_dialect', 'mysql')
    to_dialect = data.get('to_dialect', 'trino')
    
    if not sql:
        return jsonify({'success': False, 'error': 'SQL不能为空'}), 400
    
    try:
        sql_converter = SQLConverter()
        converted = sql_converter.convert(sql, from_dialect, to_dialect)
        return jsonify({'success': True, 'sql': converted})
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@bp.route('/complete', methods=['POST'])
def complete_sql():
    from completion.completer import SQLCompleter
    
    db = current_app.config['db']
    data = request.get_json()
    sql = data.get('sql', '')
    cursor_position = data.get('cursor_position', 0)
    
    try:
        sql_completer = SQLCompleter(db)
        completions = sql_completer.get_completions(sql, cursor_position)
        return jsonify({'success': True, 'completions': completions})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500