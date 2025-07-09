const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'seu-segredo-super-secreto-para-jwt-mude-isto'; // IMPORTANTE: Mude isto para uma frase aleatória

// --- Middlewares ---
app.use(cors());
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

// --- Função de Inicialização do Banco de Dados ---
const initializeDatabase = async () => {
  const client = await pool.connect();
  try {
    // Tabela de Utilizadores
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'technician', 'viewer'))
      );
    `);
    // Tabela de Locais
    await client.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE
      );
    `);
    // Tabela de Relatórios
    await client.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        report_date DATE NOT NULL,
        location VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        comments TEXT,
        response_time VARCHAR(100),
        closure_time VARCHAR(100),
        created_by_user_id INTEGER REFERENCES users(id)
      );
    `);
    
    const res = await client.query('SELECT * FROM users');
    if (res.rowCount === 0) {
      const salt = await bcrypt.genSalt(10);
      const adminPasswordHash = await bcrypt.hash('admin', salt);
      await client.query(
        "INSERT INTO users (username, password_hash, role) VALUES ('admin', $1, 'admin')",
        [adminPasswordHash]
      );
      console.log("Utilizador 'admin' padrão criado com a senha 'admin'.");
    }
    console.log('Banco de dados verificado/inicializado com sucesso.');
  } catch (err) {
    console.error('Erro ao inicializar o banco de dados:', err);
  } finally {
    client.release();
  }
};

// --- Middleware de Autenticação e Autorização ---
const protect = (roles = []) => {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Acesso negado. Nenhum token fornecido.' });
    }

    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;

      if (roles.length > 0 && !roles.includes(req.user.role)) {
        return res.status(403).json({ message: 'Acesso negado. Permissões insuficientes.' });
      }

      next();
    } catch (error) {
      res.status(401).json({ message: 'Token inválido.' });
    }
  };
};

// --- ROTAS PÚBLICAS (NÃO PRECISAM DE LOGIN) ---

app.get('/api/public/reports', async (req, res) => {
    try {
        // Seleciona apenas os campos não sensíveis
        const result = await pool.query('SELECT id, report_date, location, description FROM reports ORDER BY report_date DESC, id DESC LIMIT 20');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ROTAS DE AUTENTICAÇÃO ---

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];

    if (!user) return res.status(401).json({ message: 'Credenciais inválidas.' });

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ message: 'Credenciais inválidas.' });

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ROTAS PRIVADAS (PRECISAM DE LOGIN) ---

app.get('/api/me', protect(), (req, res) => {
    res.json(req.user);
});

app.get('/api/reports', protect(), async (req, res) => {
    // Esta rota agora devolve todos os campos, pois está protegida
    const result = await pool.query('SELECT * FROM reports ORDER BY report_date DESC, id DESC');
    res.json(result.rows);
});

app.post('/api/reports', protect(['admin', 'technician']), async (req, res) => {
    const { report_date, location, description, comments, response_time, closure_time } = req.body;
    const created_by_user_id = req.user.id;
    const result = await pool.query(
      'INSERT INTO reports (report_date, location, description, comments, response_time, closure_time, created_by_user_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [report_date, location, description, comments, response_time, closure_time, created_by_user_id]
    );
    res.status(201).json(result.rows[0]);
});

// ... (outras rotas privadas de PUT, DELETE, etc.)

// --- Rotas de Frontend ---
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// A rota principal agora serve o dashboard público/privado
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Inicia o servidor
app.listen(PORT, async () => {
  console.log(`Servidor a correr na porta ${PORT}`);
  await initializeDatabase();
});
