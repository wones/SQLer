from .database import Database

# db实例现在通过Flask app.config动态创建，移除全局实例
__all__ = ['Database']