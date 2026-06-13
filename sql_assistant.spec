# -*- mode: python ; coding: utf-8 -*-

import os
import sys

block_cipher = None
current_dir = os.path.dirname(os.path.abspath(SPEC))

a = Analysis(
    ['app.py'],
    pathex=[current_dir],
    binaries=[],
    datas=[
        ('static', 'static'),
    ],
    hiddenimports=[
        'flask',
        'flask_cors',
        'sqlparse',
        'dotenv',
        'requests',
        'api',
        'api.aliases',
        'api.llm',
        'api.sql',
        'api.tables',
        'completion',
        'completion.completer',
        'llm_integration',
        'llm_integration.client',
        'sql_converter',
        'sql_converter.converter',
        'sql_formatter',
        'sql_formatter.formatter',
        'sql_optimizer',
        'sql_optimizer.optimizer',
        'sql_optimizer.rules',
        'sql_parser',
        'sql_parser.parser',
        'sql_parser.resolver',
        'storage',
        'storage.database',
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    exclude_binaries=False,
    name='SQL助手',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
