const pool = require('./config/database');

async function addUsernameColumn() {
  try {
    console.log('🔄 Iniciando migração para adicionar campo username...');
    
    // 1. Verificar se a coluna username já existe
    const checkColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='users' AND column_name='username'
    `);
    
    if (checkColumn.rows.length > 0) {
      console.log('✅ Coluna username já existe!');
    } else {
      console.log('📝 Adicionando coluna username...');
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN username VARCHAR(255)
      `);
      console.log('✅ Coluna username adicionada!');
    }
    
    // 2. Preencher username com base no email existente (antes do @)
    console.log('📝 Preenchendo usernames para utilizadores existentes...');
    await pool.query(`
      UPDATE users 
      SET username = SPLIT_PART(email, '@', 1)
      WHERE username IS NULL
    `);
    console.log('✅ Usernames preenchidos!');
    
    // 3. Tornar username único e obrigatório
    console.log('📝 Adicionando constraint UNIQUE ao username...');
    await pool.query(`
      ALTER TABLE users 
      ALTER COLUMN username SET NOT NULL
    `);
    
    // Verificar se a constraint já existe antes de adicionar
    const checkConstraint = await pool.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name='users' AND constraint_name='users_username_key'
    `);
    
    if (checkConstraint.rows.length === 0) {
      await pool.query(`
        ALTER TABLE users 
        ADD CONSTRAINT users_username_key UNIQUE (username)
      `);
      console.log('✅ Constraint UNIQUE adicionada!');
    } else {
      console.log('✅ Constraint UNIQUE já existe!');
    }
    
    // 4. Tornar email opcional (remover NOT NULL)
    console.log('📝 Tornando email opcional...');
    await pool.query(`
      ALTER TABLE users 
      ALTER COLUMN email DROP NOT NULL
    `);
    console.log('✅ Email agora é opcional!');
    
    // 5. Criar índice para username
    console.log('📝 Criando índice para username...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)
    `);
    console.log('✅ Índice criado!');
    
    console.log('\n✅ Migração concluída com sucesso!');
    console.log('📊 Estrutura atualizada:');
    console.log('   - username: VARCHAR(255) UNIQUE NOT NULL (usado para login)');
    console.log('   - email: VARCHAR(255) UNIQUE (opcional)');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro na migração:', error);
    process.exit(1);
  }
}

addUsernameColumn();
