import sqlite3
import os
path = 'weg_suggestions.db'
if not os.path.exists(path):
    print('DB_NOT_FOUND')
    raise SystemExit(1)
conn = sqlite3.connect(path)
cur = conn.cursor()
cur.execute('SELECT id, username, email, role FROM users WHERE username = ?', ('joao',))
row = cur.fetchone()
print('FOUND' if row else 'NOT_FOUND', row)
if row:
    cur.execute('UPDATE users SET role = ? WHERE username = ?', ('admin', 'joao'))
    conn.commit()
    print('UPDATED')
conn.close()
