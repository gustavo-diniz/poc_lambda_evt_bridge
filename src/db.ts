import mysql from 'mysql2/promise'

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10,
  waitForConnections: true,
  timezone: '-03:00',
})

// Garante que NOW() sempre retorne horário de São Paulo (UTC-3),
// independente do timezone do servidor onde a aplicação estiver rodando.
// Brasil não usa mais horário de verão desde 2019, então -03:00 é fixo.
pool.on('connection', (conn) => {
  conn.query("SET time_zone = '-03:00'")
})
