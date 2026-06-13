import os
import sys

# 判断是否为打包后的程序
if getattr(sys, 'frozen', False):
    # 打包后的程序
    base_path = sys._MEIPASS
    app_path = os.path.dirname(sys.executable)
else:
    # 开发环境
    base_path = os.path.dirname(os.path.abspath(__file__))
    app_path = base_path

from flask import Flask, send_from_directory
from flask_cors import CORS
from api import register_blueprints

# 设置静态文件路径
static_folder = os.path.join(base_path, 'static')
app = Flask(__name__, static_folder=static_folder)
CORS(app)

# 设置数据库路径
app.config['DATABASE_PATH'] = os.path.join(app_path, 'instance', 'sql_assistant.db')

# 确保instance目录存在
instance_path = os.path.join(app_path, 'instance')
if not os.path.exists(instance_path):
    os.makedirs(instance_path)

register_blueprints(app)

@app.route('/')
def index():
    return send_from_directory(static_folder, 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory(static_folder, path)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)