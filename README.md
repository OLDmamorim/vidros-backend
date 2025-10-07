# Portal de Vidros Especiais - Backend

Backend API para o sistema de gestão de pedidos de vidros especiais.

## Tecnologias

- Node.js + Express
- PostgreSQL (Neon)
- JWT Authentication
- bcrypt para passwords

## Variáveis de Ambiente

Configurar as seguintes variáveis no Railway:

```
DATABASE_URL=postgresql://neondb_owner:npg_57MSYNFuZbQJ@ep-solitary-frog-abp49014-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require
JWT_SECRET=vidros_especiais_secret_key_2024_secure_token
PORT=3001
NODE_ENV=production
```

## Deploy no Railway

1. Aceder a [railway.app](https://railway.app)
2. Criar novo projeto
3. Conectar ao repositório GitHub: `OLDmamorim/vidros-backend`
4. Adicionar as variáveis de ambiente acima
5. Deploy automático será feito

## Utilizadores de Teste

Após o deploy, pode usar estes utilizadores para testar:

- **Admin**: admin@vidros.pt / admin123
- **Loja**: loja@vidros.pt / loja123  
- **Departamento**: dept@vidros.pt / dept123

## Endpoints Principais

- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Dados do utilizador
- `GET /api/pedidos` - Listar pedidos
- `POST /api/pedidos` - Criar pedido
- `GET /api/admin/lojas` - Listar lojas (admin)
- `GET /api/admin/users` - Listar utilizadores (admin)
