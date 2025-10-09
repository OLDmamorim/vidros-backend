const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../config/database');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

// Todas as rotas requerem autenticação e role admin
router.use(authenticateToken);
router.use(authorizeRole('admin'));

// ===== GESTÃO DE LOJAS =====

// Listar todas as lojas
router.get('/lojas', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM lojas ORDER BY name ASC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao listar lojas:', error);
    res.status(500).json({ error: 'Erro ao listar lojas' });
  }
});

// Criar nova loja
router.post('/lojas', async (req, res) => {
  try {
    const { name, address, phone, email } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Nome da loja é obrigatório' });
    }

    const result = await pool.query(
      'INSERT INTO lojas (name, address, phone, email) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, address, phone, email]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao criar loja:', error);
    res.status(500).json({ error: 'Erro ao criar loja' });
  }
});

// Atualizar loja
router.put('/lojas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address, phone, email, active } = req.body;

    const result = await pool.query(
      'UPDATE lojas SET name = COALESCE($1, name), address = COALESCE($2, address), phone = COALESCE($3, phone), email = COALESCE($4, email), active = COALESCE($5, active) WHERE id = $6 RETURNING *',
      [name, address, phone, email, active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Loja não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar loja:', error);
    res.status(500).json({ error: 'Erro ao atualizar loja' });
  }
});

// Eliminar loja
router.delete('/lojas/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar se existem utilizadores associados
    const usersCheck = await pool.query(
      'SELECT COUNT(*) as count FROM users WHERE loja_id = $1',
      [id]
    );

    if (parseInt(usersCheck.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Não é possível eliminar loja com utilizadores associados' });
    }

    const result = await pool.query(
      'DELETE FROM lojas WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Loja não encontrada' });
    }

    res.json({ message: 'Loja eliminada com sucesso' });
  } catch (error) {
    console.error('Erro ao eliminar loja:', error);
    res.status(500).json({ error: 'Erro ao eliminar loja' });
  }
});

// Reset de pedidos de uma loja
router.post('/lojas/:id/reset-pedidos', async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar se a loja existe
    const lojaCheck = await pool.query(
      'SELECT id, name FROM lojas WHERE id = $1',
      [id]
    );

    if (lojaCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Loja não encontrada' });
    }

    const loja = lojaCheck.rows[0];

    // Contar pedidos antes de eliminar
    const countResult = await pool.query(
      'SELECT COUNT(*) as count FROM pedidos WHERE loja_id = $1',
      [id]
    );
    const pedidosCount = parseInt(countResult.rows[0].count);

    // Eliminar todos os pedidos da loja (CASCADE vai eliminar fotos e updates)
    await pool.query(
      'DELETE FROM pedidos WHERE loja_id = $1',
      [id]
    );

    console.log(`✓ Reset de pedidos da loja ${loja.name} (ID: ${id}): ${pedidosCount} pedido(s) eliminado(s)`);

    res.json({ 
      message: `${pedidosCount} pedido(s) eliminado(s) da loja ${loja.name}`,
      loja_id: id,
      loja_name: loja.name,
      pedidos_eliminados: pedidosCount
    });
  } catch (error) {
    console.error('Erro ao fazer reset de pedidos da loja:', error);
    res.status(500).json({ error: 'Erro ao fazer reset de pedidos da loja' });
  }
});

// ===== GESTÃO DE UTILIZADORES =====

// Listar todos os utilizadores
router.get('/users', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT u.id, u.username, u.email, u.name, u.role, u.loja_id, u.active, u.created_at, l.name as loja_name FROM users u LEFT JOIN lojas l ON u.loja_id = l.id ORDER BY u.name ASC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao listar utilizadores:', error);
    res.status(500).json({ error: 'Erro ao listar utilizadores' });
  }
});

// Criar novo utilizador
router.post('/users', async (req, res) => {
  try {
    const { username, email, password, name, role, loja_id } = req.body;

    if (!username || !password || !name || !role) {
      return res.status(400).json({ error: 'Username, password, nome e role são obrigatórios' });
    }

    // Validar role
    if (!['admin', 'loja', 'departamento'].includes(role)) {
      return res.status(400).json({ error: 'Role inválido' });
    }

    // Se role é loja, loja_id é obrigatório
    if (role === 'loja' && !loja_id) {
      return res.status(400).json({ error: 'Loja é obrigatória para utilizadores do tipo loja' });
    }

    // Hash da password
    const password_hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash, name, role, loja_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, email, name, role, loja_id, active, created_at',
      [username, email || null, password_hash, name, role, role === 'loja' ? loja_id : null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      if (error.constraint === 'users_username_key') {
        return res.status(400).json({ error: 'Username já existe' });
      }
      return res.status(400).json({ error: 'Email já existe' });
    }
    console.error('Erro ao criar utilizador:', error);
    res.status(500).json({ error: 'Erro ao criar utilizador' });
  }
});

// Atualizar utilizador
router.put('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, password, name, role, loja_id, active } = req.body;

    let password_hash;
    if (password) {
      password_hash = await bcrypt.hash(password, 10);
    }

    const result = await pool.query(
      'UPDATE users SET username = COALESCE($1, username), email = COALESCE($2, email), password_hash = COALESCE($3, password_hash), name = COALESCE($4, name), role = COALESCE($5, role), loja_id = COALESCE($6, loja_id), active = COALESCE($7, active) WHERE id = $8 RETURNING id, username, email, name, role, loja_id, active',
      [username, email, password_hash, name, role, loja_id, active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilizador não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      if (error.constraint === 'users_username_key') {
        return res.status(400).json({ error: 'Username já existe' });
      }
      return res.status(400).json({ error: 'Email já existe' });
    }
    console.error('Erro ao atualizar utilizador:', error);
    res.status(500).json({ error: 'Erro ao atualizar utilizador' });
  }
});

// Eliminar utilizador
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Não permitir eliminar o próprio utilizador
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'Não pode eliminar o seu próprio utilizador' });
    }

    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilizador não encontrado' });
    }

    res.json({ message: 'Utilizador eliminado com sucesso' });
  } catch (error) {
    console.error('Erro ao eliminar utilizador:', error);
    res.status(500).json({ error: 'Erro ao eliminar utilizador' });
  }
});

// Reset password de utilizador
router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const { id } = req.params;
    const { new_password } = req.body;

    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ error: 'Password deve ter pelo menos 6 caracteres' });
    }

    // Hash da nova password
    const hashedPassword = await bcrypt.hash(new_password, 10);

    const result = await pool.query(
      'UPDATE users SET password = $1 WHERE id = $2 RETURNING id, name, email, role',
      [hashedPassword, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilizador não encontrado' });
    }

    res.json({ 
      message: 'Password alterada com sucesso',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Erro ao repor password:', error);
    res.status(500).json({ error: 'Erro ao repor password' });
  }
});

// ===== ESTATÍSTICAS =====

// Obter estatísticas gerais
router.get('/stats', async (req, res) => {
  try {
    const stats = {};

    // Total de lojas
    const lojasResult = await pool.query('SELECT COUNT(*) as count FROM lojas WHERE active = true');
    stats.total_lojas = parseInt(lojasResult.rows[0].count);

    // Total de utilizadores
    const usersResult = await pool.query('SELECT COUNT(*) as count FROM users WHERE active = true');
    stats.total_users = parseInt(usersResult.rows[0].count);

    // Total de pedidos
    const pedidosResult = await pool.query('SELECT COUNT(*) as count FROM pedidos');
    stats.total_pedidos = parseInt(pedidosResult.rows[0].count);

    // Pedidos por status
    const statusResult = await pool.query('SELECT status, COUNT(*) as count FROM pedidos GROUP BY status');
    stats.pedidos_por_status = statusResult.rows;

    res.json(stats);
  } catch (error) {
    console.error('Erro ao obter estatísticas:', error);
    res.status(500).json({ error: 'Erro ao obter estatísticas' });
  }
});

module.exports = router;
