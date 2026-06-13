from .mysql import MYSQL_TO_TRINO, MYSQL_TO_DORIS
from .trino import TRINO_TO_MYSQL, TRINO_TO_DORIS
from .doris import DORIS_TO_MYSQL, DORIS_TO_TRINO

DIALECT_MAP = {
    ('mysql', 'trino'): MYSQL_TO_TRINO,
    ('mysql', 'doris'): MYSQL_TO_DORIS,
    ('trino', 'mysql'): TRINO_TO_MYSQL,
    ('trino', 'doris'): TRINO_TO_DORIS,
    ('doris', 'mysql'): DORIS_TO_MYSQL,
    ('doris', 'trino'): DORIS_TO_TRINO,
}

SUPPORTED_DIALECTS = ['mysql', 'trino', 'doris']