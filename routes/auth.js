const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e password são obrigatórios' });
    }

    // Buscar utilizador
    const result = await pool.query(
      'SELECT u.*, l.name as loja_name FROM users u LEFT JOIN lojas l ON u.loja_id = l.id WHERE u.email = $1 AND u.active = true',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const user = result.rows[0];

    // Verificar password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // Gerar token JWT
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role,
        loja_id: user.loja_id 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        loja_id: user.loja_id,
        loja_name: user.loja_name
      }
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

// Obter dados do utilizador autenticado
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT u.id, u.email, u.name, u.role, u.loja_id, l.name as loja_name FROM users u LEFT JOIN lojas l ON u.loja_id = l.id WHERE u.id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilizador não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao obter dados do utilizador:', error);
    res.status(500).json({ error: 'Erro ao obter dados do utilizador' });
  }
});

// Logout (no lado do cliente, apenas remove o token)
router.post('/logout', authenticateToken, (req, res) => {
  res.json({ message: 'Logout efetuado com sucesso' });
});

module.exports = router;
