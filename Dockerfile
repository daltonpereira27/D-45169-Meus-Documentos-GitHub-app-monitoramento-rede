const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const cors = require('cors'); // <-- ADICIONADO: Importa o pacote CORS

const app = express();
const PORT = 3000;

// --- Middlewares ---
app.use(cors()); // <-- ADICIONADO: Habilita o CORS para todas as origens
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuração da pool de conexões com o PostgreSQL.
const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
});

// Função para criar as tabelas se não existirem.
const createTables = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE
      );
      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        report_date DATE NOT NULL,
        location VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        comments TEXT,
        response_time VARCHAR(100),
        closure_time VARCHAR(100)
      );
    `);
    console.log('Tabelas verificadas/criadas com sucesso.');
  } catch (err) {
    console.error('Erro ao criar tabelas:', err);
  } finally {
    client.release();
  }
};

// --- API Endpoints para Locais ---
app.get('/api/locations', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM locations ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/locations', async (req, res) => {
  try {
    const { name } = req.body;
    const result = await pool.query('INSERT INTO locations (name) VALUES ($1) RETURNING *', [name]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API Endpoints para Relatórios ---
app.get('/api/reports', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM reports ORDER BY report_date DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reports', async (req, res) => {
  try {
    const { report_date, location, description, comments, response_time, closure_time } = req.body;
    const result = await pool.query(
      'INSERT INTO reports (report_date, location, description, comments, response_time, closure_time) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [report_date, location, description, comments, response_time, closure_time]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rota principal para servir o frontend.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Inicia o servidor.
app.listen(PORT, async () => {
  console.log(`Servidor a correr na porta ${PORT}`);
  await createTables(); // Garante que as tabelas existem ao iniciar.
});
