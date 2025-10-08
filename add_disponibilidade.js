const pool = require('./config/database');

async function addDisponibilidadeColumn() {
  try {
    console.log('Verificando se a coluna disponibilidade existe...');
    
    // Verificar se a coluna já existe
    const checkColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='pedidos' AND column_name='disponibilidade'
    `);
    
    if (checkColumn.rows.length > 0) {
      console.log('✅ Coluna disponibilidade já existe!');
    } else {
      console.log('Adicionando coluna disponibilidade...');
      await pool.query(`
        ALTER TABLE pedidos 
        ADD COLUMN disponibilidade TEXT
      `);
      console.log('✅ Coluna disponibilidade adicionada com sucesso!');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
}

addDisponibilidadeColumn();
