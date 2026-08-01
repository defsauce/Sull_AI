SELECT 'CREATE DATABASE identity'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'identity')\gexec
SELECT 'CREATE DATABASE tenant'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tenant')\gexec
SELECT 'CREATE DATABASE "user"'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'user')\gexec
SELECT 'CREATE DATABASE billing'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'billing')\gexec
SELECT 'CREATE DATABASE audit'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'audit')\gexec
SELECT 'CREATE DATABASE notification'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'notification')\gexec
SELECT 'CREATE DATABASE file'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'file')\gexec
SELECT 'CREATE DATABASE policy'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'policy')\gexec
SELECT 'CREATE DATABASE agent'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'agent')\gexec
SELECT 'CREATE DATABASE model'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'model')\gexec
SELECT 'CREATE DATABASE rag'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'rag')\gexec
SELECT 'CREATE DATABASE workflow'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'workflow')\gexec
SELECT 'CREATE DATABASE analytics'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'analytics')\gexec
SELECT 'CREATE DATABASE search'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'search')\gexec
