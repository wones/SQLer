@echo off
chcp 65001 >nul
echo ========================================
echo    SQL助手 打包工具
echo ========================================
echo.

echo 正在检查依赖...
pip install -r requirements.txt -q
echo 依赖检查完成
echo.

echo 正在打包应用，请稍候...
echo （首次打包可能需要几分钟，请耐心等待）
echo.

pyinstaller sql_assistant.spec --clean

echo.
echo ========================================
echo    打包完成！
echo ========================================
echo.
echo 打包后的文件位于: dist\SQL助手
echo 双击 "SQL助手.exe" 即可运行程序
echo.
echo 按任意键退出...
pause >nul
