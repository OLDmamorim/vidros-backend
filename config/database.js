const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.on('connect', () => {
  console.log('✅ Conectado à base de dados PostgreSQL (Neon)');
});

pool.on('error', (err) => {
  console.error('❌ Erro na conexão à base de dados:', err);
});

module.exports = pool;
