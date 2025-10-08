const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

// Todas as rotas requerem autenticação
router.use(authenticateToken);

// Listar pedidos (com filtros)
router.get('/', async (req, res) => {
  try {
    const { status, loja_id, data_inicio, data_fim } = req.query;
    const user = req.user;

    let query = `
      SELECT 
        p.*,
        l.name as loja_name,
        u.name as user_name,
        (SELECT COUNT(*) FROM pedido_fotos WHERE pedido_id = p.id) as total_fotos,
        (SELECT COUNT(*) FROM pedido_updates WHERE pedido_id = p.id) as total_updates,
        (SELECT MAX(created_at) FROM pedido_updates WHERE pedido_id = p.id) as ultima_atualizacao
      FROM pedidos p
      JOIN lojas l ON p.loja_id = l.id
      JOIN users u ON p.user_id = u.id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

    // Se for utilizador de loja, só vê os seus pedidos
    if (user.role === 'loja') {
      query += ` AND p.loja_id = $${paramCount}`;
      params.push(user.loja_id);
      paramCount++;
    }

    // Filtros opcionais
    if (status) {
      query += ` AND p.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (loja_id && user.role !== 'loja') {
      query += ` AND p.loja_id = $${paramCount}`;
      params.push(loja_id);
      paramCount++;
    }

    if (data_inicio) {
      query += ` AND p.created_at >= $${paramCount}`;
      params.push(data_inicio);
      paramCount++;
    }

    if (data_fim) {
      query += ` AND p.created_at <= $${paramCount}`;
      params.push(data_fim);
      paramCount++;
    }

    query += ' ORDER BY p.created_at DESC';

    const result = await pool.query(query, params);
    
    // Calcular tem_atualizacoes_novas para cada pedido
    const pedidosComNotificacao = result.rows.map(pedido => {
      let temAtualizacoesNovas = false;
      
      // Não piscar pedidos cancelados ou concluídos
      if (pedido.status === 'cancelado' || pedido.status === 'concluido') {
        return { ...pedido, tem_atualizacoes_novas: false };
      }
      
      if (user.role === 'loja') {
        // Para loja: piscar se há updates depois da última visualização
        if (pedido.ultima_atualizacao && pedido.ultima_visualizacao_loja) {
          temAtualizacoesNovas = new Date(pedido.ultima_atualizacao) > new Date(pedido.ultima_visualizacao_loja);
        } else if (pedido.ultima_atualizacao && !pedido.ultima_visualizacao_loja) {
          temAtualizacoesNovas = true;
        }
      } else if (user.role === 'departamento' || user.role === 'admin') {
        // Para departamento: piscar se há updates depois da última visualização do dept
        if (pedido.ultima_atualizacao && pedido.ultima_visualizacao_dept) {
          temAtualizacoesNovas = new Date(pedido.ultima_atualizacao) > new Date(pedido.ultima_visualizacao_dept);
        } else if (pedido.ultima_atualizacao && !pedido.ultima_visualizacao_dept) {
          temAtualizacoesNovas = true;
        }
      }
      
      return { ...pedido, tem_atualizacoes_novas: temAtualizacoesNovas };
    });
    
    res.json(pedidosComNotificacao);
  } catch (error) {
    console.error('Erro ao listar pedidos:', error);
    res.status(500).json({ error: 'Erro ao listar pedidos' });
  }
});

// Obter detalhes de um pedido
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    let query = `
      SELECT 
        p.*,
        l.name as loja_name,
        l.email as loja_email,
        l.phone as loja_phone,
        u.name as user_name
      FROM pedidos p
      JOIN lojas l ON p.loja_id = l.id
      JOIN users u ON p.user_id = u.id
      WHERE p.id = $1
    `;

    const params = [id];

    // Se for utilizador de loja, só vê os seus pedidos
    if (user.role === 'loja') {
      query += ' AND p.loja_id = $2';
      params.push(user.loja_id);
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    const pedido = result.rows[0];

    // Buscar fotos
    const fotosResult = await pool.query(
      'SELECT * FROM pedido_fotos WHERE pedido_id = $1 ORDER BY created_at ASC',
      [id]
    );
    pedido.fotos = fotosResult.rows;

    // Buscar updates
    let updatesQuery = `
      SELECT 
        pu.*,
        u.name as user_name,
        u.role as user_role
      FROM pedido_updates pu
      JOIN users u ON pu.user_id = u.id
      WHERE pu.pedido_id = $1
    `;

    // Se for utilizador de loja, vê updates visíveis OU as suas próprias mensagens
    if (user.role === 'loja') {
      updatesQuery += ' AND (pu.visivel_loja = true OR pu.user_id = $2)';
    }

    updatesQuery += ' ORDER BY pu.created_at ASC';

    const updatesParams = user.role === 'loja' ? [id, user.id] : [id];
    const updatesResult = await pool.query(updatesQuery, updatesParams);
    pedido.updates = updatesResult.rows;

    // Atualizar última visualização
    if (user.role === 'loja') {
      await pool.query(
        'UPDATE pedidos SET ultima_visualizacao_loja = NOW() WHERE id = $1',
        [id]
      );
    } else if (user.role === 'departamento' || user.role === 'admin') {
      await pool.query(
        'UPDATE pedidos SET ultima_visualizacao_dept = NOW() WHERE id = $1',
        [id]
      );
    }

    res.json(pedido);
  } catch (error) {
    console.error('Erro ao obter pedido:', error);
    res.status(500).json({ error: 'Erro ao obter pedido' });
  }
});

// Criar novo pedido (apenas loja)
router.post('/', authorizeRole('loja'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { matricula, marca_carro, modelo_carro, ano_carro, tipo_vidro, descricao, fotos } = req.body;
    const user = req.user;

    if (!matricula || !marca_carro || !modelo_carro || !tipo_vidro) {
      return res.status(400).json({ error: 'Matrícula, marca, modelo e tipo de vidro são obrigatórios' });
    }

    await client.query('BEGIN');

    // Criar pedido
    const pedidoResult = await client.query(
      'INSERT INTO pedidos (loja_id, user_id, matricula, marca_carro, modelo_carro, ano_carro, tipo_vidro, descricao, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [user.loja_id, user.id, matricula, marca_carro, modelo_carro, ano_carro, tipo_vidro, descricao, 'pendente']
    );

    const pedido = pedidoResult.rows[0];

    // Adicionar fotos se existirem
    if (fotos && Array.isArray(fotos) && fotos.length > 0) {
      for (const foto_url of fotos) {
        await client.query(
          'INSERT INTO pedido_fotos (pedido_id, foto_url) VALUES ($1, $2)',
          [pedido.id, foto_url]
        );
      }
    }

    await client.query('COMMIT');

    res.status(201).json(pedido);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao criar pedido:', error);
    res.status(500).json({ error: 'Erro ao criar pedido' });
  } finally {
    client.release();
  }
});

// Atualizar pedido (apenas departamento e admin)
router.put('/:id', authorizeRole('departamento', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, valor, custo, fornecedor } = req.body;

    // Construir query dinamicamente
    const updates = [];
    const params = [];
    let paramCount = 1;

    if (status) {
      updates.push(`status = $${paramCount}`);
      params.push(status);
      paramCount++;
    }

    if (valor !== undefined) {
      updates.push(`valor = $${paramCount}`);
      params.push(valor);
      paramCount++;
    }

    if (custo !== undefined) {
      updates.push(`custo = $${paramCount}`);
      params.push(custo);
      paramCount++;
    }

    if (fornecedor !== undefined) {
      updates.push(`fornecedor = $${paramCount}`);
      params.push(fornecedor);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    params.push(id);
    const query = `UPDATE pedidos SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar pedido:', error);
    res.status(500).json({ error: 'Erro ao atualizar pedido' });
  }
});
// Adicionar foto a um pedido
router.post('/:id/fotos', async (req, res) => {
  try {
    const { id } = req.params;
    const { foto_url } = req.body;
    const user = req.user;

    if (!foto_url) {
      return res.status(400).json({ error: 'URL da foto é obrigatória' });
    }

    // Verificar se o pedido existe e se o utilizador tem permissão
    let checkQuery = 'SELECT * FROM pedidos WHERE id = $1';
    const checkParams = [id];

    if (user.role === 'loja') {
      checkQuery += ' AND loja_id = $2';
      checkParams.push(user.loja_id);
    }

    const checkResult = await pool.query(checkQuery, checkParams);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    const result = await pool.query(
      'INSERT INTO pedido_fotos (pedido_id, foto_url) VALUES ($1, $2) RETURNING *',
      [id, foto_url]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao adicionar foto:', error);
    res.status(500).json({ error: 'Erro ao adicionar foto' });
  }
});

// Adicionar update a um pedido (loja, departamento e admin)
router.post('/:id/updates', authorizeRole('loja', 'departamento', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { mensagem, visivel_loja } = req.body;
    const user = req.user;

    if (!mensagem || !mensagem.trim()) {
      return res.status(400).json({ error: 'Mensagem é obrigatória' });
    }

    // Verificar se o pedido existe e se a loja tem permissão
    let checkQuery = 'SELECT * FROM pedidos WHERE id = $1';
    const checkParams = [id];
    
    if (user.role === 'loja') {
      checkQuery += ' AND loja_id = $2';
      checkParams.push(user.loja_id);
    }
    
    const checkResult = await pool.query(checkQuery, checkParams);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pedido não encontrado ou sem permissão' });
    }

    const result = await pool.query(
      'INSERT INTO pedido_updates (pedido_id, user_id, tipo, conteudo, visivel_loja) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [id, user.id, 'geral', mensagem, visivel_loja !== false]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao adicionar update:', error);
    res.status(500).json({ error: 'Erro ao adicionar update' });
  }
});

// Obter updates de um pedido
router.get('/:id/updates', async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    let query = `
      SELECT 
        pu.*,
        u.name as user_name
      FROM pedido_updates pu
      JOIN users u ON pu.user_id = u.id
      WHERE pu.pedido_id = $1
    `;

    // Se for utilizador de loja, só vê updates visíveis
    if (user.role === 'loja') {
      query += ' AND pu.visivel_loja = true';
    }

    query += ' ORDER BY pu.created_at DESC';

    const result = await pool.query(query, [id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao obter updates:', error);
    res.status(500).json({ error: 'Erro ao obter updates' });
  }
});

// Cancelar pedido
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    let query = 'UPDATE pedidos SET status = $1 WHERE id = $2';
    const params = ['cancelado', id];

    // Se for utilizador de loja, só pode cancelar os seus pedidos
    if (user.role === 'loja') {
      query += ' AND loja_id = $3';
      params.push(user.loja_id);
    }

    query += ' RETURNING *';

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    res.json({ message: 'Pedido cancelado com sucesso', pedido: result.rows[0] });
  } catch (error) {
    console.error('Erro ao cancelar pedido:', error);
    res.status(500).json({ error: 'Erro ao cancelar pedido' });
  }
});

module.exports = router;
