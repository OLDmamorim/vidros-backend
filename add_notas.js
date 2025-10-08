const pool = require('./config/database');

async function addNotasColumn() {
  try {
    console.log('Verificando se a coluna notas existe...');
    
    // Verificar se a coluna já existe
    const checkColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='pedidos' AND column_name='notas'
    `);
    
    if (checkColumn.rows.length > 0) {
      console.log('✅ Coluna notas já existe!');
    } else {
      console.log('Adicionando coluna notas...');
      await pool.query(`
        ALTER TABLE pedidos 
        ADD COLUMN notas TEXT
      `);
      console.log('✅ Coluna notas adicionada com sucesso!');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
}

addNotasColumn();
