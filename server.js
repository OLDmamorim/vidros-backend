const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: '*', // Em produção, especificar o domínio do frontend
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // limite de 100 requests por IP
  message: 'Demasiados pedidos deste IP, tente novamente mais tarde'
});

app.use('/api/', limiter);

// Rotas
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const pedidosRoutes = require('./routes/pedidos');

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/pedidos', pedidosRoutes);

// Rota de teste
app.get('/', (req, res) => {
  res.json({ 
    message: 'API Portal de Vidros Especiais',
    version: '1.0.0',
    status: 'online'
  });
});

// Rota de health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Tratamento de erros 404
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Tratamento de erros gerais
app.use((err, req, res, next) => {
  console.error('Erro:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor a correr na porta ${PORT}`);
  console.log(`📡 Ambiente: ${process.env.NODE_ENV}`);
  console.log(`🌐 Escutando em 0.0.0.0:${PORT}`);
});

module.exports = app;
