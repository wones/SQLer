from flask import current_app
from .aliases import bp as aliases_bp
from .sql import bp as sql_bp
from .tables import bp as tables_bp
from .llm import bp as llm_bp

def register_blueprints(app):
    # 将数据库路径传递给各个blueprint
    @app.before_request
    def set_db_path():
        from storage.database import Database
        db_path = app.config.get('DATABASE_PATH')
        if db_path:
            current_app.config['db'] = Database(db_path)
        else:
            current_app.config['db'] = Database()

    app.register_blueprint(aliases_bp)
    app.register_blueprint(sql_bp)
    app.register_blueprint(tables_bp)
    app.register_blueprint(llm_bp)